-- ============================================================
-- Migration: Secure workshops and tasks with per-user RLS
-- ============================================================
-- Closes a multi-tenant isolation gap: workshops and tasks had
-- USING (true) policies, so any authenticated user could read/write
-- any other user's workshops and tasks. This brings them in line with
-- every other table (broiler_batches, employees, ...), which already
-- scope rows via auth.uid() = user_id.

-- 1. Ensure user_id column exists (no-op if it was already added
-- manually, as it was here — see commit 1371892).
ALTER TABLE public.workshops ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_workshops_user_id ON public.workshops(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON public.tasks(user_id);

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

-- 4. Replace the open policy with per-owner isolation.
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.workshops;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.tasks;

CREATE POLICY "user_can_manage_own_workshops" ON public.workshops
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_can_manage_own_tasks" ON public.tasks
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 5. Warn (does not block the migration) if any rows remain unowned —
-- those would become invisible to everyone under the new policy and
-- need a manual UPDATE to assign the correct owner.
DO $$
DECLARE
    orphan_workshops int;
    orphan_tasks int;
BEGIN
    SELECT count(*) INTO orphan_workshops FROM public.workshops WHERE user_id IS NULL;
    SELECT count(*) INTO orphan_tasks FROM public.tasks WHERE user_id IS NULL;
    IF orphan_workshops > 0 OR orphan_tasks > 0 THEN
        RAISE NOTICE 'Warning: % workshops and % tasks still have NULL user_id after backfill — they will be invisible to everyone under the new RLS policy. Assign an owner manually.', orphan_workshops, orphan_tasks;
    END IF;
END $$;
