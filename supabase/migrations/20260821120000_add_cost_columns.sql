-- supabase/migrations/20260821120000_add_cost_columns.sql
-- Adds price/purchase-type tracking to feed deliveries and optional batch
-- attribution to medicine/coal purchases, so their cost can be included in
-- batch profit calculations.
-- Part of: docs/superpowers/specs/2026-08-21-active-summary-cost-profit-design.md

ALTER TABLE public.feed_deliveries
  ADD COLUMN IF NOT EXISTS price_per_kg numeric,
  ADD COLUMN IF NOT EXISTS amount numeric,
  ADD COLUMN IF NOT EXISTS transaction_type text,
  ADD COLUMN IF NOT EXISTS company text;

ALTER TABLE public.feed_deliveries
  DROP CONSTRAINT IF EXISTS feed_deliveries_transaction_type_check;
ALTER TABLE public.feed_deliveries
  ADD CONSTRAINT feed_deliveries_transaction_type_check
    CHECK (transaction_type IS NULL OR transaction_type IN ('purchase', 'debt'));

ALTER TABLE public.medicine_transactions
  ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES public.broiler_batches(id);

ALTER TABLE public.coal_transactions
  ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES public.broiler_batches(id);
