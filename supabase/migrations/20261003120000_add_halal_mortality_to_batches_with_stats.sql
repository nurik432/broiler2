-- supabase/migrations/20261003120000_add_halal_mortality_to_batches_with_stats.sql
--
-- The batches list (src/pages/BatchesPage.jsx, src/mobile/pages/MobileBatchesPage.jsx)
-- showed a single "Общий падеж" number from total_mortality, so natural
-- mortality and halal slaughter were collapsed into one figure. Both list
-- RPCs now also return total_mortality_halal (SUM(daily_logs.mortality_halal)),
-- and the client derives natural mortality as total_mortality - total_mortality_halal
-- — the same rule as splitMortality() in src/utils/normComparison.js, so legacy
-- logs that only have `mortality` filled count as natural.
--
-- Every other column, type and the WHERE/JOIN/ORDER BY logic is unchanged
-- (get_batches_with_stats as of 20260821140000_fix_get_batches_with_stats_is_summary.sql,
-- get_archived_batches_with_stats as of the baseline). The new column is
-- appended last, so existing callers are unaffected.
--
-- Postgres does not allow CREATE OR REPLACE FUNCTION to change the row type
-- defined by OUT parameters (SQLSTATE 42P13), so the old signatures must be
-- dropped before the new ones are created.

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
    is_summary boolean,
    total_mortality_halal bigint
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT b.id, b.batch_name, b.initial_quantity, b.start_date, b.is_active, b.user_id,
        COALESCE(dl.total_mortality, 0) as total_mortality,
        b.initial_quantity - COALESCE(dl.total_mortality, 0) as current_quantity,
        b.is_summary,
        COALESCE(dl.total_mortality_halal, 0) as total_mortality_halal
    FROM broiler_batches AS b
    LEFT JOIN (
        SELECT batch_id,
            SUM(mortality) AS total_mortality,
            SUM(mortality_halal) AS total_mortality_halal
        FROM daily_logs GROUP BY batch_id
    ) AS dl ON b.id = dl.batch_id
    WHERE b.user_id = auth.uid() AND b.is_active = true
    ORDER BY b.start_date DESC;
END;
$$;

DROP FUNCTION IF EXISTS public.get_archived_batches_with_stats();

CREATE FUNCTION public.get_archived_batches_with_stats() RETURNS TABLE(
    id uuid,
    batch_name text,
    initial_quantity integer,
    start_date date,
    is_active boolean,
    user_id uuid,
    total_mortality bigint,
    current_quantity bigint,
    total_mortality_halal bigint
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT b.id, b.batch_name, b.initial_quantity, b.start_date, b.is_active, b.user_id,
        COALESCE(dl.total_mortality, 0) as total_mortality,
        b.initial_quantity - COALESCE(dl.total_mortality, 0) as current_quantity,
        COALESCE(dl.total_mortality_halal, 0) as total_mortality_halal
    FROM broiler_batches AS b
    LEFT JOIN (
        SELECT batch_id,
            SUM(mortality) AS total_mortality,
            SUM(mortality_halal) AS total_mortality_halal
        FROM daily_logs GROUP BY batch_id
    ) AS dl ON b.id = dl.batch_id
    WHERE b.user_id = auth.uid() AND b.is_active = false
    ORDER BY b.start_date DESC;
END;
$$;

-- DROP FUNCTION resets privileges, so re-grant ownership/EXECUTE to match the
-- baseline — without these, PostgREST callers would lose access.
ALTER FUNCTION public.get_batches_with_stats() OWNER TO postgres;
GRANT ALL ON FUNCTION public.get_batches_with_stats() TO anon;
GRANT ALL ON FUNCTION public.get_batches_with_stats() TO authenticated;
GRANT ALL ON FUNCTION public.get_batches_with_stats() TO service_role;

ALTER FUNCTION public.get_archived_batches_with_stats() OWNER TO postgres;
GRANT ALL ON FUNCTION public.get_archived_batches_with_stats() TO anon;
GRANT ALL ON FUNCTION public.get_archived_batches_with_stats() TO authenticated;
GRANT ALL ON FUNCTION public.get_archived_batches_with_stats() TO service_role;

-- PostgREST caches function signatures; reload so the new column is served
-- immediately.
NOTIFY pgrst, 'reload schema';
