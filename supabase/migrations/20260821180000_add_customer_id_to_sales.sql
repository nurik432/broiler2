-- supabase/migrations/20260821180000_add_customer_id_to_sales.sql
-- Adds sales.customer_id and backfills it from the existing free-text
-- customer_name: one customers row per distinct (trimmed, case-insensitive)
-- name per user, then link every sale with a matching name to it.
-- sales.customer_name is left in place (not dropped) — frontend just stops
-- reading/writing it going forward.
-- Part of: docs/superpowers/specs/2026-08-21-customer-payment-allocation-design.md

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id);

INSERT INTO public.customers (full_name, user_id)
SELECT DISTINCT ON (LOWER(TRIM(customer_name)), user_id)
    TRIM(customer_name), user_id
FROM public.sales
WHERE customer_name IS NOT NULL AND TRIM(customer_name) != ''
ON CONFLICT DO NOTHING;

UPDATE public.sales s
SET customer_id = c.id
FROM public.customers c
WHERE s.customer_id IS NULL
  AND s.customer_name IS NOT NULL AND TRIM(s.customer_name) != ''
  AND LOWER(TRIM(s.customer_name)) = LOWER(c.full_name)
  AND s.user_id = c.user_id;
