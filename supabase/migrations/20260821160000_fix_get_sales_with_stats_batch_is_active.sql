-- Migration: fix get_sales_with_stats() missing batch_is_active
-- SalesPage.jsx filters out any sale whose batch is archived via
-- `!sale.batch_id || sale.batch_is_active === true`, but this RPC never
-- returned batch_is_active at all — so the field was always undefined,
-- and the filter silently hid EVERY sale that had any batch attached
-- (active or not), unless "Показать продажи архивных партий" was checked.
--
-- RETURNS TABLE column set is changing, so this needs DROP + CREATE
-- (CREATE OR REPLACE FUNCTION cannot change a function's output row type),
-- same as the get_feed_deliveries/get_batches_with_stats fixes earlier in
-- this plan.

DROP FUNCTION IF EXISTS public.get_sales_with_stats();

CREATE FUNCTION public.get_sales_with_stats()
RETURNS TABLE(
    id uuid,
    sale_date date,
    customer_name text,
    weight_kg numeric,
    price_per_kg numeric,
    created_at timestamp with time zone,
    batch_id uuid,
    batch_name text,
    batch_is_active boolean,
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
        s.customer_name,
        s.weight_kg,
        s.price_per_kg,
        s.created_at,
        s.batch_id,
        b.batch_name,
        b.is_active AS batch_is_active,
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
