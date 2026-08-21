


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."batch_report" AS (
	"batch_name" "text",
	"start_date" "date",
	"end_date" "date",
	"total_sales" numeric,
	"total_expenses" numeric,
	"total_salaries" numeric,
	"profit" numeric
);


ALTER TYPE "public"."batch_report" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_batch_report"("p_batch_id" "uuid") RETURNS "public"."batch_report"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    report_data batch_report;
BEGIN
    SELECT
        b.batch_name,
        b.start_date,
        COALESCE(MAX(dl.log_date), NOW()::date),
        -- Считаем продажи, ПРИВЯЗАННЫЕ к этой партии
        COALESCE((SELECT SUM(s.weight_kg * s.price_per_kg) FROM sales s WHERE s.batch_id = p_batch_id), 0),
        -- Считаем расходы, ПРИВЯЗАННЫЕ к этой партии
        COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.batch_id = p_batch_id), 0),
        -- Считаем зарплаты, ПРИВЯЗАННЫЕ к этой партии
        COALESCE((SELECT SUM(sal.amount) FROM salaries sal WHERE sal.batch_id = p_batch_id), 0),
        0 -- Прибыль
    INTO
        report_data
    FROM
        broiler_batches b
    LEFT JOIN
        daily_logs dl ON b.id = dl.batch_id
    WHERE
        b.id = p_batch_id
    GROUP BY b.id;

    -- Рассчитываем итоговую прибыль
    report_data.profit := report_data.total_sales - (report_data.total_expenses + report_data.total_salaries);

    RETURN report_data;
END;
$$;


ALTER FUNCTION "public"."generate_batch_report"("p_batch_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_archived_batches_with_stats"() RETURNS TABLE("id" "uuid", "batch_name" "text", "initial_quantity" integer, "start_date" "date", "is_active" boolean, "user_id" "uuid", "total_mortality" bigint, "current_quantity" bigint)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN QUERY
    SELECT b.id, b.batch_name, b.initial_quantity, b.start_date, b.is_active, b.user_id,
        COALESCE(dl.total_mortality, 0) as total_mortality,
        b.initial_quantity - COALESCE(dl.total_mortality, 0) as current_quantity
    FROM broiler_batches AS b
    LEFT JOIN (
        SELECT batch_id, SUM(mortality) AS total_mortality
        FROM daily_logs GROUP BY batch_id
    ) AS dl ON b.id = dl.batch_id
    WHERE b.user_id = auth.uid() AND b.is_active = false -- <-- ВОТ ИЗМЕНЕНИЕ
    ORDER BY b.start_date DESC;
END;
$$;


ALTER FUNCTION "public"."get_archived_batches_with_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_batches_with_stats"() RETURNS TABLE("id" "uuid", "batch_name" "text", "initial_quantity" integer, "start_date" "date", "is_active" boolean, "user_id" "uuid", "total_mortality" bigint, "current_quantity" bigint)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN QUERY
    SELECT b.id, b.batch_name, b.initial_quantity, b.start_date, b.is_active, b.user_id,
        COALESCE(dl.total_mortality, 0) as total_mortality,
        b.initial_quantity - COALESCE(dl.total_mortality, 0) as current_quantity
    FROM broiler_batches AS b
    LEFT JOIN (
        SELECT batch_id, SUM(mortality) AS total_mortality
        FROM daily_logs GROUP BY batch_id
    ) AS dl ON b.id = dl.batch_id
    WHERE b.user_id = auth.uid() AND b.is_active = true -- <-- ВОТ ИЗМЕНЕНИЕ
    ORDER BY b.start_date DESC;
END;
$$;


ALTER FUNCTION "public"."get_batches_with_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_coal_summary"() RETURNS TABLE("total_kg" numeric, "total_purchased" numeric, "total_debt" numeric, "total_paid" numeric, "current_balance" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(SUM(CASE WHEN ct.transaction_type IN ('purchase', 'debt') THEN ct.quantity_kg ELSE 0 END), 0) AS total_kg,
        COALESCE(SUM(CASE WHEN ct.transaction_type = 'purchase' THEN ct.amount ELSE 0 END), 0) AS total_purchased,
        COALESCE(SUM(CASE WHEN ct.transaction_type = 'debt' THEN ct.amount ELSE 0 END), 0) AS total_debt,
        COALESCE(SUM(CASE WHEN ct.transaction_type = 'payment' THEN ct.amount ELSE 0 END), 0) AS total_paid,
        COALESCE(SUM(CASE WHEN ct.transaction_type IN ('purchase', 'debt') THEN ct.amount ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN ct.transaction_type = 'payment' THEN ct.amount ELSE 0 END), 0) AS current_balance
    FROM public.coal_transactions ct
    WHERE ct.user_id = auth.uid();
END;
$$;


ALTER FUNCTION "public"."get_coal_summary"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."employees" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "full_name" "text" NOT NULL,
    "position" "text",
    "hire_date" "date",
    "user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "start_date" "date",
    "batch_id" "uuid",
    "is_active" boolean DEFAULT true NOT NULL,
    "end_date" "date",
    "role" "text",
    "workshop_id" "uuid",
    "rate" numeric DEFAULT 0,
    "fixed_sum" numeric DEFAULT 0,
    "first_days_n" integer DEFAULT 0,
    "absent_days" integer DEFAULT 0,
    "salary_tiers" "jsonb" DEFAULT '[]'::"jsonb"
);


ALTER TABLE "public"."employees" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_employees_by_batch"("batch_uuid" "uuid") RETURNS SETOF "public"."employees"
    LANGUAGE "sql"
    AS $$
  select *
  from employees
  where batch_id = batch_uuid;
$$;


ALTER FUNCTION "public"."get_employees_by_batch"("batch_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_expenses"() RETURNS TABLE("id" "uuid", "user_id" "uuid", "expense_date" "date", "description" "text", "amount" numeric, "category" "text", "batch_id" "uuid", "created_at" timestamp with time zone, "expense_scope" "text", "batch_name" "text", "batch_is_active" boolean)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        e.id,
        e.user_id,
        e.expense_date,
        e.description,
        e.amount,
        e.category,
        e.batch_id,
        e.created_at,
        e.expense_scope,
        b.batch_name,
        b.is_active as batch_is_active
    FROM
        expenses AS e
    LEFT JOIN
        broiler_batches AS b ON e.batch_id = b.id
    WHERE
        e.user_id = auth.uid()
    ORDER BY
        e.expense_date DESC, 
        e.created_at DESC NULLS LAST;
END;
$$;


ALTER FUNCTION "public"."get_expenses"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."expenses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "expense_date" "date" NOT NULL,
    "description" "text",
    "amount" numeric NOT NULL,
    "category" "text",
    "user_id" "uuid",
    "expense_scope" "text" DEFAULT 'work'::"text" NOT NULL,
    "batch_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."expenses" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_expenses_by_batch"("batch_uuid" "uuid") RETURNS SETOF "public"."expenses"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN QUERY
    SELECT * FROM expenses
    WHERE user_id = auth.uid() AND batch_id = batch_uuid
    ORDER BY expense_date DESC, created_at DESC;
END;
$$;


ALTER FUNCTION "public"."get_expenses_by_batch"("batch_uuid" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."feed_deliveries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "delivery_date" "date" NOT NULL,
    "feed_type" "text" NOT NULL,
    "quantity_kg" numeric NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "batch_id" "uuid",
    CONSTRAINT "feed_deliveries_feed_type_check" CHECK (("feed_type" = ANY (ARRAY['старт'::"text", 'рост'::"text", 'финиш'::"text"]))),
    CONSTRAINT "feed_deliveries_quantity_kg_check" CHECK (("quantity_kg" > (0)::numeric))
);


ALTER TABLE "public"."feed_deliveries" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_feed_by_batch"("batch_uuid" "uuid") RETURNS SETOF "public"."feed_deliveries"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN QUERY
    SELECT * FROM feed_deliveries
    WHERE user_id = auth.uid() AND batch_id = batch_uuid
    ORDER BY delivery_date DESC, created_at DESC;
END;
$$;


ALTER FUNCTION "public"."get_feed_by_batch"("batch_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_feed_deliveries"() RETURNS TABLE("id" "uuid", "user_id" "uuid", "delivery_date" "date", "feed_type" "text", "quantity_kg" numeric, "created_at" timestamp with time zone, "batch_id" "uuid", "batch_name" "text", "batch_is_active" boolean)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN QUERY SELECT fd.*, b.batch_name, b.is_active as batch_is_active
    FROM feed_deliveries AS fd
    LEFT JOIN broiler_batches AS b ON fd.batch_id = b.id
    WHERE fd.user_id = auth.uid()
    ORDER BY fd.delivery_date DESC, fd.created_at DESC NULLS LAST;
END;
$$;


ALTER FUNCTION "public"."get_feed_deliveries"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_medicine_summary"() RETURNS TABLE("total_purchased" numeric, "total_debt" numeric, "total_paid" numeric, "current_balance" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(SUM(CASE WHEN mt.transaction_type = 'purchase' THEN mt.amount ELSE 0 END), 0) AS total_purchased,
        COALESCE(SUM(CASE WHEN mt.transaction_type = 'debt' THEN mt.amount ELSE 0 END), 0) AS total_debt,
        COALESCE(SUM(CASE WHEN mt.transaction_type = 'payment' THEN mt.amount ELSE 0 END), 0) AS total_paid,
        COALESCE(SUM(CASE WHEN mt.transaction_type IN ('purchase', 'debt') THEN mt.amount ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN mt.transaction_type = 'payment' THEN mt.amount ELSE 0 END), 0) AS current_balance
    FROM public.medicine_transactions mt
    WHERE mt.user_id = auth.uid();
END;
$$;


ALTER FUNCTION "public"."get_medicine_summary"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_salaries_by_batch"("batch_uuid" "uuid") RETURNS TABLE("id" "uuid", "payment_date" "date", "created_at" timestamp with time zone, "payment_type" "text", "amount" numeric, "employee_name" "text")
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN QUERY
    SELECT s.id, s.payment_date, s.created_at, s.payment_type, s.amount, e.full_name as employee_name
    FROM salaries AS s
    JOIN employees AS e ON s.employee_id = e.id
    WHERE s.user_id = auth.uid() AND s.batch_id = batch_uuid
    ORDER BY s.payment_date DESC, s.created_at DESC;
END;
$$;


ALTER FUNCTION "public"."get_salaries_by_batch"("batch_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_salaries_by_employee"("employee_uuid" "uuid") RETURNS TABLE("id" "uuid", "user_id" "uuid", "employee_id" "uuid", "amount" numeric, "payment_type" "text", "payment_date" "date", "batch_id" "uuid", "created_at" timestamp with time zone, "batch_name" "text", "batch_is_active" boolean)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        s.id,
        s.user_id,
        s.employee_id,
        s.amount,
        s.payment_type,
        s.payment_date,
        s.batch_id,
        s.created_at,
        b.batch_name,
        b.is_active as batch_is_active
    FROM
        salaries AS s
    LEFT JOIN
        broiler_batches AS b ON s.batch_id = b.id
    WHERE
        s.user_id = auth.uid() AND s.employee_id = employee_uuid
    ORDER BY
        s.payment_date DESC, 
        s.created_at DESC NULLS LAST;
END;
$$;


ALTER FUNCTION "public"."get_salaries_by_employee"("employee_uuid" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sales" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "sale_date" "date" NOT NULL,
    "customer_name" "text",
    "weight_kg" numeric NOT NULL,
    "price_per_kg" numeric NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "batch_id" "uuid"
);


ALTER TABLE "public"."sales" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_sales_by_batch"("batch_uuid" "uuid") RETURNS SETOF "public"."sales"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN QUERY
    SELECT * FROM sales
    WHERE user_id = auth.uid() AND batch_id = batch_uuid
    ORDER BY sale_date DESC, created_at DESC;
END;
$$;


ALTER FUNCTION "public"."get_sales_by_batch"("batch_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_sales_with_stats"() RETURNS TABLE("id" "uuid", "sale_date" "date", "customer_name" "text", "weight_kg" numeric, "price_per_kg" numeric, "created_at" timestamp with time zone, "batch_id" "uuid", "batch_name" "text", "total_amount" numeric, "total_paid" numeric, "balance" numeric)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        s.id,
        s.sale_date,
        s.customer_name,
        s.weight_kg,
        s.price_per_kg,
        s.created_at,      -- Добавлено
        s.batch_id,        -- Добавлено
        b.batch_name,      -- Добавлено (имя партии из связанной таблицы)
        (s.weight_kg * s.price_per_kg) as total_amount,
        COALESCE(p.total_paid, 0) as total_paid,
        (s.weight_kg * s.price_per_kg) - COALESCE(p.total_paid, 0) as balance
    FROM
        sales AS s
    -- Присоединяем таблицу платежей для подсчета суммы
    LEFT JOIN (
        SELECT sale_id, SUM(amount) as total_paid
        FROM payments GROUP BY sale_id
    ) AS p ON s.id = p.sale_id
    -- Присоединяем таблицу партий для получения имени
    LEFT JOIN broiler_batches AS b ON s.batch_id = b.id
    WHERE
        s.user_id = auth.uid()
    ORDER BY
        s.sale_date DESC, s.created_at DESC;
END;
$$;


ALTER FUNCTION "public"."get_sales_with_stats"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."broiler_batches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "batch_name" "text" NOT NULL,
    "initial_quantity" integer NOT NULL,
    "start_date" "date" NOT NULL,
    "is_active" boolean DEFAULT true,
    "user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "workshop_id" "uuid",
    "is_summary" boolean DEFAULT false,
    "batch_end" "date"
);


ALTER TABLE "public"."broiler_batches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coal_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "transaction_date" "date" NOT NULL,
    "transaction_type" "text" NOT NULL,
    "quantity_kg" numeric,
    "price_per_kg" numeric,
    "amount" numeric NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "is_hidden" boolean DEFAULT false,
    CONSTRAINT "coal_transactions_transaction_type_check" CHECK (("transaction_type" = ANY (ARRAY['purchase'::"text", 'debt'::"text", 'payment'::"text"])))
);


ALTER TABLE "public"."coal_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "batch_id" "uuid",
    "log_date" "date" NOT NULL,
    "age" integer NOT NULL,
    "mortality" integer DEFAULT 0,
    "medicine_id" "uuid",
    "dosage" "text",
    "water_consumption" numeric,
    "user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "weight" numeric,
    "daily_feed" numeric,
    "workshop_id" "uuid",
    "mortality_natural" integer DEFAULT 0,
    "mortality_halal" integer DEFAULT 0
);


ALTER TABLE "public"."daily_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."medicine_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "medicine_id" "uuid",
    "transaction_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "transaction_type" "text" NOT NULL,
    "quantity" numeric,
    "unit" "text" DEFAULT 'шт'::"text",
    "price_per_unit" numeric,
    "amount" numeric NOT NULL,
    "description" "text",
    "is_hidden" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "medicine_transactions_transaction_type_check" CHECK (("transaction_type" = ANY (ARRAY['purchase'::"text", 'debt'::"text", 'payment'::"text"])))
);


ALTER TABLE "public"."medicine_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."medicines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "image_url" "text",
    "user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."medicines" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "content" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "audio_url" "text",
    "type" "text" DEFAULT 'text'::"text"
);


ALTER TABLE "public"."notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "sale_id" "uuid" NOT NULL,
    "payment_date" "date" NOT NULL,
    "amount" numeric NOT NULL,
    "payment_method" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "payments_amount_check" CHECK (("amount" > (0)::numeric))
);


ALTER TABLE "public"."payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."salaries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "employee_id" "uuid",
    "amount" numeric NOT NULL,
    "payment_type" "text" NOT NULL,
    "payment_date" "date" NOT NULL,
    "user_id" "uuid",
    "batch_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "is_archived" boolean DEFAULT false,
    CONSTRAINT "salaries_payment_type_check" CHECK (("payment_type" = ANY (ARRAY['зарплата'::"text", 'аванс'::"text"])))
);


ALTER TABLE "public"."salaries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "assignee_id" "uuid",
    "workshop_id" "uuid",
    "batch_id" "uuid",
    "priority" "text" DEFAULT 'medium'::"text",
    "status" "text" DEFAULT 'open'::"text",
    "due_date" "date",
    "completed_at" timestamp with time zone,
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid" NOT NULL,
    CONSTRAINT "tasks_priority_check" CHECK (("priority" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text", 'urgent'::"text"]))),
    CONSTRAINT "tasks_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'in_progress'::"text", 'done'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workshops" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "capacity" integer,
    "description" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid" NOT NULL
);


ALTER TABLE "public"."workshops" OWNER TO "postgres";


ALTER TABLE ONLY "public"."broiler_batches"
    ADD CONSTRAINT "broiler_batches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coal_transactions"
    ADD CONSTRAINT "coal_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_logs"
    ADD CONSTRAINT "daily_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feed_deliveries"
    ADD CONSTRAINT "feed_deliveries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."medicine_transactions"
    ADD CONSTRAINT "medicine_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."medicines"
    ADD CONSTRAINT "medicines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notes"
    ADD CONSTRAINT "notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."salaries"
    ADD CONSTRAINT "salaries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workshops"
    ADD CONSTRAINT "workshops_pkey" PRIMARY KEY ("id");



CREATE INDEX "employees_batch_id_idx" ON "public"."employees" USING "btree" ("batch_id");



CREATE INDEX "idx_broiler_batches_workshop_id" ON "public"."broiler_batches" USING "btree" ("workshop_id");



CREATE INDEX "idx_daily_logs_workshop_id" ON "public"."daily_logs" USING "btree" ("workshop_id");



CREATE INDEX "idx_employees_is_active" ON "public"."employees" USING "btree" ("is_active");



CREATE INDEX "idx_notes_type" ON "public"."notes" USING "btree" ("type");



CREATE INDEX "idx_notes_user_created" ON "public"."notes" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_tasks_assignee_id" ON "public"."tasks" USING "btree" ("assignee_id");



CREATE INDEX "idx_tasks_status" ON "public"."tasks" USING "btree" ("status");



CREATE INDEX "idx_tasks_workshop_id" ON "public"."tasks" USING "btree" ("workshop_id");



CREATE INDEX "idx_tasks_user_id" ON "public"."tasks" USING "btree" ("user_id");



CREATE INDEX "idx_workshops_user_id" ON "public"."workshops" USING "btree" ("user_id");



CREATE INDEX "salaries_batch_id_idx" ON "public"."salaries" USING "btree" ("batch_id");



ALTER TABLE ONLY "public"."broiler_batches"
    ADD CONSTRAINT "broiler_batches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."broiler_batches"
    ADD CONSTRAINT "broiler_batches_workshop_id_fkey" FOREIGN KEY ("workshop_id") REFERENCES "public"."workshops"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."coal_transactions"
    ADD CONSTRAINT "coal_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_logs"
    ADD CONSTRAINT "daily_logs_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."broiler_batches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_logs"
    ADD CONSTRAINT "daily_logs_medicine_id_fkey" FOREIGN KEY ("medicine_id") REFERENCES "public"."medicines"("id");



ALTER TABLE ONLY "public"."daily_logs"
    ADD CONSTRAINT "daily_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_logs"
    ADD CONSTRAINT "daily_logs_workshop_id_fkey" FOREIGN KEY ("workshop_id") REFERENCES "public"."workshops"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."broiler_batches"("id");



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_workshop_id_fkey" FOREIGN KEY ("workshop_id") REFERENCES "public"."workshops"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."broiler_batches"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."feed_deliveries"
    ADD CONSTRAINT "feed_deliveries_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."broiler_batches"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."feed_deliveries"
    ADD CONSTRAINT "feed_deliveries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."salaries"
    ADD CONSTRAINT "fk_batch" FOREIGN KEY ("batch_id") REFERENCES "public"."broiler_batches"("id");



ALTER TABLE ONLY "public"."medicine_transactions"
    ADD CONSTRAINT "medicine_transactions_medicine_id_fkey" FOREIGN KEY ("medicine_id") REFERENCES "public"."medicines"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."medicine_transactions"
    ADD CONSTRAINT "medicine_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."medicines"
    ADD CONSTRAINT "medicines_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notes"
    ADD CONSTRAINT "notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."salaries"
    ADD CONSTRAINT "salaries_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."broiler_batches"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."salaries"
    ADD CONSTRAINT "salaries_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."salaries"
    ADD CONSTRAINT "salaries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."broiler_batches"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."workshops"
    ADD CONSTRAINT "workshops_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "public"."employees"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."broiler_batches"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_workshop_id_fkey" FOREIGN KEY ("workshop_id") REFERENCES "public"."workshops"("id") ON DELETE SET NULL;



CREATE POLICY "user_can_manage_own_tasks" ON "public"."tasks" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "user_can_create_own_workshops" ON "public"."workshops" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "user_can_read_own_workshops" ON "public"."workshops" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "user_can_update_own_workshops" ON "public"."workshops" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "user_can_delete_own_workshops" ON "public"."workshops" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create own notes" ON "public"."notes" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own notes" ON "public"."notes" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own salaries" ON "public"."salaries" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage own medicine_transactions" ON "public"."medicine_transactions" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own notes" ON "public"."notes" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own salaries" ON "public"."salaries" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own notes" ON "public"."notes" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own salaries" ON "public"."salaries" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."broiler_batches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."coal_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."employees" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."expenses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."feed_deliveries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."medicine_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."medicines" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."salaries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sales" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_can_create_own_batches" ON "public"."broiler_batches" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "user_can_create_own_expenses" ON "public"."expenses" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "user_can_create_own_logs" ON "public"."daily_logs" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "user_can_create_own_medicines" ON "public"."medicines" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "user_can_delete_own_batches" ON "public"."broiler_batches" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "user_can_delete_own_expenses" ON "public"."expenses" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "user_can_delete_own_logs" ON "public"."daily_logs" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "user_can_delete_own_medicines" ON "public"."medicines" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "user_can_manage_own_coal_transactions" ON "public"."coal_transactions" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "user_can_manage_own_employees" ON "public"."employees" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "user_can_manage_own_feed_deliveries" ON "public"."feed_deliveries" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "user_can_manage_own_notes" ON "public"."notes" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "user_can_manage_own_payments" ON "public"."payments" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "user_can_manage_own_salaries" ON "public"."salaries" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "user_can_manage_own_sales" ON "public"."sales" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "user_can_read_own_batches" ON "public"."broiler_batches" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "user_can_read_own_expenses" ON "public"."expenses" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "user_can_read_own_logs" ON "public"."daily_logs" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "user_can_read_own_medicines" ON "public"."medicines" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "user_can_update_own_batches" ON "public"."broiler_batches" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "user_can_update_own_expenses" ON "public"."expenses" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "user_can_update_own_logs" ON "public"."daily_logs" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "user_can_update_own_medicines" ON "public"."medicines" FOR UPDATE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."workshops" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."generate_batch_report"("p_batch_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."generate_batch_report"("p_batch_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_batch_report"("p_batch_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_archived_batches_with_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_archived_batches_with_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_archived_batches_with_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_batches_with_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_batches_with_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_batches_with_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_coal_summary"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_coal_summary"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_coal_summary"() TO "service_role";



GRANT ALL ON TABLE "public"."employees" TO "anon";
GRANT ALL ON TABLE "public"."employees" TO "authenticated";
GRANT ALL ON TABLE "public"."employees" TO "service_role";



GRANT ALL ON FUNCTION "public"."get_employees_by_batch"("batch_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_employees_by_batch"("batch_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_employees_by_batch"("batch_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_expenses"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_expenses"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_expenses"() TO "service_role";



GRANT ALL ON TABLE "public"."expenses" TO "anon";
GRANT ALL ON TABLE "public"."expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."expenses" TO "service_role";



GRANT ALL ON FUNCTION "public"."get_expenses_by_batch"("batch_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_expenses_by_batch"("batch_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_expenses_by_batch"("batch_uuid" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."feed_deliveries" TO "anon";
GRANT ALL ON TABLE "public"."feed_deliveries" TO "authenticated";
GRANT ALL ON TABLE "public"."feed_deliveries" TO "service_role";



GRANT ALL ON FUNCTION "public"."get_feed_by_batch"("batch_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_feed_by_batch"("batch_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_feed_by_batch"("batch_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_feed_deliveries"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_feed_deliveries"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_feed_deliveries"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_medicine_summary"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_medicine_summary"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_medicine_summary"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_salaries_by_batch"("batch_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_salaries_by_batch"("batch_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_salaries_by_batch"("batch_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_salaries_by_employee"("employee_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_salaries_by_employee"("employee_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_salaries_by_employee"("employee_uuid" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."sales" TO "anon";
GRANT ALL ON TABLE "public"."sales" TO "authenticated";
GRANT ALL ON TABLE "public"."sales" TO "service_role";



GRANT ALL ON FUNCTION "public"."get_sales_by_batch"("batch_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_sales_by_batch"("batch_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_sales_by_batch"("batch_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_sales_with_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_sales_with_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_sales_with_stats"() TO "service_role";


















GRANT ALL ON TABLE "public"."broiler_batches" TO "anon";
GRANT ALL ON TABLE "public"."broiler_batches" TO "authenticated";
GRANT ALL ON TABLE "public"."broiler_batches" TO "service_role";



GRANT ALL ON TABLE "public"."coal_transactions" TO "anon";
GRANT ALL ON TABLE "public"."coal_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."coal_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."daily_logs" TO "anon";
GRANT ALL ON TABLE "public"."daily_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_logs" TO "service_role";



GRANT ALL ON TABLE "public"."medicine_transactions" TO "anon";
GRANT ALL ON TABLE "public"."medicine_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."medicine_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."medicines" TO "anon";
GRANT ALL ON TABLE "public"."medicines" TO "authenticated";
GRANT ALL ON TABLE "public"."medicines" TO "service_role";



GRANT ALL ON TABLE "public"."notes" TO "anon";
GRANT ALL ON TABLE "public"."notes" TO "authenticated";
GRANT ALL ON TABLE "public"."notes" TO "service_role";



GRANT ALL ON TABLE "public"."payments" TO "anon";
GRANT ALL ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";



GRANT ALL ON TABLE "public"."salaries" TO "anon";
GRANT ALL ON TABLE "public"."salaries" TO "authenticated";
GRANT ALL ON TABLE "public"."salaries" TO "service_role";



GRANT ALL ON TABLE "public"."tasks" TO "anon";
GRANT ALL ON TABLE "public"."tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."tasks" TO "service_role";



GRANT ALL ON TABLE "public"."workshops" TO "anon";
GRANT ALL ON TABLE "public"."workshops" TO "authenticated";
GRANT ALL ON TABLE "public"."workshops" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































