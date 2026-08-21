-- supabase/migrations/20260821150000_fix_summary_report_expense_scope_and_null_summary.sql
-- Final whole-branch review fix wave for
-- docs/superpowers/plans/2026-08-21-active-summary-cost-profit.md
--
-- Fixes public.get_active_summary_report() (added in
-- 20260821120100_add_get_active_summary_report.sql):
--
--   1. (Critical) The expense sum ignored public.expenses.expense_scope.
--      expenses defaults expense_scope to 'work' but can also be 'personal'
--      (household expenses, see src/pages/ExpensesPage.jsx). A personal
--      expense with no batch_id attached (the default when adding one) fell
--      into the `batch_id IS NULL` branch and was subtracted from farm
--      profit alongside real farm costs. Fixed by adding
--      `AND e.expense_scope = 'work'` to the expenses WHERE clause so only
--      work-scoped expenses are counted.
--
--   2. (Important) `is_summary = false` in the active_ids computation excludes
--      rows where is_summary IS NULL, because in SQL `NULL = false` evaluates
--      to NULL, not true. broiler_batches.is_summary is a nullable boolean,
--      and every other query in this codebase already defends against this
--      (e.g. the `.or('is_summary.eq.false,is_summary.is.null')` pattern in
--      src/utils/summaryBatchSync.js and the batch pickers in
--      FeedPage.jsx/CoalPage.jsx/MedicinesPage.jsx). A batch with
--      is_summary IS NULL would otherwise be silently dropped from
--      active_ids, and its entire financial history would vanish from the
--      summary report. Fixed by changing `is_summary = false` to
--      `is_summary IS NOT TRUE`.
--
--   3. (Minor) This function was missing the explicit ownership/privilege
--      statements every other function in this schema has (see
--      20260821130000_fix_get_feed_deliveries_columns.sql and
--      20260821140000_fix_get_batches_with_stats_is_summary.sql for the
--      pattern). Added them here.
--
-- This only changes WHERE-clause logic inside the function body, not the
-- RETURNS TABLE column list, so CREATE OR REPLACE FUNCTION can be used
-- directly (no DROP FUNCTION needed — that was only required for the two
-- sibling fixes above because those changed the column signature).

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
    WHERE user_id = auth.uid() AND is_active = true AND is_summary IS NOT TRUE;

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
      AND e.expense_scope = 'work'
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

ALTER FUNCTION public.get_active_summary_report() OWNER TO postgres;
GRANT ALL ON FUNCTION public.get_active_summary_report() TO anon;
GRANT ALL ON FUNCTION public.get_active_summary_report() TO authenticated;
GRANT ALL ON FUNCTION public.get_active_summary_report() TO service_role;
