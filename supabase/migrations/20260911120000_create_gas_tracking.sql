-- supabase/migrations/20260911120000_create_gas_tracking.sql
-- Gas accounting ("Учёт газа"): prepaid balance tracked against manually
-- entered meter readings, with a price history since the tariff can change.
--
-- Model: gas_topups are prepayments that increase the balance. Each meter
-- reading records the meter's cumulative value; the app computes consumption
-- as the delta from the previous reading and multiplies by the price active
-- on that date, which decreases the balance. current_balance is therefore
-- always: sum(gas_topups.amount) - sum(gas_meter_readings.amount).

CREATE TABLE IF NOT EXISTS public.gas_price_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    price numeric NOT NULL,
    effective_date date NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gas_topups (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    transaction_date date NOT NULL,
    amount numeric NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now(),
    is_hidden boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.gas_meter_readings (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    reading_date date NOT NULL,
    reading_value numeric NOT NULL,
    consumption_m3 numeric,
    price_per_m3 numeric,
    amount numeric,
    description text,
    created_at timestamp with time zone DEFAULT now(),
    is_hidden boolean DEFAULT false
);

ALTER TABLE public.gas_price_history OWNER TO postgres;
ALTER TABLE public.gas_topups OWNER TO postgres;
ALTER TABLE public.gas_meter_readings OWNER TO postgres;

ALTER TABLE public.gas_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gas_topups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gas_meter_readings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_can_manage_own_gas_price_history" ON public.gas_price_history
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_can_manage_own_gas_topups" ON public.gas_topups
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_can_manage_own_gas_meter_readings" ON public.gas_meter_readings
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

GRANT ALL ON TABLE public.gas_price_history TO anon;
GRANT ALL ON TABLE public.gas_price_history TO authenticated;
GRANT ALL ON TABLE public.gas_price_history TO service_role;

GRANT ALL ON TABLE public.gas_topups TO anon;
GRANT ALL ON TABLE public.gas_topups TO authenticated;
GRANT ALL ON TABLE public.gas_topups TO service_role;

GRANT ALL ON TABLE public.gas_meter_readings TO anon;
GRANT ALL ON TABLE public.gas_meter_readings TO authenticated;
GRANT ALL ON TABLE public.gas_meter_readings TO service_role;
