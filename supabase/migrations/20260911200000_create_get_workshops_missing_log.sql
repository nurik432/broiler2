-- supabase/migrations/20260911200000_create_get_workshops_missing_log.sql
-- Backs the daily-log-reminder Edge Function: returns, for every active
-- workshop with an active (non-summary) batch, one row per workshop that has
-- no daily_logs entry for the given date. Spans all users by design (the
-- reminder job needs to notify every affected owner in one pass) — callable
-- only by service_role, never anon/authenticated.

CREATE OR REPLACE FUNCTION public.get_workshops_missing_log(target_date date)
RETURNS TABLE (
    user_id uuid,
    workshop_id uuid,
    workshop_name text,
    batch_name text
)
LANGUAGE sql
STABLE
AS $$
    SELECT w.user_id, w.id, w.name, b.batch_name
    FROM public.workshops w
    JOIN public.broiler_batches b
        ON b.workshop_id = w.id
        AND b.is_active = true
        AND (b.is_summary = false OR b.is_summary IS NULL)
    WHERE w.is_active = true
      AND NOT EXISTS (
          SELECT 1 FROM public.daily_logs dl
          WHERE dl.batch_id = b.id AND dl.log_date = target_date
      );
$$;

REVOKE ALL ON FUNCTION public.get_workshops_missing_log(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_workshops_missing_log(date) TO service_role;
