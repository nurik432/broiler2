-- supabase/migrations/20260821120100_add_get_active_summary_report.sql
-- RPC for the summary batch's report: revenue/cost across all currently
-- active batches, plus any record not attributed to a specific batch
-- (general/stock purchases). Archived batches and their records are
-- excluded entirely.
-- Part of: docs/superpowers/specs/2026-08-21-active-summary-cost-profit-design.md

CREATE OR REPLACE FUNCTION public.get_active_summary_report()
RETURNS TABLE(
    total_sales numeric,
    total_feed_cost numeric,
    total_medicine_cost numeric,
    total_coal_cost numeric,
    total_expenses numeric,
    total_salaries numeric,
    total_cost numeric,
    profit numeric
)
LANGUAGE plpgsql
AS $$
DECLARE
    active_ids uuid[];
    v_sales numeric;
    v_feed numeric;
    v_medicine numeric;
    v_coal numeric;
    v_expenses numeric;
    v_salaries numeric;
    v_cost numeric;
BEGIN
    SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO active_ids
    FROM public.broiler_batches
    WHERE user_id = auth.uid() AND is_active = true AND is_summary = false;

    SELECT COALESCE(SUM(s.weight_kg * s.price_per_kg), 0) INTO v_sales
    FROM public.sales s
    WHERE s.user_id = auth.uid()
      AND (s.batch_id = ANY(active_ids) OR s.batch_id IS NULL);

    SELECT COALESCE(SUM(f.amount), 0) INTO v_feed
    FROM public.feed_deliveries f
    WHERE f.user_id = auth.uid() AND f.transaction_type IN ('purchase', 'debt')
      AND (f.batch_id = ANY(active_ids) OR f.batch_id IS NULL);

    SELECT COALESCE(SUM(m.amount), 0) INTO v_medicine
    FROM public.medicine_transactions m
    WHERE m.user_id = auth.uid() AND m.transaction_type IN ('purchase', 'debt')
      AND (m.batch_id = ANY(active_ids) OR m.batch_id IS NULL);

    SELECT COALESCE(SUM(c.amount), 0) INTO v_coal
    FROM public.coal_transactions c
    WHERE c.user_id = auth.uid() AND c.transaction_type IN ('purchase', 'debt')
      AND (c.batch_id = ANY(active_ids) OR c.batch_id IS NULL);

    SELECT COALESCE(SUM(e.amount), 0) INTO v_expenses
    FROM public.expenses e
    WHERE e.user_id = auth.uid()
      AND (e.batch_id = ANY(active_ids) OR e.batch_id IS NULL);

    SELECT COALESCE(SUM(sal.amount), 0) INTO v_salaries
    FROM public.salaries sal
    WHERE sal.user_id = auth.uid() AND sal.batch_id = ANY(active_ids);

    v_cost := v_feed + v_medicine + v_coal + v_expenses + v_salaries;

    RETURN QUERY SELECT
        v_sales, v_feed, v_medicine, v_coal, v_expenses, v_salaries,
        v_cost, (v_sales - v_cost);
END;
$$;
