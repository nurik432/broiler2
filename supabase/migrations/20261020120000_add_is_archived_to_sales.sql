-- supabase/migrations/20261020120000_add_is_archived_to_sales.sql
-- Adds a per-sale archive flag (independent of the batch's is_active) and
-- exposes it from get_sales_with_stats(). RETURNS TABLE column set is
-- changing, so DROP + CREATE (CREATE OR REPLACE cannot change a function's
-- output row type). Preserves customer_id/batch_is_active from 20260821190000.

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

DROP FUNCTION IF EXISTS public.get_sales_with_stats();

CREATE FUNCTION public.get_sales_with_stats()
RETURNS TABLE(
    id uuid,
    sale_date date,
    customer_id uuid,
    customer_name text,
    weight_kg numeric,
    price_per_kg numeric,
    created_at timestamp with time zone,
    batch_id uuid,
    batch_name text,
    batch_is_active boolean,
    is_archived boolean,
    total_amount numeric,
    total_paid numeric,
    balance numeric
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        s.id,
        s.sale_date,
        c.id AS customer_id,
        c.full_name AS customer_name,
        s.weight_kg,
        s.price_per_kg,
        s.created_at,
        s.batch_id,
        b.batch_name,
        b.is_active AS batch_is_active,
        s.is_archived,
        (s.weight_kg * s.price_per_kg) as total_amount,
        COALESCE(p.total_paid, 0) as total_paid,
        (s.weight_kg * s.price_per_kg) - COALESCE(p.total_paid, 0) as balance
    FROM
        sales AS s
    LEFT JOIN (
        SELECT sale_id, SUM(amount) as total_paid
        FROM payments GROUP BY sale_id
    ) AS p ON s.id = p.sale_id
    LEFT JOIN broiler_batches AS b ON s.batch_id = b.id
    LEFT JOIN customers AS c ON s.customer_id = c.id
    WHERE
        s.user_id = auth.uid()
    ORDER BY
        s.sale_date DESC, s.created_at DESC;
END;
$$;

ALTER FUNCTION public.get_sales_with_stats() OWNER TO postgres;
GRANT ALL ON FUNCTION public.get_sales_with_stats() TO anon;
GRANT ALL ON FUNCTION public.get_sales_with_stats() TO authenticated;
GRANT ALL ON FUNCTION public.get_sales_with_stats() TO service_role;
