# Справочник клиентов и авто-распределение платежей — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace free-text `sales.customer_name` with a real `customers` table, and replace one-sale-at-a-time payment entry with a single "Новое поступление" flow that auto-allocates an amount across a customer's outstanding sales (oldest first), structurally eliminating the overpayment bug.

**Architecture:** Three migrations (customers table, `sales.customer_id` + backfill, `get_sales_with_stats()` fix) followed by three `SalesPage.jsx` changes (customer picker replacing free text, new allocation modal, existing per-sale modal trimmed to read-only history). Allocation logic runs client-side in JS (fetches the customer's unpaid sales via the existing RPC, loops oldest-first), matching how this codebase already does derived calculations in JS rather than new stored procedures.

**Tech Stack:** Vite + React 19, Supabase (Postgres + PostgREST), Tailwind v4 (inline utility classes, matching `SalesPage.jsx`'s existing style), no automated test suite (manual verification only).

**Spec:** `docs/superpowers/specs/2026-08-21-customer-payment-allocation-design.md`

## Global Constraints

- No test suite in this repo — every task's "test" is a concrete manual verification (exact SQL/curl/browser steps + expected result).
- Local dev stack: `npx supabase start` (Docker) for the database. `.env.local` in the repo root currently points at **production** — to test locally, override with env vars on the `npm run dev` invocation instead of editing `.env.local`: `VITE_SUPABASE_URL="http://127.0.0.1:54321" VITE_SUPABASE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0" npm run dev -- --port <port>` (this exact anon key is the fixed Supabase CLI local-dev demo key, stable for this project).
- Test user for local verification: `test@broiler.local` / `testpass123`. Recreate via `curl -X POST http://127.0.0.1:54321/auth/v1/admin/users -H "apikey: <SECRET_KEY>" -H "Authorization: Bearer <SECRET_KEY>" -H "Content-Type: application/json" -d '{"email":"test@broiler.local","password":"testpass123","email_confirm":true}'` if `npx supabase db reset` wiped it (`<SECRET_KEY>` comes from `npx supabase status`).
- Currency formatting: reuse the existing inline `new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'TJS' })` calls already in `SalesPage.jsx` — don't extract a new helper unless a task explicitly says to.
- Every new Supabase write includes `user_id: user.id` from `supabase.auth.getUser()`, matching every existing handler in this file.
- RLS policy pattern for any new table: `USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)` (see `payments`/`sales` in `supabase/migrations/20260101000000_baseline_from_schema_sql.sql`).
- Migration style: additive only (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`), except when a function's `RETURNS TABLE` column set changes — then `DROP FUNCTION IF EXISTS` + `CREATE FUNCTION` (matches `supabase/migrations/20260821130000_fix_get_feed_deliveries_columns.sql` and `20260821160000_fix_get_sales_with_stats_batch_is_active.sql`, already in this repo).

---

### Task 1: Migration — `customers` table

**Files:**
- Create: `supabase/migrations/20260821170000_create_customers.sql`

**Interfaces:**
- Produces: table `public.customers(id uuid PK, full_name text NOT NULL, user_id uuid, created_at timestamptz)`, RLS enabled, policy `user_can_manage_own_customers`. Task 2 and Task 4 depend on this table and column names exactly.

- [ ] **Step 1: Write the migration**

```sql
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
```

- [ ] **Step 2: Apply it locally**

```bash
npx supabase db reset
```

Expected: ends with `Finished supabase db reset`, no error mentioning `customers`.

- [ ] **Step 3: Verify the table and RLS**

```bash
docker exec supabase_db_broilerapp psql -U postgres -d postgres -c "\d public.customers"
docker exec supabase_db_broilerapp psql -U postgres -d postgres -c "SELECT relrowsecurity FROM pg_class WHERE relname = 'customers';"
docker exec supabase_db_broilerapp psql -U postgres -d postgres -c "SELECT policyname FROM pg_policies WHERE tablename = 'customers';"
```

Expected: `\d` shows `id`, `full_name`, `user_id`, `created_at`; `relrowsecurity` is `t`; policy list shows `user_can_manage_own_customers`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260821170000_create_customers.sql
git commit -m "feat: add customers table"
```

---

### Task 2: Migration — `sales.customer_id` + backfill

**Files:**
- Create: `supabase/migrations/20260821180000_add_customer_id_to_sales.sql`

**Interfaces:**
- Consumes: `public.customers(id, full_name, user_id)` from Task 1.
- Produces: `sales.customer_id uuid REFERENCES customers(id)` (nullable). Task 3 depends on this column existing.

- [ ] **Step 1: Write the migration**

```sql
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
```

- [ ] **Step 2: Apply it locally**

```bash
npx supabase db reset
```

Expected: no error mentioning `sales` or `customer_id`.

- [ ] **Step 3: Verify the column and backfill with seeded test data**

Create a test user and a sale with a `customer_name`, then confirm the backfill logic (re-run manually, since `db reset` only runs it against whatever data existed in the dump — there is none in a fresh local DB, so this step proves the *logic* works by seeding data and re-running just the backfill SQL by hand):

```bash
curl -s -X POST 'http://127.0.0.1:54321/auth/v1/admin/users' \
  -H "apikey: $(npx supabase status -o json | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).SERVICE_ROLE_KEY||JSON.parse(d).SECRET_KEY))")" \
  -H "Content-Type: application/json" -d '{"email":"test@broiler.local","password":"testpass123","email_confirm":true}' > /tmp/user.json
```

(If the above key-extraction one-liner errors, just run `npx supabase status` directly, copy the `SECRET_KEY` value, and substitute it manually in the `apikey`/`Authorization` headers — same pattern used throughout this repo's earlier migration tasks.)

```bash
USER_ID=$(node -e "console.log(require('/tmp/user.json').id)")
docker exec supabase_db_broilerapp psql -U postgres -d postgres -c "
INSERT INTO public.sales (sale_date, customer_name, weight_kg, price_per_kg, user_id)
VALUES ('2026-01-01', 'Иван Петров', 100, 20, '$USER_ID');
"
docker exec supabase_db_broilerapp psql -U postgres -d postgres -c "
INSERT INTO public.customers (full_name, user_id)
SELECT DISTINCT ON (LOWER(TRIM(customer_name)), user_id) TRIM(customer_name), user_id
FROM public.sales WHERE customer_name IS NOT NULL AND TRIM(customer_name) != ''
ON CONFLICT DO NOTHING;
UPDATE public.sales s SET customer_id = c.id
FROM public.customers c
WHERE s.customer_id IS NULL AND s.customer_name IS NOT NULL AND TRIM(s.customer_name) != ''
  AND LOWER(TRIM(s.customer_name)) = LOWER(c.full_name) AND s.user_id = c.user_id;
"
docker exec supabase_db_broilerapp psql -U postgres -d postgres -c "
SELECT s.customer_name, c.full_name, s.customer_id IS NOT NULL AS linked
FROM public.sales s LEFT JOIN public.customers c ON s.customer_id = c.id
WHERE s.customer_name = 'Иван Петров';
"
```

Expected: last query returns one row, `full_name = 'Иван Петров'`, `linked = t`.

- [ ] **Step 4: Clean up test data**

```bash
docker exec supabase_db_broilerapp psql -U postgres -d postgres -c "DELETE FROM public.sales WHERE customer_name = 'Иван Петров'; DELETE FROM public.customers WHERE full_name = 'Иван Петров';"
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260821180000_add_customer_id_to_sales.sql
git commit -m "feat: add sales.customer_id with backfill from customer_name"
```

---

### Task 3: Migration — `get_sales_with_stats()` adds `customer_id`

**Files:**
- Create: `supabase/migrations/20260821190000_fix_get_sales_with_stats_customer_id.sql`

**Interfaces:**
- Consumes: `sales.customer_id` (Task 2), `customers.full_name` (Task 1).
- Produces: RPC `get_sales_with_stats()` returns one row per sale with fields (in this order): `id, sale_date, customer_id, customer_name, weight_kg, price_per_kg, created_at, batch_id, batch_name, batch_is_active, total_amount, total_paid, balance`. Task 4 and Task 5 read `customer_id`/`customer_name`/`balance`/`sale_date` by these exact names. `batch_is_active` (added in a prior migration, `20260821160000`) is preserved — do not drop it.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260821190000_fix_get_sales_with_stats_customer_id.sql
-- Adds customer_id to get_sales_with_stats() and sources customer_name
-- from the new customers table instead of the deprecated sales.customer_name.
-- Preserves batch_is_active (added in 20260821160000). RETURNS TABLE column
-- set is changing, so DROP + CREATE (CREATE OR REPLACE cannot change a
-- function's output row type).
-- Part of: docs/superpowers/specs/2026-08-21-customer-payment-allocation-design.md

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
```

- [ ] **Step 2: Apply it locally**

```bash
npx supabase db reset
```

- [ ] **Step 3: Verify the new signature**

```bash
docker exec supabase_db_broilerapp psql -U postgres -d postgres -c "\sf public.get_sales_with_stats" 2>&1 | head -2
```

Expected: `RETURNS TABLE(id uuid, sale_date date, customer_id uuid, customer_name text, weight_kg numeric, price_per_kg numeric, created_at timestamp with time zone, batch_id uuid, batch_name text, batch_is_active boolean, total_amount numeric, total_paid numeric, balance numeric)`.

- [ ] **Step 4: Verify end-to-end via REST with real data**

```bash
curl -s -X POST 'http://127.0.0.1:54321/auth/v1/admin/users' \
  -H "apikey: <SECRET_KEY from npx supabase status>" \
  -H "Authorization: Bearer <SECRET_KEY from npx supabase status>" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@broiler.local","password":"testpass123","email_confirm":true}' > /tmp/user.json
USER_ID=$(node -e "console.log(require('/tmp/user.json').id)")

docker exec supabase_db_broilerapp psql -U postgres -d postgres -c "
INSERT INTO public.customers (full_name, user_id) VALUES ('Тест Клиент', '$USER_ID') RETURNING id;
"
```

Copy the printed customer id as `<CUSTOMER_ID>`, then:

```bash
docker exec supabase_db_broilerapp psql -U postgres -d postgres -c "
INSERT INTO public.sales (sale_date, customer_id, weight_kg, price_per_kg, user_id)
VALUES ('2026-01-01', '<CUSTOMER_ID>', 50, 10, '$USER_ID');
"

TOKEN=$(curl -s -X POST 'http://127.0.0.1:54321/auth/v1/token?grant_type=password' \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@broiler.local","password":"testpass123"}' | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).access_token))")

curl -s 'http://127.0.0.1:54321/rest/v1/rpc/get_sales_with_stats' \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{}'
```

Expected: JSON array with one sale, `customer_id` equal to `<CUSTOMER_ID>`, `customer_name: "Тест Клиент"`, `balance: 500`, `batch_is_active: null` (no batch attached — confirms the field is still present, just null).

- [ ] **Step 5: Clean up test data**

```bash
docker exec supabase_db_broilerapp psql -U postgres -d postgres -c "DELETE FROM public.sales WHERE customer_id = '<CUSTOMER_ID>'; DELETE FROM public.customers WHERE id = '<CUSTOMER_ID>';"
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260821190000_fix_get_sales_with_stats_customer_id.sql
git commit -m "feat: add customer_id to get_sales_with_stats"
```

---

### Task 4: `SalesPage.jsx` — customer picker replaces free-text field

**Files:**
- Modify: `src/pages/SalesPage.jsx`

**Interfaces:**
- Consumes: `get_sales_with_stats()` fields `customer_id`, `customer_name` (Task 3); table `customers(id, full_name)` (Task 1).
- Produces: `customers` state array (`{id, full_name}[]`) populated in `fetchAllData`, consumed by Task 5's new-payment modal for its own customer picker.

- [ ] **Step 1: Replace the `customer` state with customer-picker state**

In `src/pages/SalesPage.jsx`, replace line 17 (`const [customer, setCustomer] = useState('');`) with:

```jsx
    const [customers, setCustomers] = useState([]);
    const [selectedCustomerId, setSelectedCustomerId] = useState('');
    const [newCustomerName, setNewCustomerName] = useState('');
    const [isAddingCustomer, setIsAddingCustomer] = useState(false);
```

- [ ] **Step 2: Fetch customers in `fetchAllData`**

Replace `fetchAllData` (lines 45-59):

```jsx
    const fetchAllData = async () => {
        setLoading(true);
        const [salesResponse, batchesResponse, customersResponse] = await Promise.all([
            supabase.rpc('get_sales_with_stats'),
            supabase.from('broiler_batches').select('id, batch_name').eq('is_active', true).or('is_summary.eq.false,is_summary.is.null'),
            supabase.from('customers').select('id, full_name').order('full_name')
        ]);

        if (salesResponse.error) { console.error('Ошибка загрузки продаж:', salesResponse.error); }
        else { setAllSales(salesResponse.data); }

        if (batchesResponse.error) { console.error("Ошибка загрузки партий:", batchesResponse.error); }
        else { setActiveBatches(batchesResponse.data); }

        if (customersResponse.error) { console.error("Ошибка загрузки клиентов:", customersResponse.error); }
        else { setCustomers(customersResponse.data); }

        setLoading(false);
    };
```

- [ ] **Step 3: Add the inline "add new customer" handler**

Add this function right after `fetchAllData`:

```jsx
    const handleAddCustomer = async () => {
        const name = newCustomerName.trim();
        if (!name) return;
        setIsAddingCustomer(true);
        const { data: { user } } = await supabase.auth.getUser();
        const { data, error } = await supabase.from('customers').insert([{ full_name: name, user_id: user.id }]).select().single();
        if (error) { alert(error.message); }
        else {
            setCustomers(prev => [...prev, data].sort((a, b) => a.full_name.localeCompare(b.full_name)));
            setSelectedCustomerId(data.id);
            setNewCustomerName('');
        }
        setIsAddingCustomer(false);
    };
```

- [ ] **Step 4: Update `handleSubmitSale` to write `customer_id`**

Replace `handleSubmitSale` (lines 91-103):

```jsx
    const handleSubmitSale = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase.from('sales').insert([{ sale_date: date, customer_id: selectedCustomerId || null, weight_kg: Number(weight), price_per_kg: Number(price), user_id: user.id, batch_id: selectedBatchId || null }]);
        if (error) { alert(error.message); }
        else {
            setDate(new Date().toISOString().slice(0, 10)); setSelectedCustomerId(''); setWeight(''); setPrice(''); setSelectedBatchId('');
            await fetchAllData();
            handleResetFilter();
        }
        setIsSubmitting(false);
    };
```

- [ ] **Step 5: Update `handleEditSaleClick` and `handleUpdateSale` for `customer_id`**

Replace lines 105-110:

```jsx
    const handleEditSaleClick = (sale) => { setEditingSaleId(sale.id); setEditSaleFormData({ sale_date: sale.sale_date, customer_id: sale.customer_id || '', weight_kg: sale.weight_kg, price_per_kg: sale.price_per_kg, batch_id: sale.batch_id || '' }); };
    const handleUpdateSale = async (saleId) => {
        const { error } = await supabase.from('sales').update({ ...editSaleFormData, weight_kg: Number(editSaleFormData.weight_kg), price_per_kg: Number(editSaleFormData.price_per_kg), batch_id: editSaleFormData.batch_id || null, customer_id: editSaleFormData.customer_id || null }).eq('id', saleId);
        if (error) { alert(error.message); }
        else { setEditingSaleId(null); await fetchAllData(); handleResetFilter(); }
    };
```

- [ ] **Step 6: Replace the "Покупатель" text input in the add-sale form**

Replace line 205 (the `<div className="md:col-span-1">...Покупатель...</div>` block):

```jsx
                    <div className="md:col-span-1">
                        <label className="block text-sm font-medium">Покупатель</label>
                        <select value={selectedCustomerId} onChange={e => setSelectedCustomerId(e.target.value)} className="mt-1 w-full p-2 border rounded bg-white">
                            <option value="">-- Без клиента --</option>
                            {customers.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                        </select>
                        <div className="mt-1 flex gap-1">
                            <input type="text" placeholder="+ Новый клиент" value={newCustomerName} onChange={e => setNewCustomerName(e.target.value)} className="flex-1 p-1 text-sm border rounded"/>
                            <button type="button" onClick={handleAddCustomer} disabled={isAddingCustomer || !newCustomerName.trim()} className="px-2 text-sm bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50">+</button>
                        </div>
                    </div>
```

- [ ] **Step 7: Replace the "Покупатель" text input in the edit-sale row**

Replace line 239:

```jsx
                                        <td className="p-2"><select value={editSaleFormData.customer_id} onChange={e => setEditSaleFormData({...editSaleFormData, customer_id: e.target.value})} className="p-1 border rounded w-full bg-white"><option value="">-- Без клиента --</option>{customers.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}</select></td>
```

- [ ] **Step 8: Manual verification**

Start the dev server against local Supabase (see Global Constraints for the env-var override command; use a free port, e.g. `5210`) and Docker Desktop / `npx supabase start` must be running. Log in as `test@broiler.local` / `testpass123` (recreate via admin API if needed — see Global Constraints), go to `/sales`:

1. In "Добавить продажу", type a new name into "+ Новый клиент", click "+". Expected: the name appears in the "Покупатель" dropdown, already selected.
2. Fill in weight/price, submit. Expected: sale appears in the table with that customer's name in the "Покупатель" column (unchanged display — reads `sale.customer_name`, now sourced from the join).
3. Click "Изменить" on that sale. Expected: the customer dropdown in the edit row shows the same customer pre-selected (not blank).
4. Reload the page. Expected: the customer still shows correctly (proves it round-trips through `customer_id`, not just local state).

- [ ] **Step 9: Commit**

```bash
git add src/pages/SalesPage.jsx
git commit -m "feat: replace free-text customer field with customer picker"
```

---

### Task 5: `SalesPage.jsx` — "Новое поступление" auto-allocation modal

**Files:**
- Modify: `src/pages/SalesPage.jsx`

**Interfaces:**
- Consumes: `customers` state (Task 4); `get_sales_with_stats()` fields `customer_id`, `sale_date`, `balance`, `id` (Task 3).
- Produces: no new exports — self-contained UI + handler within this page.

- [ ] **Step 1: Add state for the new-payment modal**

Add after the existing modal state block (after line 32, i.e. after `paymentDate` state):

```jsx
    // --- Состояния для окна "Новое поступление" ---
    const [isNewPaymentModalOpen, setIsNewPaymentModalOpen] = useState(false);
    const [newPaymentCustomerId, setNewPaymentCustomerId] = useState('');
    const [newPaymentAmount, setNewPaymentAmount] = useState('');
    const [newPaymentDate, setNewPaymentDate] = useState(new Date().toISOString().slice(0, 10));
    const [isProcessingPayment, setIsProcessingPayment] = useState(false);
```

- [ ] **Step 2: Add the allocation handler**

Add this function near the other payment handlers (after `handleAddPayment`, i.e. after line 142):

```jsx
    const handleSubmitNewPayment = async (e) => {
        e.preventDefault();
        if (!newPaymentCustomerId) { alert('Выберите клиента.'); return; }
        const amount = Number(newPaymentAmount);
        if (!(amount > 0)) { alert('Сумма должна быть больше нуля.'); return; }

        setIsProcessingPayment(true);
        const { data: freshSales, error: fetchError } = await supabase.rpc('get_sales_with_stats');
        if (fetchError) { alert(fetchError.message); setIsProcessingPayment(false); return; }

        const unpaidSales = freshSales
            .filter(s => s.customer_id === newPaymentCustomerId && s.balance > 0)
            .sort((a, b) => new Date(a.sale_date) - new Date(b.sale_date));

        const totalOwed = unpaidSales.reduce((sum, s) => sum + s.balance, 0);
        if (amount > totalOwed) {
            alert(`У клиента остаток всего ${totalOwed.toFixed(2)} TJS, введено ${amount.toFixed(2)} TJS.`);
            setIsProcessingPayment(false);
            return;
        }

        const { data: { user } } = await supabase.auth.getUser();
        let remaining = amount;
        const rowsToInsert = [];
        for (const sale of unpaidSales) {
            if (remaining <= 0) break;
            const chunk = Math.min(remaining, sale.balance);
            rowsToInsert.push({ sale_id: sale.id, payment_date: newPaymentDate, amount: chunk, user_id: user.id });
            remaining -= chunk;
        }

        const { error: insertError } = await supabase.from('payments').insert(rowsToInsert);
        if (insertError) { alert(insertError.message); }
        else {
            setNewPaymentCustomerId(''); setNewPaymentAmount('');
            setIsNewPaymentModalOpen(false);
            await fetchAllData();
            handleResetFilter();
        }
        setIsProcessingPayment(false);
    };
```

- [ ] **Step 3: Add the "Новое поступление" button**

In the header area, replace lines 177-183 (the `<div className="flex flex-wrap justify-between...">` block) with:

```jsx
            <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">Учет продаж и поступлений</h1>
                <div className="flex items-center gap-4">
                    <button onClick={() => setIsNewPaymentModalOpen(true)} className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 text-sm font-medium">+ Новое поступление</button>
                    <label className="flex items-center text-sm text-gray-600 cursor-pointer">
                        <input type="checkbox" checked={showArchived} onChange={() => setShowArchived(!showArchived)} className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"/>
                        <span className="ml-2">Показать продажи архивных партий</span>
                    </label>
                </div>
            </div>
```

- [ ] **Step 4: Add the modal JSX**

Add this block right before the closing `</div>` at the end of the component's `return` (i.e., right after the existing payments-modal block that currently ends around line 323, before line 324's `</div>`):

```jsx
            {isNewPaymentModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                        <div className="p-6 border-b"><h3 className="text-xl font-semibold">Новое поступление</h3></div>
                        <form onSubmit={handleSubmitNewPayment} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium">Клиент</label>
                                <select value={newPaymentCustomerId} onChange={e => setNewPaymentCustomerId(e.target.value)} required className="mt-1 w-full p-2 border rounded bg-white">
                                    <option value="">-- Выберите клиента --</option>
                                    {customers.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium">Дата</label>
                                <input type="date" value={newPaymentDate} onChange={e => setNewPaymentDate(e.target.value)} required className="mt-1 w-full p-2 border rounded"/>
                            </div>
                            <div>
                                <label className="block text-sm font-medium">Сумма</label>
                                <input type="number" step="0.01" value={newPaymentAmount} onChange={e => setNewPaymentAmount(e.target.value)} required className="mt-1 w-full p-2 border rounded"/>
                            </div>
                            <div className="flex justify-end gap-2 pt-2">
                                <button type="button" onClick={() => setIsNewPaymentModalOpen(false)} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300">Отмена</button>
                                <button type="submit" disabled={isProcessingPayment} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">{isProcessingPayment ? 'Обработка...' : 'Провести'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
```

- [ ] **Step 5: Manual verification — split across two sales**

With the dev server running against local Supabase (same setup as Task 4):

1. Add a customer "Тест Клиент 2" (via the add-sale form's inline add, or directly).
2. Add two sales for that customer: Sale A — 50 kg @ 10 (total 500), Sale B — 30 kg @ 10 (total 300), both dated so A is earlier than B.
3. Click "+ Новое поступление", pick "Тест Клиент 2", enter 600, submit.
4. Expected: Sale A shows "Выплачено" (fully paid, balance 0), Sale B shows "Остаток: 100,00 TJS" (500 fully covered + 100 of the 300 covered by the remaining 100 of the 600). Reload and confirm both figures persist.
5. Check the DB directly to confirm two separate `payments` rows were created (one per sale, not one payment covering both):

```bash
docker exec supabase_db_broilerapp psql -U postgres -d postgres -c "SELECT sale_id, amount FROM public.payments ORDER BY created_at DESC LIMIT 2;"
```

Expected: two rows, amounts `100` and `500` (order may vary), each with a different `sale_id`.

- [ ] **Step 6: Manual verification — overpayment rejected**

Click "+ Новое поступление" again for the same customer (now fully paid), enter any amount > 0, submit. Expected: alert `У клиента остаток всего 0.00 TJS, введено ...` and no new row in `payments`.

- [ ] **Step 7: Clean up test data**

```bash
docker exec supabase_db_broilerapp psql -U postgres -d postgres -c "DELETE FROM public.sales WHERE customer_id IN (SELECT id FROM public.customers WHERE full_name LIKE 'Тест Клиент%'); DELETE FROM public.customers WHERE full_name LIKE 'Тест Клиент%';"
```

- [ ] **Step 8: Commit**

```bash
git add src/pages/SalesPage.jsx
git commit -m "feat: add auto-allocating new-payment modal"
```

---

### Task 6: `SalesPage.jsx` — strip the per-sale modal to read-only history

**Files:**
- Modify: `src/pages/SalesPage.jsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new — this task only removes code. Task 5 must be complete first, so there's no gap where payments can't be entered at all.

- [ ] **Step 1: Remove `handleAddPayment`, `handleEditPaymentClick`, `handleUpdatePayment`**

Delete these three functions (originally lines 126-158 — locate by name, since line numbers shifted after Task 5's edits): `handleAddPayment`, `handleEditPaymentClick`, `handleUpdatePayment`. Keep `handleDeletePayment` — it's still used.

- [ ] **Step 2: Remove now-unused state**

Delete these state declarations (originally lines 31-32 and 35-36):

```jsx
    const [paymentAmount, setPaymentAmount] = useState('');
    const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
```

```jsx
    const [editingPaymentId, setEditingPaymentId] = useState(null);
    const [editPaymentFormData, setEditPaymentFormData] = useState({});
```

- [ ] **Step 3: Replace the payments-modal JSX with a read-only version**

Replace the whole `{isModalOpen && selectedSale && (...)}` block (originally lines 278-323) with:

```jsx
            {isModalOpen && selectedSale && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                   <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
                        <div className="p-6 border-b"><h3 className="text-xl font-semibold">История платежей по продаже</h3><p className="text-sm text-gray-500">от {new Date(selectedSale.sale_date).toLocaleDateString()} (Покупатель: {selectedSale.customer_name || 'Не указан'})</p></div>
                        <div className="p-6 grid grid-cols-1 sm:grid-cols-3 gap-4 text-center border-b">
                            <div><p className="text-sm text-gray-500">Всего к оплате</p><p className="font-bold text-lg">{new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'TJS' }).format(selectedSale.total_amount)}</p></div>
                            <div><p className="text-sm text-gray-500">Оплачено</p><p className="font-bold text-lg text-green-600">{new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'TJS' }).format(selectedSale.total_paid)}</p></div>
                            <div><p className="text-sm text-gray-500">Остаток</p><p className="font-bold text-lg text-red-600">{new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'TJS' }).format(selectedSale.balance)}</p></div>
                        </div>
                        <div className="p-6">
                            <h4 className="font-semibold mb-2">История платежей:</h4>
                            <div className="space-y-2 max-h-64 overflow-y-auto border rounded p-2">
                                {modalPayments.map(p => (
                                    <div key={p.id} className="p-2 bg-gray-50 rounded flex justify-between items-center">
                                        <div><span>{new Date(p.payment_date).toLocaleDateString()}</span><span className="font-semibold ml-4">{new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'TJS' }).format(p.amount)}</span></div>
                                        <button onClick={() => handleDeletePayment(p.id)} className="text-xs text-red-600 hover:underline px-2 py-2">Удал.</button>
                                    </div>
                                ))}
                                {modalPayments.length === 0 && <p className="text-gray-500 text-center py-4">Платежей пока нет.</p>}
                            </div>
                        </div>
                        <div className="p-4 bg-gray-50 text-right rounded-b-lg"><button onClick={() => setIsModalOpen(false)} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300">Закрыть</button></div>
                    </div>
                </div>
            )}
```

- [ ] **Step 4: Manual verification**

With the dev server running against local Supabase:

1. Add a sale, then add a payment for it via "+ Новое поступление" (per Task 5's flow).
2. Click the sale's row. Expected: modal shows "История платежей по продаже" (not "Платежи по продаже"), the payment appears in the history list, there is no date/amount/"Добавить" form anywhere in the modal.
3. Click "Удал." on the payment. Expected: it's removed, the sale's "Оплачено"/"Остаток" figures in the modal and in the underlying table both update.
4. Confirm no console errors on this page (`handleEditPaymentClick`/`handleUpdatePayment`/`handleAddPayment` must not be referenced anywhere still — a leftover reference would throw `ReferenceError` at render time, not silently no-op).

- [ ] **Step 5: Commit**

```bash
git add src/pages/SalesPage.jsx
git commit -m "fix: trim per-sale payments modal to read-only history"
```

---

## After all tasks: deploy to production

Production runs on Vercel + a separate cloud Supabase project (`.env.local` in the repo root already points there). Once all tasks above are verified locally:

1. Apply the three new migrations to the production Supabase project, **in filename order**: `20260821170000_create_customers.sql`, `20260821180000_add_customer_id_to_sales.sql`, `20260821190000_fix_get_sales_with_stats_customer_id.sql` — via `psql <connection-string> -f <file>` (same pattern used for every prior migration batch in this repo: a throwaway `postgres:16-alpine` Docker container running `psql` against the production connection string, since this environment has no local `psql` binary). Do **not** run `20260101000000_baseline_from_schema_sql.sql` or any of the pre-`20260821*` migrations against production — those represent the already-live schema, only the new numbered ones need applying.
2. Before applying, run the same kind of pre-deploy sanity check used for earlier migrations in this repo: `SELECT count(*), count(DISTINCT customer_name) FROM public.sales WHERE customer_name IS NOT NULL;` against production, to know how many distinct customer names the backfill will actually create — surface this number before running Task 2's migration on production, since it's irreversible-in-spirit (undoing it means manually merging duplicate customers created from near-duplicate name spellings).
3. Merge the frontend changes to `main` — Vercel deploys automatically from there per the existing setup.
