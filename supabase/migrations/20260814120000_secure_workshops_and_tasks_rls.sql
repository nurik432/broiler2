-- ============================================================
-- Migration: Secure workshops and tasks with per-user RLS
-- ============================================================
-- Closes a multi-tenant isolation gap: workshops and tasks had
-- USING (true) policies, so any authenticated user could read/write
-- any other user's workshops and tasks. This brings them in line with
-- every other table (broiler_batches, employees, ...), which already
-- scope rows via auth.uid() = user_id.
--
-- NOTE: when this was first applied, the live database already had
-- user_id (NOT NULL) and correct per-user policies on both tables,
-- applied out-of-band and undocumented in this repo. This migration
-- is written idempotently so it converges any environment (including
-- a fresh one built from scratch) to that same state.

-- 1. Ensure user_id column exists (no-op if already present).
ALTER TABLE public.workshops ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

-- 2. Backfill: infer a workshop's owner from the earliest batch that
-- references it (broiler_batches.user_id is already trustworthy).
UPDATE public.workshops w
SET user_id = sub.user_id
FROM (
    SELECT DISTINCT ON (workshop_id) workshop_id, user_id
    FROM public.broiler_batches
    WHERE workshop_id IS NOT NULL AND user_id IS NOT NULL
    ORDER BY workshop_id, created_at ASC NULLS LAST
) sub
WHERE w.id = sub.workshop_id AND w.user_id IS NULL;

-- 3. Backfill tasks from their linked batch, falling back to their workshop.
UPDATE public.tasks t
SET user_id = COALESCE(
    (SELECT b.user_id FROM public.broiler_batches b WHERE b.id = t.batch_id),
    (SELECT w.user_id FROM public.workshops w WHERE w.id = t.workshop_id)
)
WHERE t.user_id IS NULL;

-- 4. Warn (does not block the migration) if any rows remain unowned —
-- those would become invisible to everyone under the new policies and
-- need a manual UPDATE to assign the correct owner. Runs before the
-- NOT NULL constraint below so it never blocks on unresolved orphans.
DO $$
DECLARE
    orphan_workshops int;
    orphan_tasks int;
BEGIN
    SELECT count(*) INTO orphan_workshops FROM public.workshops WHERE user_id IS NULL;
    SELECT count(*) INTO orphan_tasks FROM public.tasks WHERE user_id IS NULL;
    IF orphan_workshops > 0 OR orphan_tasks > 0 THEN
        RAISE NOTICE 'Warning: % workshops and % tasks still have NULL user_id after backfill — they will be invisible to everyone under the new RLS policies. Assign an owner manually.', orphan_workshops, orphan_tasks;
    END IF;
END $$;

ALTER TABLE public.workshops ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.tasks ALTER COLUMN user_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_workshops_user_id ON public.workshops(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON public.tasks(user_id);

-- 5. Replace the open policy with per-owner isolation. workshops uses
-- one policy per command (matches broiler_batches' style), tasks uses
-- a single ALL policy (matches employees' style).
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.workshops;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.tasks;

DROP POLICY IF EXISTS "user_can_manage_own_workshops" ON public.workshops;

DROP POLICY IF EXISTS "user_can_create_own_workshops" ON public.workshops;
CREATE POLICY "user_can_create_own_workshops" ON public.workshops
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_can_read_own_workshops" ON public.workshops;
CREATE POLICY "user_can_read_own_workshops" ON public.workshops
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_can_update_own_workshops" ON public.workshops;
CREATE POLICY "user_can_update_own_workshops" ON public.workshops
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_can_delete_own_workshops" ON public.workshops;
CREATE POLICY "user_can_delete_own_workshops" ON public.workshops
    FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_can_manage_own_tasks" ON public.tasks;
CREATE POLICY "user_can_manage_own_tasks" ON public.tasks
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
