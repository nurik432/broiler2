# Точная себестоимость и прибыль по активным партиям — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the batch profit calculation include feed, medicine, and coal costs (currently missing entirely), scoped to active batches, and surface it through the existing summary batch.

**Architecture:** Two migrations add cost-tracking columns (feed price/type, optional `batch_id` on medicine/coal transactions) and a new `get_active_summary_report()` Postgres RPC that sums revenue/costs across active batches plus unattributed records. Three existing pages (`FeedPage.jsx`, `CoalPage.jsx`, `MedicinesPage.jsx`) get form updates to capture the new fields; `BatchReportPage.jsx` calls the new RPC when viewing the summary batch; `BatchesPage.jsx` gets a report link for the summary batch (currently missing).

**Tech Stack:** Vite + React 19, Supabase (Postgres + PostgREST), Tailwind v4, no automated test suite (this repo has none — verification below is manual: SQL via the local Docker Supabase stack for backend tasks, browser interaction via the dev server for frontend tasks).

**Spec:** `docs/superpowers/specs/2026-08-21-active-summary-cost-profit-design.md`

## Global Constraints

- No test suite in this repo — every task's "test" is a concrete manual verification (exact SQL/curl commands or exact UI steps + expected result), not an automated test file.
- Local dev stack is already configured: `npx supabase start` (Docker) for the database, `.env.local` pointing at it, `.claude/launch.json` (`broiler-dev` config) for `npm run dev` on port 5173.
- Currency formatting: reuse each page's existing `formatCurrency` helper (`new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'TJS' })`) — don't invent a new one.
- Every new Supabase write must include `user_id: user.id` (from `supabase.auth.getUser()`), matching the existing pattern in `CoalPage.jsx`/`MedicinesPage.jsx`.
- `transaction_type` values are always `'purchase' | 'debt' | 'payment'` (existing convention on `coal_transactions`/`medicine_transactions`); `feed_deliveries.transaction_type` only ever needs `'purchase' | 'debt'` (no feed "payment" row — feed debt payments go through the existing `debts`/`debt_payments` tables, out of scope for this plan per the spec).
- Batch pickers (dropdowns of "attach to a batch") must exclude the summary batch itself — use the existing filter pattern `.or('is_summary.eq.false,is_summary.is.null')` (already used in `src/pages/BatchesPage.jsx`'s `handleSyncHistory`).

---

### Task 1: Migration — cost-tracking columns

**Files:**
- Create: `supabase/migrations/20260821120000_add_cost_columns.sql`

**Interfaces:**
- Produces: `feed_deliveries.price_per_kg`, `feed_deliveries.amount`, `feed_deliveries.transaction_type`, `feed_deliveries.company` (all nullable); `medicine_transactions.batch_id`, `coal_transactions.batch_id` (nullable, `REFERENCES broiler_batches(id)`). Task 2 and Task 3/4/5 depend on these column names exactly.

- [ ] **Step 1: Write the migration**

```sql
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
```

- [ ] **Step 2: Apply it to the local Docker Supabase stack**

Run (from repo root, Docker Desktop must be running):

```bash
npx supabase db reset
```

This reapplies every migration from scratch (including the pre-existing
`20260101000000_baseline_from_schema_sql.sql` baseline). Expected: ends with
`Finished supabase db reset` and no error about `feed_deliveries` or
`medicine_transactions`/`coal_transactions`.

- [ ] **Step 3: Verify the columns exist**

```bash
docker exec supabase_db_broilerapp psql -U postgres -d postgres -c "\d public.feed_deliveries" | grep -E "price_per_kg|amount|transaction_type|company"
docker exec supabase_db_broilerapp psql -U postgres -d postgres -c "\d public.medicine_transactions" | grep batch_id
docker exec supabase_db_broilerapp psql -U postgres -d postgres -c "\d public.coal_transactions" | grep batch_id
```

Expected: each command prints the matching column line (e.g.
`price_per_kg | numeric |`). If a command prints nothing, the migration
didn't apply — re-check Step 1's SQL for typos and re-run Step 2.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260821120000_add_cost_columns.sql
git commit -m "feat: add feed cost columns and batch_id to medicine/coal transactions"
```

---

### Task 2: Migration — `get_active_summary_report()` function

**Files:**
- Create: `supabase/migrations/20260821120100_add_get_active_summary_report.sql`

**Interfaces:**
- Consumes: columns from Task 1 (`feed_deliveries.amount`/`transaction_type`, `medicine_transactions.batch_id`, `coal_transactions.batch_id`).
- Produces: RPC `get_active_summary_report()` — no arguments, returns one row: `total_sales numeric, total_feed_cost numeric, total_medicine_cost numeric, total_coal_cost numeric, total_expenses numeric, total_salaries numeric, total_cost numeric, profit numeric`. Task 6 (`BatchReportPage.jsx`) calls this by exact name and reads these exact field names from `data[0]`.

- [ ] **Step 1: Write the migration**

```sql
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
```

- [ ] **Step 2: Apply it locally**

```bash
npx supabase db reset
```

Expected: no error. Confirm the function exists:

```bash
docker exec supabase_db_broilerapp psql -U postgres -d postgres -c "\df public.get_active_summary_report"
```

Expected: prints one row naming the function.

- [ ] **Step 3: Create a throwaway test user and get its id + access token**

```bash
curl -s -X POST 'http://127.0.0.1:54321/auth/v1/admin/users' \
  -H "apikey: <SECRET_KEY>" \
  -H "Authorization: Bearer <SECRET_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"email":"cost-test@broiler.local","password":"testpass123","email_confirm":true}' \
  > /tmp/user.json
node -e "console.log(require('/tmp/user.json').id)"
```

Copy the printed UUID — call it `<USER_ID>` in the next steps.

```bash
curl -s -X POST 'http://127.0.0.1:54321/auth/v1/token?grant_type=password' \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0" \
  -H "Content-Type: application/json" \
  -d '{"email":"cost-test@broiler.local","password":"testpass123"}' \
  > /tmp/session.json
node -e "console.log(require('/tmp/session.json').access_token)"
```

Copy the printed token — call it `<ACCESS_TOKEN>`.

(If `sb_secret_...`/anon key above no longer match this checkout's local
stack, re-run `npx supabase start` and use the `SECRET_KEY`/`ANON_KEY` it
prints instead — they're stable per-project but can differ across a fresh
`supabase init`.)

- [ ] **Step 4: Seed deterministic test data via psql, as `<USER_ID>`**

Replace `<USER_ID>` below with the value from Step 3, then run:

```bash
docker exec supabase_db_broilerapp psql -U postgres -d postgres -v user_id="'<USER_ID>'" <<'EOF'
-- one active batch, one archived batch
INSERT INTO public.broiler_batches (id, batch_name, initial_quantity, start_date, is_active, user_id)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'Test Active', 100, '2026-01-01', true, :user_id::uuid),
  ('22222222-2222-2222-2222-222222222222', 'Test Archived', 100, '2026-01-01', false, :user_id::uuid);

-- feed: 1000 on the active batch (counts), 5000 on the archived batch (must NOT count)
INSERT INTO public.feed_deliveries (user_id, delivery_date, feed_type, quantity_kg, batch_id, price_per_kg, amount, transaction_type)
VALUES
  (:user_id::uuid, '2026-01-05', 'старт', 200, '11111111-1111-1111-1111-111111111111', 5, 1000, 'purchase'),
  (:user_id::uuid, '2026-01-05', 'старт', 500, '22222222-2222-2222-2222-222222222222', 10, 5000, 'purchase');

-- medicine: 300, unattributed (no batch_id) — must count
INSERT INTO public.medicine_transactions (user_id, transaction_date, transaction_type, quantity, amount)
VALUES (:user_id::uuid, '2026-01-05', 'debt', 10, 300);

-- coal: 200 'payment' on the active batch — must NOT count (payment isn't a new cost)
INSERT INTO public.coal_transactions (user_id, transaction_date, transaction_type, amount, batch_id)
VALUES (:user_id::uuid, '2026-01-05', 'payment', 200, '11111111-1111-1111-1111-111111111111');

-- sale on the active batch: 100kg * 10 = 1000
INSERT INTO public.sales (user_id, sale_date, weight_kg, price_per_kg, batch_id)
VALUES (:user_id::uuid, '2026-01-10', 100, 10, '11111111-1111-1111-1111-111111111111');

-- salary on the active batch: 150
INSERT INTO public.salaries (user_id, amount, payment_type, payment_date, batch_id)
VALUES (:user_id::uuid, 150, 'зарплата', '2026-01-10', '11111111-1111-1111-1111-111111111111');
EOF
```

- [ ] **Step 5: Call the RPC as that user and check the numbers**

```bash
curl -s 'http://127.0.0.1:54321/rest/v1/rpc/get_active_summary_report' \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" -d '{}'
```

Expected JSON (order of keys may vary):

```json
[{"total_sales":1000,"total_feed_cost":1000,"total_medicine_cost":300,"total_coal_cost":0,"total_expenses":0,"total_salaries":150,"total_cost":1450,"profit":-450}]
```

If `total_feed_cost` is `6000` instead of `1000`, the archived-batch
exclusion is broken (check `active_ids`/`is_active` filter). If
`total_coal_cost` is `200` instead of `0`, the `transaction_type IN
('purchase','debt')` filter is missing or wrong.

- [ ] **Step 6: Clean up test data**

```bash
docker exec supabase_db_broilerapp psql -U postgres -d postgres -c "DELETE FROM public.broiler_batches WHERE id IN ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222');"
```

(Cascades to feed/medicine/coal/sales/salaries rows via their FKs where
applicable; the unattributed medicine row has no batch FK so delete it too:)

```bash
docker exec supabase_db_broilerapp psql -U postgres -d postgres -c "DELETE FROM public.medicine_transactions WHERE user_id = '<USER_ID>';"
```

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260821120100_add_get_active_summary_report.sql
git commit -m "feat: add get_active_summary_report RPC for active-batch cost/profit"
```

---

### Task 3: `FeedPage.jsx` — real feed cost instead of the `localStorage` guess

**Files:**
- Modify: `src/pages/FeedPage.jsx`

**Interfaces:**
- Consumes: `feed_deliveries.price_per_kg`/`amount`/`transaction_type`/`company` (Task 1).
- Produces: no new exports; this task changes the form and summary math only.

- [ ] **Step 1: Remove the `localStorage` price state and its effects**

In `src/pages/FeedPage.jsx`, delete lines 26–39 (the `feedPrices` state, the
`useEffect` reading `localStorage.getItem('feedPrices')`, and
`handlePriceChange`):

```jsx
    const [feedPrices, setFeedPrices] = useState({ start: 0, growth: 0, finish: 0 });

    useEffect(() => {
        const saved = localStorage.getItem('feedPrices');
        if (saved) {
            try { setFeedPrices(JSON.parse(saved)); } catch { /* некорректные сохранённые цены — игнорируем */ }
        }
    }, []);

    const handlePriceChange = (type, value) => {
        const newPrices = { ...feedPrices, [type]: Number(value) };
        setFeedPrices(newPrices);
        localStorage.setItem('feedPrices', JSON.stringify(newPrices));
    };
```

- [ ] **Step 2: Fetch active batches without the summary batch, add form state**

Replace the batches fetch on line 48 (`.eq('is_active', true)`) to also
exclude the summary batch:

```jsx
            supabase.from('broiler_batches').select('id, batch_name').eq('is_active', true).or('is_summary.eq.false,is_summary.is.null')
```

Add new form state next to the existing `bags`/`selectedBatchId` state
(around line 19-20):

```jsx
    const [pricePerKg, setPricePerKg] = useState('');
    const [transactionType, setTransactionType] = useState('purchase');
    const [company, setCompany] = useState('');
```

- [ ] **Step 3: Replace the cost calculation (lines 79-95) to use real `amount` from the DB**

```jsx
    const { feedTotalsKg, feedTotalsBags, totalFeedKg, totalFeedBags, feedCosts, totalFeedCost } = useMemo(() => {
        const kg = filteredDeliveries.reduce((acc, d) => {
            if (d.feed_type === 'старт') acc.start += d.quantity_kg;
            else if (d.feed_type === 'рост') acc.growth += d.quantity_kg;
            else if (d.feed_type === 'финиш') acc.finish += d.quantity_kg;
            return acc;
        }, { start: 0, growth: 0, finish: 0 });
        const b = { start: kg.start / KG_PER_BAG, growth: kg.growth / KG_PER_BAG, finish: kg.finish / KG_PER_BAG };
        const costs = filteredDeliveries.reduce((acc, d) => {
            const key = d.feed_type === 'старт' ? 'start' : d.feed_type === 'рост' ? 'growth' : 'finish';
            acc[key] += Number(d.amount) || 0;
            return acc;
        }, { start: 0, growth: 0, finish: 0 });
        const totalKg = kg.start + kg.growth + kg.finish;
        const totalCost = costs.start + costs.growth + costs.finish;
        return { feedTotalsKg: kg, feedTotalsBags: b, totalFeedKg: totalKg, totalFeedBags: totalKg / KG_PER_BAG, feedCosts: costs, totalFeedCost: totalCost };
    }, [filteredDeliveries]);
```

- [ ] **Step 4: Update `handleSubmit` (lines 99-115) to save price/type/company**

```jsx
    const handleSubmit = async (e) => {
        e.preventDefault();
        const bagsNum = Number(bags);
        if (bagsNum <= 0) { alert('Количество мешков должно быть больше нуля.'); return; }
        const priceNum = Number(pricePerKg);
        const quantityKg = bagsNum * KG_PER_BAG;
        setIsSubmitting(true);
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase.from('feed_deliveries').insert([{
            delivery_date: date, feed_type: feedType, quantity_kg: quantityKg,
            user_id: user.id, batch_id: selectedBatchId || null,
            price_per_kg: priceNum || null,
            amount: priceNum > 0 ? quantityKg * priceNum : null,
            transaction_type: priceNum > 0 ? transactionType : null,
            company: company || null
        }]);
        if (error) { alert(error.message); }
        else {
            setBags(''); setSelectedBatchId(''); setPricePerKg(''); setCompany('');
            await fetchData();
        }
        setIsSubmitting(false);
    };
```

- [ ] **Step 5: Add price/type/company inputs to the form (inside the form on lines 187-209, alongside the existing grid)**

The grid currently has 5 items (date, feed type, bags, batch-select, submit
button) at `md:grid-cols-5`. Change it to `md:grid-cols-8` and add three
fields after the batch-select `div` (after line 200, before the submit
button):

```jsx
                        <div><label className="block text-sm font-medium">Цена за кг</label><input type="number" step="0.01" placeholder="5.00" value={pricePerKg} onChange={e => setPricePerKg(e.target.value)} className="mt-1 w-full p-2 border rounded-md"/></div>
                        <div><label className="block text-sm font-medium">Тип оплаты</label><select value={transactionType} onChange={e => setTransactionType(e.target.value)} className="mt-1 w-full p-2 border rounded-md bg-white"><option value="purchase">Сразу</option><option value="debt">В долг</option></select></div>
                        <div><label className="block text-sm font-medium">Фирма</label><input type="text" placeholder="(необязательно)" value={company} onChange={e => setCompany(e.target.value)} className="mt-1 w-full p-2 border rounded-md"/></div>
```

- [ ] **Step 6: Update the table row cost display (lines 241-248) to read `d.amount` directly**

```jsx
                                        <td className="px-6 py-4 font-medium text-gray-800">
                                            {d.amount > 0 ? formatCurrency(d.amount) : '–'}
                                        </td>
```

- [ ] **Step 7: Manual verification**

Start the dev server and local Supabase if not already running:

```bash
npx supabase status
```

(If it prints "supabase local development setup is not running", run
`npx supabase start` first.) Then, with `npm run dev` running:

1. Open `/feed`, add a delivery: 10 bags, price 5.00, тип "Сразу".
2. Expected: the new row shows a real сумма (`2000 TJS` for 10×40kg×5), and
   the "Сводка по корму" totals now come from real stored amounts, not a
   price you typed into a separate box (there's no separate price box
   anymore — confirm it's gone).
3. Reload the page (`F5`) — the price/сумма must still be there (proving
   it's persisted in the DB, not `localStorage`).

- [ ] **Step 8: Commit**

```bash
git add src/pages/FeedPage.jsx
git commit -m "feat: persist real feed purchase cost instead of localStorage guess"
```

---

### Task 4: `CoalPage.jsx` — optional batch attribution

**Files:**
- Modify: `src/pages/CoalPage.jsx`

**Interfaces:**
- Consumes: `coal_transactions.batch_id` (Task 1).

- [ ] **Step 1: Fetch active (non-summary) batches**

Add state and a fetch alongside the existing `transactions` state (near
line 8):

```jsx
    const [activeBatches, setActiveBatches] = useState([]);
```

Extend `fetchData` (lines 30-41) to also fetch batches:

```jsx
    const fetchData = async () => {
        setLoading(true);
        const [transRes, batchesRes] = await Promise.all([
            supabase
                .from('coal_transactions').select('*')
                .order('transaction_date', { ascending: false })
                .order('created_at', { ascending: false }),
            supabase.from('broiler_batches').select('id, batch_name').eq('is_active', true).or('is_summary.eq.false,is_summary.is.null')
        ]);

        if (transRes.error) console.error('Ошибка транзакций:', transRes.error);
        else setTransactions(transRes.data);

        if (batchesRes.error) console.error('Ошибка партий:', batchesRes.error);
        else setActiveBatches(batchesRes.data);

        setLoading(false);
    };
```

- [ ] **Step 2: Add batch selection state and include it on purchase/debt inserts**

Add state next to `description` (line 21):

```jsx
    const [selectedBatchId, setSelectedBatchId] = useState('');
```

In `handleAddTransaction` (lines 65-95), add `batch_id: selectedBatchId ||
null` to the inserted object (after `description: description || null,`)
and reset it on success (alongside `setQuantity(''); setPrice('');
setDescription('');`):

```jsx
        const { error } = await supabase.from('coal_transactions').insert([{
            transaction_date: date,
            transaction_type: type,
            quantity_kg: qty,
            price_per_kg: priceVal,
            amount: totalAmount,
            description: description || null,
            batch_id: selectedBatchId || null,
            user_id: user.id
        }]);

        if (error) {
            alert('Ошибка: ' + error.message);
        } else {
            setQuantity(''); setPrice(''); setDescription(''); setSelectedBatchId('');
            await fetchData();
        }
```

- [ ] **Step 3: Add the batch `<select>` to `renderPurchaseDebtFields` (lines 156-198)**

Add a fifth field inside the grid (change `lg:grid-cols-4` to
`lg:grid-cols-5`), after the "Описание" field:

```jsx
                <div>
                    <label className="block text-sm font-medium text-gray-700">Партия</label>
                    <select value={selectedBatchId} onChange={e => setSelectedBatchId(e.target.value)}
                        className="mt-1 w-full p-2 border rounded-md bg-white">
                        <option value="">-- Не привязывать --</option>
                        {activeBatches.map(b => <option key={b.id} value={b.id}>{b.batch_name}</option>)}
                    </select>
                </div>
```

- [ ] **Step 4: Manual verification**

With the dev server running: open `/coal`, add a purchase, pick a batch
from the new "Партия" dropdown, submit. Expected: no error, the row appears
in the history table. Open Supabase Studio
(`http://127.0.0.1:54323` → Table Editor → `coal_transactions`) and confirm
the new row's `batch_id` matches the picked batch.

- [ ] **Step 5: Commit**

```bash
git add src/pages/CoalPage.jsx
git commit -m "feat: allow attaching coal purchases to a batch"
```

---

### Task 5: `MedicinesPage.jsx` — optional batch attribution

**Files:**
- Modify: `src/pages/MedicinesPage.jsx`

**Interfaces:**
- Consumes: `medicine_transactions.batch_id` (Task 1).

Mirrors Task 4 exactly, applied to `MedicinesPage.jsx`.

- [ ] **Step 1: Fetch active (non-summary) batches**

Add state near line 10 (`const [medicines, setMedicines] = useState([]);`):

```jsx
    const [activeBatches, setActiveBatches] = useState([]);
```

Extend `fetchData` (lines 39-57) to also fetch batches — add a third
promise to `Promise.all` and handle its result:

```jsx
    const fetchData = async () => {
        setLoading(true);
        const [transRes, medsRes, batchesRes] = await Promise.all([
            supabase
                .from('medicine_transactions')
                .select('*, medicine:medicines(name)')
                .order('transaction_date', { ascending: false })
                .order('created_at', { ascending: false }),
            supabase.from('medicines').select('id, name').order('name'),
            supabase.from('broiler_batches').select('id, batch_name').eq('is_active', true).or('is_summary.eq.false,is_summary.is.null')
        ]);

        if (transRes.error) console.error('Ошибка транзакций:', transRes.error);
        else setTransactions(transRes.data);

        if (medsRes.error) console.error('Ошибка лекарств:', medsRes.error);
        else setMedicines(medsRes.data);

        if (batchesRes.error) console.error('Ошибка партий:', batchesRes.error);
        else setActiveBatches(batchesRes.data);

        setLoading(false);
    };
```

- [ ] **Step 2: Add batch selection state and include it on purchase/debt inserts**

Add state next to `company` (line 26):

```jsx
    const [selectedBatchId, setSelectedBatchId] = useState('');
```

In `handleAddTransaction` (lines 108-142), add `batch_id: selectedBatchId
|| null` to the inserted object and reset it on success:

```jsx
        const { error } = await supabase.from('medicine_transactions').insert([{
            transaction_date: date,
            transaction_type: type,
            medicine_id: medicineId || null,
            quantity: qty,
            unit,
            price_per_unit: price,
            amount: totalAmount,
            description: description || null,
            company: company || null,
            batch_id: selectedBatchId || null,
            user_id: user.id
        }]);

        if (error) {
            alert('Ошибка: ' + error.message);
        } else {
            setQuantity(''); setPricePerUnit(''); setDescription(''); setMedicineId(''); setCompany(''); setSelectedBatchId('');
            await fetchData();
        }
```

- [ ] **Step 3: Add the batch `<select>` to `renderPurchaseDebtFields` (lines 206-...)**

Add a field inside the grid, after the "Фирма" field (after line 256):

```jsx
                <div>
                    <label className="block text-sm font-medium text-gray-700">Партия</label>
                    <select value={selectedBatchId} onChange={e => setSelectedBatchId(e.target.value)}
                        className="mt-1 w-full p-2 border rounded-md bg-white">
                        <option value="">-- Не привязывать --</option>
                        {activeBatches.map(b => <option key={b.id} value={b.id}>{b.batch_name}</option>)}
                    </select>
                </div>
```

- [ ] **Step 4: Manual verification**

With the dev server running: open `/medicines`, add a purchase with a batch
selected, submit. Expected: no error, row appears in history. Confirm via
Supabase Studio's Table Editor that `medicine_transactions.batch_id` was
set correctly.

- [ ] **Step 5: Commit**

```bash
git add src/pages/MedicinesPage.jsx
git commit -m "feat: allow attaching medicine purchases to a batch"
```

---

### Task 6: `BatchReportPage.jsx` — use the new RPC for the summary batch

**Files:**
- Modify: `src/pages/BatchReportPage.jsx`

**Interfaces:**
- Consumes: `get_active_summary_report()` (Task 2) — returns `{ total_sales, total_feed_cost, total_medicine_cost, total_coal_cost, total_expenses, total_salaries, total_cost, profit }`. `generate_batch_report(p_batch_id)` (pre-existing) — returns `{ batch_name, start_date, end_date, total_sales, total_expenses, total_salaries, profit }`.

- [ ] **Step 1: Fetch `is_summary` before deciding which RPC to call**

Replace the `fetchReport` function (lines 14-29):

```jsx
        const fetchReport = async () => {
            setLoading(true);

            const { data: batchRow, error: batchError } = await supabase
                .from('broiler_batches')
                .select('is_summary, batch_name')
                .eq('id', batchId)
                .single();

            if (batchError) {
                console.error("Ошибка при загрузке партии:", batchError);
                setError("Не удалось загрузить партию.");
                setLoading(false);
                return;
            }

            if (batchRow.is_summary) {
                const { data, error: rpcError } = await supabase.rpc('get_active_summary_report');
                if (rpcError) {
                    console.error("Ошибка при генерации сводного отчета:", rpcError);
                    setError("Не удалось сгенерировать сводный отчет.");
                } else {
                    setReport({ ...data[0], batch_name: batchRow.batch_name, is_summary: true });
                }
            } else {
                const { data, error: rpcError } = await supabase.rpc('generate_batch_report', {
                    p_batch_id: batchId
                });
                if (rpcError) {
                    console.error("Ошибка при генерации отчета:", rpcError);
                    setError("Не удалось сгенерировать отчет. Убедитесь, что партия существует и у вас есть к ней доступ.");
                } else {
                    setReport(data);
                }
            }
            setLoading(false);
        };
```

- [ ] **Step 2: Render the extra cost breakdown when `report.is_summary` is true**

Replace the "Расходы" block (lines 74-87) to show feed/medicine/coal when
present, keeping the existing two-line layout for a normal batch report:

```jsx
                    <div>
                        <h3 className="text-lg font-semibold mb-2 text-gray-700">Расходы</h3>
                        <div className="space-y-2 bg-red-50 p-3 rounded-lg">
                            {report.is_summary && (
                                <>
                                    <div className="flex justify-between items-center">
                                        <p>Корм:</p>
                                        <p className="font-semibold">{formatCurrency(report.total_feed_cost)}</p>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <p>Лекарства:</p>
                                        <p className="font-semibold">{formatCurrency(report.total_medicine_cost)}</p>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <p>Уголь:</p>
                                        <p className="font-semibold">{formatCurrency(report.total_coal_cost)}</p>
                                    </div>
                                </>
                            )}
                            <div className="flex justify-between items-center">
                                <p>Расходы (привязанные):</p>
                                <p className="font-semibold">{formatCurrency(report.total_expenses)}</p>
                            </div>
                            <div className="flex justify-between items-center">
                                <p>Зарплаты (привязанные):</p>
                                <p className="font-semibold">{formatCurrency(report.total_salaries)}</p>
                            </div>
                        </div>
                    </div>
```

- [ ] **Step 3: Guard the date-range line for the summary report (it has no `start_date`/`end_date`)**

Replace lines 60-62:

```jsx
                {!report.is_summary && (
                    <p className="text-gray-500 mb-6 border-b pb-4">
                        Период: {new Date(report.start_date).toLocaleDateString()} – {new Date(report.end_date).toLocaleDateString()}
                    </p>
                )}
                {report.is_summary && (
                    <p className="text-gray-500 mb-6 border-b pb-4">Сводка по всем активным партиям</p>
                )}
```

- [ ] **Step 4: Manual verification**

With the dev server + local Supabase running and the test batches/records
from Task 2's Step 4 still present (or re-seed a small amount of test data
through the actual UI — feed/medicine/coal/sale/salary on one active
batch):

1. Find the summary batch's id: Supabase Studio → Table Editor →
   `broiler_batches` → row where `is_summary = true` → copy its `id`.
2. Navigate to `/batch/<that id>/report` directly in the browser.
3. Expected: page shows "Сводка по всем активным партиям" instead of a
   date range, and the "Расходы" section shows Корм/Лекарства/Уголь rows in
   addition to Расходы/Зарплаты.
4. Navigate to a normal (non-summary) batch's report (`/batch/<normal batch
   id>/report`) and confirm it still renders exactly as before (date range
   shown, no Корм/Лекарства/Уголь rows) — this is the regression check for
   `generate_batch_report`'s existing behavior.

- [ ] **Step 5: Commit**

```bash
git add src/pages/BatchReportPage.jsx
git commit -m "feat: show active-batch cost breakdown on the summary batch report"
```

---

### Task 7: `BatchesPage.jsx` — add a report link for the summary batch

**Files:**
- Modify: `src/pages/BatchesPage.jsx`

**Interfaces:**
- Consumes: `/batch/:batchId/report` route (existing, `src/App.jsx`) — no route changes needed, `BatchReportPage.jsx` (Task 6) already handles the summary batch when reached via this URL.

Currently the summary batch only ever appears in the "active" view (it's
always `is_active: true`), where the actions column only renders "Журнал"
plus a "Завершить" button that's hidden for it — there is no way to reach
its report page from the UI at all.

- [ ] **Step 1: Add a report link for the summary batch in the active view**

Replace lines 368-376:

```jsx
                                        {view === 'active' ? (
                                            batch.is_summary ? (
                                                <Link to={`/batch/${batch.id}/report`} className="px-4 py-2 text-sm text-center font-medium text-white bg-blue-500 rounded-md hover:bg-blue-600">
                                                    Отчет
                                                </Link>
                                            ) : (
                                                <button
                                                    onClick={() => handleToggleBatchStatus(batch.id, false)}
                                                    className="px-4 py-2 text-sm font-medium text-white bg-red-500 rounded-md hover:bg-red-600"
                                                >
                                                    Завершить
                                                </button>
                                            )
                                        ) : (
```

- [ ] **Step 2: Manual verification**

With the dev server running: open `/` (BatchesPage, "Активные" tab), find
the row with the yellow "Автоматическая" badge, confirm it now shows an
"Отчет" button, click it, confirm it navigates to
`/batch/<id>/report` and renders the summary report from Task 6.

- [ ] **Step 3: Commit**

```bash
git add src/pages/BatchesPage.jsx
git commit -m "feat: add report link for the summary batch"
```

---

## After all tasks: deploy to production

Production runs on Vercel + a separate cloud Supabase project (not this
local Docker stack). Once all tasks above are verified locally:

1. Apply the two new migrations (`20260821120000_add_cost_columns.sql`,
   `20260821120100_add_get_active_summary_report.sql`) to the production
   Supabase project — via `npx supabase db push` with production
   credentials, or by pasting the SQL into the Supabase Dashboard's SQL
   editor. Exact method to be confirmed with the project owner at deploy
   time (out of scope for this plan — it needs production credentials this
   workspace doesn't have).
2. Regenerate `schema.sql` from the production database afterward (e.g.
   `npx supabase db dump --schema public -f schema.sql` against production)
   so it stays the accurate reference snapshot CLAUDE.md describes.
3. Merge the frontend changes to `main` — Vercel deploys automatically from
   there per the existing setup.
