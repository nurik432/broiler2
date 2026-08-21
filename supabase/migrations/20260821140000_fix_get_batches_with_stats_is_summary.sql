-- supabase/migrations/20260821140000_fix_get_batches_with_stats_is_summary.sql
-- Fix round 1 for Task 7 of docs/superpowers/plans/2026-08-21-active-summary-cost-profit.md
--
-- Task 7 (src/pages/BatchesPage.jsx) added a conditional so the is_summary
-- batch shows an "Отчет" link instead of the "Завершить" button in the
-- active-batches view. But the active-batches list comes from the RPC
-- public.get_batches_with_stats() (baseline migration
-- 20260101000000_baseline_from_schema_sql.sql), whose RETURNS TABLE /
-- SELECT never included is_summary at all. Every batch object the page
-- receives therefore has batch.is_summary === undefined (falsy) regardless
-- of the real database value, so the new "Отчет" link is dead code — and,
-- incidentally, the pre-existing "Автоматическая" badge and workshop-selector
-- hiding in BatchesPage.jsx were silently broken too.
--
-- This migration adds is_summary to both RETURNS TABLE and the SELECT list,
-- keeping every other column, type, and the WHERE/JOIN/ORDER BY logic
-- exactly as in the baseline.
--
-- Postgres does not allow CREATE OR REPLACE FUNCTION to change the row type
-- defined by OUT parameters (SQLSTATE 42P13), so the old signature must be
-- dropped before the new one is created (same technique as
-- 20260821130000_fix_get_feed_deliveries_columns.sql).

DROP FUNCTION IF EXISTS public.get_batches_with_stats();

CREATE FUNCTION public.get_batches_with_stats() RETURNS TABLE(
    id uuid,
    batch_name text,
    initial_quantity integer,
    start_date date,
    is_active boolean,
    user_id uuid,
    total_mortality bigint,
    current_quantity bigint,
    is_summary boolean
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT b.id, b.batch_name, b.initial_quantity, b.start_date, b.is_active, b.user_id,
        COALESCE(dl.total_mortality, 0) as total_mortality,
        b.initial_quantity - COALESCE(dl.total_mortality, 0) as current_quantity,
        b.is_summary
    FROM broiler_batches AS b
    LEFT JOIN (
        SELECT batch_id, SUM(mortality) AS total_mortality
        FROM daily_logs GROUP BY batch_id
    ) AS dl ON b.id = dl.batch_id
    WHERE b.user_id = auth.uid() AND b.is_active = true
    ORDER BY b.start_date DESC;
END;
$$;

-- DROP FUNCTION resets privileges, so re-grant ownership/EXECUTE to match the
-- baseline (supabase/migrations/20260101000000_baseline_from_schema_sql.sql)
-- — without these, PostgREST callers (anon/authenticated via the RPC
-- endpoint) would lose access to this function.
ALTER FUNCTION public.get_batches_with_stats() OWNER TO postgres;
GRANT ALL ON FUNCTION public.get_batches_with_stats() TO anon;
GRANT ALL ON FUNCTION public.get_batches_with_stats() TO authenticated;
GRANT ALL ON FUNCTION public.get_batches_with_stats() TO service_role;
