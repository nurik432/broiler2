-- supabase/migrations/20260821130000_fix_get_feed_deliveries_columns.sql
-- Fix round 1 for Task 1 of docs/superpowers/plans/2026-08-21-active-summary-cost-profit.md
--
-- Task 1 (20260821120000_add_cost_columns.sql) added 4 columns to
-- public.feed_deliveries (price_per_kg, amount, transaction_type, company).
-- The pre-existing RPC public.get_feed_deliveries() used `RETURN QUERY SELECT
-- fd.*, ...`, which matches columns positionally. Adding columns to
-- feed_deliveries shifted fd.* to 11 columns, while RETURNS TABLE still only
-- declared 9 — breaking every call to the RPC with a Postgres 42804 error
-- ("structure of query does not match function result type").
--
-- This migration fixes the mismatch by:
--   1. Declaring the 4 new columns in RETURNS TABLE so callers (FeedPage.jsx,
--      which reads d.amount) can access them.
--   2. Replacing `fd.*` with an explicit column list so a future
--      ALTER TABLE ADD COLUMN on feed_deliveries cannot silently break this
--      function's positional matching again.
--
-- Postgres does not allow CREATE OR REPLACE FUNCTION to change the row type
-- defined by OUT parameters (SQLSTATE 42P13), so the old signature must be
-- dropped before the new one is created.

DROP FUNCTION IF EXISTS public.get_feed_deliveries();

CREATE FUNCTION public.get_feed_deliveries()
RETURNS TABLE(
    id uuid,
    user_id uuid,
    delivery_date date,
    feed_type text,
    quantity_kg numeric,
    created_at timestamp with time zone,
    batch_id uuid,
    batch_name text,
    batch_is_active boolean,
    price_per_kg numeric,
    amount numeric,
    transaction_type text,
    company text
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY SELECT
        fd.id, fd.user_id, fd.delivery_date, fd.feed_type, fd.quantity_kg,
        fd.created_at, fd.batch_id, b.batch_name, b.is_active as batch_is_active,
        fd.price_per_kg, fd.amount, fd.transaction_type, fd.company
    FROM feed_deliveries AS fd
    LEFT JOIN broiler_batches AS b ON fd.batch_id = b.id
    WHERE fd.user_id = auth.uid()
    ORDER BY fd.delivery_date DESC, fd.created_at DESC NULLS LAST;
END;
$$;

-- DROP FUNCTION resets privileges, so re-grant EXECUTE to match the baseline
-- (supabase/migrations/20260101000000_baseline_from_schema_sql.sql) — without
-- these, PostgREST callers (anon/authenticated via the RPC endpoint) would
-- lose access to this function.
ALTER FUNCTION public.get_feed_deliveries() OWNER TO postgres;
GRANT ALL ON FUNCTION public.get_feed_deliveries() TO anon;
GRANT ALL ON FUNCTION public.get_feed_deliveries() TO authenticated;
GRANT ALL ON FUNCTION public.get_feed_deliveries() TO service_role;
