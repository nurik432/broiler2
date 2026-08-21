-- supabase/migrations/20260821170000_create_customers.sql
-- New customers table, replacing the free-text sales.customer_name so
-- payment auto-allocation (later migrations/tasks) can reliably group a
-- customer's sales together.
-- Part of: docs/superpowers/specs/2026-08-21-customer-payment-allocation-design.md

CREATE TABLE IF NOT EXISTS public.customers (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    full_name text NOT NULL,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.customers OWNER TO postgres;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_can_manage_own_customers" ON public.customers
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

GRANT ALL ON TABLE public.customers TO anon;
GRANT ALL ON TABLE public.customers TO authenticated;
GRANT ALL ON TABLE public.customers TO service_role;
