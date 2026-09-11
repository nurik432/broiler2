# Telegram Mini App — B2: финансы и ресурсы — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the six `<MobileStub>` routes (`/expenses`, `/sales`, `/salaries`, `/debts`, `/feed`, `/coal`) in the Telegram Mini App with real mobile screens that reach full functional parity with the desktop `ExpensesPage`, `SalesPage`, `SalariesPage` (3 sub-tabs), `DebtsPage`/`DebtTab`, `FeedPage`, `CoalPage`.

**Architecture:** Each domain gets one top-level mobile page under `src/mobile/pages/` (salaries gets three sub-tab components under `src/mobile/pages/salaries/`), built from the existing Foundation/B1 primitives (`Card`, `ListRow`, `BottomSheet`, `ConfirmSheet`, `FormField`, `SegmentedControl`, `Tabs`, `EmptyState`, `Spinner`). Two new shared primitives are added first (`StatGrid`, `NamePicker`) since later tasks depend on them. All data access goes straight through `src/supabaseClient.js`, reusing the exact same RPCs/tables/business logic as the desktop pages (including `src/utils/calculateSalary.js` unchanged). No new npm dependencies.

**Tech Stack:** React + Vite (rolldown-vite), react-router-dom, Supabase JS client, Tailwind v4 utility classes plus the `tg-*` custom classes/CSS vars already established by Foundation.

**Spec:** [docs/superpowers/specs/2026-09-11-telegram-mini-app-b2-finance-design.md](../specs/2026-09-11-telegram-mini-app-b2-finance-design.md)

## Global Constraints

- All user-facing text is in Russian, matching the desktop pages' wording style.
- All Supabase access goes through the singleton `src/supabaseClient.js` — never a new client instance.
- No new npm packages. Reuse `src/utils/calculateSalary.js` unchanged for salary math.
- Currency is always formatted with `new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'TJS' }).format(value || 0)`.
- Every write path that can fail (insert/update/delete) follows the pattern established in `src/mobile/pages/batchLog/MobileJournalTab.jsx`: `const { data: { user } } = await supabase.auth.getUser();` → if `!user`, `window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return;` → perform the write → on Supabase error, `window.alert('Ошибка: ' + error.message)` → on success, reload the page's data. Use `window.alert`, never bare `alert`.
- Reuse the shared mobile primitives from `src/mobile/components/` (`Card`, `ListRow`, `BottomSheet`, `ConfirmSheet`, `FormField`, `SegmentedControl`, `Tabs`, `EmptyState`, `Spinner`) — do not re-implement their behavior locally.
- Touch targets: interactive elements use `style={{ minHeight: 44 }}` (secondary/compact controls) or `48` (primary buttons, text inputs) — matching existing B1 pages.
- Tailwind utility classes for text/background follow the existing `tg-*` set already in use: `bg-tg-section` (Card default), `bg-tg-secondary` (inputs, secondary buttons), `text-tg-text`, `text-tg-hint`, `text-tg-destructive`, `bg-tg-button`/`text-tg-button-text` (primary CTA). One-off accent colors follow the informal palette already documented in `CLAUDE.md` (`#4f46e5` indigo, `#dc3545` red/danger, `#fd7e14` orange, `#007bff` blue, `#28a745` green) — matching how `MobileTasksPage.jsx` colors its priority pills.
- `useTelegramMainButton` (from `src/mobile/telegram/useTelegramMainButton.js`) is a single global native button — mount it only on a page/component with exactly **one** open-at-a-time form `BottomSheet`, matching how `MobileTasksPage.jsx` uses it. Never mount it more than once at a time (two simultaneously-rendered hook instances race on the same native button). Every `BottomSheet` form keeps its own in-sheet submit button regardless — the `MainButton` is an addition, not a replacement, matching `MobileTasksPage.jsx`.
- This subproject never writes to `daily_logs` — the `syncSummaryBatchLog` invariant does not apply to any task here.
- No test suite exists. Verification per task is: `npx eslint src` must report no new errors, `npm run build` must succeed, and a manual check of the new route via the Browser pane with `?tg_debug=1&tg_linked=1` (loading/empty/populated states as data allows — the connected Supabase project may be empty, matching the B1 arc's noted limitation).

## File Structure

```
src/mobile/
  components/
    StatGrid.jsx                        # NEW — metric-card grid for dashboards (Debts/Feed/Coal)
    NamePicker.jsx                      # NEW — generic search+select+create-new combobox (customers, persons)
  pages/
    MobileExpensesPage.jsx              # NEW — /expenses
    MobileSalesPage.jsx                 # NEW — /sales
    MobileDebtsPage.jsx                 # NEW — /debts
    MobileFeedPage.jsx                  # NEW — /feed
    MobileCoalPage.jsx                  # NEW — /coal
    MobileSalariesPage.jsx              # NEW — /salaries (tab wrapper)
    salaries/
      MobileCreateEmployeeTab.jsx       # NEW
      MobileHireFireTab.jsx             # NEW
      MobileSalaryTab.jsx               # NEW
  TelegramApp.jsx                       # MODIFIED — 6 stub routes become real pages (edited incrementally, once per task)
```

Not modified: any desktop page/component, any RPC/table/migration, `src/utils/calculateSalary.js`, any other Foundation/B1 file.

---

### Task 1: Shared components — StatGrid and NamePicker

**Files:**
- Create: `src/mobile/components/StatGrid.jsx`
- Create: `src/mobile/components/NamePicker.jsx`

**Interfaces:**
- Consumes: nothing new — plain React, CSS vars already defined by `src/mobile/telegram/theme.js` (`--tg-bg`, `--tg-text`, `--tg-hint`, `--tg-secondary-bg`, `--tg-section-bg`).
- Produces:
  - `StatGrid({ items })` where `items: [{ label: string, value: string, hint?: string, color?: string }]` — renders a 2-column grid of metric cards. Consumed by Tasks 4, 5, 6.
  - `NamePicker({ items, value, onChange, onSelectExisting, onCreateNew, excludeId, placeholder })` — generic version of the desktop `src/components/PersonAutocomplete.jsx`, operating on any `{ id, full_name }[]` list. Consumed by Tasks 3, 7, 8.

- [ ] **Step 1: Create `StatGrid.jsx`**

```jsx
// src/mobile/components/StatGrid.jsx
// Сетка карточек-метрик для дашбордов (Долги/Корм/Уголь).
export default function StatGrid({ items }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map((it, idx) => (
        <div
          key={idx}
          className="rounded-xl p-3"
          style={{
            background: `color-mix(in srgb, ${it.color || 'var(--tg-hint)'} 12%, transparent)`,
            border: `1px solid color-mix(in srgb, ${it.color || 'var(--tg-hint)'} 30%, transparent)`,
          }}
        >
          <p className="text-xs" style={{ color: it.color || 'var(--tg-hint)' }}>{it.label}</p>
          <p className="text-lg font-bold" style={{ color: it.color || 'var(--tg-text)' }}>{it.value}</p>
          {it.hint && <p className="text-xs text-tg-hint mt-0.5">{it.hint}</p>}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create `NamePicker.jsx`**

```jsx
// src/mobile/components/NamePicker.jsx
// Универсальный combobox поиска+выбора+создания записи по полю full_name.
// Обобщение десктопного src/components/PersonAutocomplete.jsx — используется
// и для persons (сотрудники), и для customers (клиенты продаж).
import { useState, useRef, useEffect } from 'react';

export default function NamePicker({
  items = [],
  value,
  onChange,
  onSelectExisting,
  onCreateNew, // не передавайте, чтобы скрыть опцию "создать новое"
  excludeId,
  placeholder = 'Введите имя...',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setIsOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const query = (value || '').trim().toLowerCase();
  const matches = query
    ? items.filter((p) => p.id !== excludeId && p.full_name.toLowerCase().includes(query)).slice(0, 8)
    : [];
  const exactMatch = items.some((p) => p.id !== excludeId && p.full_name.trim().toLowerCase() === query);

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => { onChange(e.target.value); setIsOpen(true); }}
        onFocus={() => setIsOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full rounded-xl px-3 bg-tg-secondary text-tg-text"
        style={{ minHeight: 48 }}
      />
      {isOpen && query && (
        <div
          className="absolute z-20 mt-1 w-full rounded-xl shadow-lg max-h-64 overflow-y-auto bg-tg-section"
          style={{ border: '1px solid var(--tg-secondary-bg)' }}
        >
          {matches.length > 0 && (
            <div className="py-1">
              {matches.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { onSelectExisting(p); setIsOpen(false); }}
                  className="w-full text-left px-3 py-2 text-sm text-tg-text active:opacity-70"
                >
                  {p.full_name}
                </button>
              ))}
            </div>
          )}
          {onCreateNew && !exactMatch && value.trim() && (
            <button
              type="button"
              onClick={() => { onCreateNew(value.trim()); setIsOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm font-medium active:opacity-70"
              style={{ color: 'var(--tg-link, #4f46e5)', borderTop: '1px solid var(--tg-secondary-bg)' }}
            >
              ➕ Создать «{value.trim()}»
            </button>
          )}
          {matches.length === 0 && (!onCreateNew || exactMatch) && (
            <p className="px-3 py-2 text-sm text-tg-hint">Ничего не найдено</p>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify**

Run: `npx eslint src/mobile/components/StatGrid.jsx src/mobile/components/NamePicker.jsx`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds (these files aren't imported anywhere yet, so this only proves no syntax errors).

- [ ] **Step 4: Commit**

```bash
git add src/mobile/components/StatGrid.jsx src/mobile/components/NamePicker.jsx
git commit -m "feat(mobile): add StatGrid and NamePicker shared components

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Expenses — MobileExpensesPage

**Files:**
- Create: `src/mobile/pages/MobileExpensesPage.jsx`
- Modify: `src/mobile/TelegramApp.jsx` (`/expenses` route)

**Interfaces:**
- Consumes: `supabase` from `../../supabaseClient`; RPC `get_expenses()` returning `{id, expense_date, description, amount, category, batch_id, created_at, expense_scope, batch_name, batch_is_active}`; `Card`, `BottomSheet`, `ConfirmSheet`, `FormField`, `SegmentedControl`, `EmptyState`, `Spinner` from `../components/*`; `useTelegramMainButton` from `../telegram/useTelegramMainButton`.
- Produces: default export `MobileExpensesPage`, mounted at `/expenses` in `TelegramApp.jsx`.

- [ ] **Step 1: Create `MobileExpensesPage.jsx`**

```jsx
// src/mobile/pages/MobileExpensesPage.jsx
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabaseClient';
import Card from '../components/Card';
import BottomSheet from '../components/BottomSheet';
import ConfirmSheet from '../components/ConfirmSheet';
import FormField from '../components/FormField';
import SegmentedControl from '../components/SegmentedControl';
import EmptyState from '../components/EmptyState';
import Spinner from '../components/Spinner';
import { useTelegramMainButton } from '../telegram/useTelegramMainButton';

const fieldClass = 'w-full rounded-xl px-3 bg-tg-secondary text-tg-text';
const formatCurrency = (v) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'TJS' }).format(v || 0);
const EMPTY_FORM = { expense_date: new Date().toISOString().slice(0, 10), description: '', amount: '', category: '', batch_id: '' };

function firstDayOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function lastDayOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
}

export default function MobileExpensesPage() {
  const [allExpenses, setAllExpenses] = useState([]);
  const [activeBatches, setActiveBatches] = useState([]);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState('work');
  const [showArchived, setShowArchived] = useState(false);

  const [reportOpen, setReportOpen] = useState(false);
  const [startDate, setStartDate] = useState(firstDayOfMonth());
  const [endDate, setEndDate] = useState(lastDayOfMonth());

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  async function fetchData() {
    setLoading(true);
    const [expensesRes, batchesRes] = await Promise.all([
      supabase.rpc('get_expenses'),
      supabase.from('broiler_batches').select('id, batch_name').eq('is_active', true).or('is_summary.eq.false,is_summary.is.null'),
    ]);
    if (expensesRes.error) window.alert('Ошибка: ' + expensesRes.error.message);
    else setAllExpenses(expensesRes.data || []);
    if (batchesRes.error) window.alert('Ошибка: ' + batchesRes.error.message);
    else setActiveBatches(batchesRes.data || []);
    setLoading(false);
  }

  useEffect(() => { fetchData(); }, []);

  const filteredExpenses = useMemo(() => {
    return allExpenses.filter((exp) => {
      if (exp.expense_scope !== activeTab) return false;
      if (showArchived) return true;
      return !exp.batch_id || exp.batch_is_active === true;
    });
  }, [allExpenses, activeTab, showArchived]);

  const reportTotal = useMemo(() => {
    if (!startDate || !endDate) return 0;
    return filteredExpenses
      .filter((exp) => exp.expense_date >= startDate && exp.expense_date <= endDate)
      .reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0);
  }, [filteredExpenses, startDate, endDate]);

  function openCreate() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, expense_date: new Date().toISOString().slice(0, 10) });
    setFormOpen(true);
  }
  function openEdit(exp) {
    setEditingId(exp.id);
    setForm({
      expense_date: exp.expense_date,
      description: exp.description || '',
      amount: String(exp.amount ?? ''),
      category: exp.category || '',
      batch_id: exp.batch_id || '',
    });
    setFormOpen(true);
  }

  async function save() {
    if (!form.description.trim()) { window.alert('Укажите описание расхода'); return; }
    if (!(Number(form.amount) > 0)) { window.alert('Сумма должна быть больше нуля'); return; }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
      const payload = {
        expense_date: form.expense_date,
        description: form.description.trim(),
        amount: Number(form.amount),
        category: form.category.trim(),
        batch_id: form.batch_id || null,
      };
      let error;
      if (editingId) {
        ({ error } = await supabase.from('expenses').update(payload).eq('id', editingId));
      } else {
        ({ error } = await supabase.from('expenses').insert([{ ...payload, expense_scope: activeTab, user_id: user.id }]));
      }
      if (error) window.alert('Ошибка: ' + error.message);
      else { setFormOpen(false); await fetchData(); }
    } catch (e) {
      window.alert('Ошибка: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  useTelegramMainButton({
    text: saving ? 'Сохраняем…' : editingId ? 'Сохранить' : 'Добавить расход',
    onClick: save,
    visible: formOpen,
    loading: saving,
  });

  async function confirmDelete() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
    const { error } = await supabase.from('expenses').delete().eq('id', confirmDeleteId);
    if (error) window.alert('Ошибка: ' + error.message);
    setConfirmDeleteId(null);
    await fetchData();
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  return (
    <div className="flex flex-col gap-3 py-3">
      <SegmentedControl
        options={[{ value: 'work', label: 'Рабочие' }, { value: 'personal', label: 'Домашние' }]}
        value={activeTab}
        onChange={setActiveTab}
      />

      <button
        type="button" onClick={openCreate}
        className="w-full rounded-xl px-4 py-3 text-base font-semibold bg-tg-button text-tg-button-text"
        style={{ minHeight: 48 }}
      >
        + Добавить расход
      </button>

      <label className="flex items-center gap-2 text-sm text-tg-hint select-none">
        <input type="checkbox" checked={showArchived} onChange={() => setShowArchived((v) => !v)} />
        Показать расходы архивных партий
      </label>

      <Card onClick={() => setReportOpen((v) => !v)}>
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">📊 Отчёт за период</p>
          <span className="text-tg-hint">{reportOpen ? '▲' : '▼'}</span>
        </div>
        {reportOpen && (
          <div className="mt-3 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex gap-2">
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={fieldClass} style={{ minHeight: 44 }} />
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={fieldClass} style={{ minHeight: 44 }} />
            </div>
            <p className="text-sm">Итого: <strong className="text-base">{formatCurrency(reportTotal)}</strong></p>
          </div>
        )}
      </Card>

      {filteredExpenses.length === 0 ? (
        <EmptyState icon="💸" title="Расходов пока нет" hint="Нажмите «+ Добавить расход»" />
      ) : (
        filteredExpenses.map((exp) => (
          <Card key={exp.id}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-base font-medium truncate">{exp.description}</p>
                <p className="text-xs text-tg-hint">
                  {new Date(exp.expense_date).toLocaleDateString('ru-RU')}
                  {exp.category ? ` · ${exp.category}` : ''}
                </p>
                {exp.batch_name && (
                  <span
                    className="inline-block mt-1 text-xs rounded-full px-2 py-0.5"
                    style={{
                      background: exp.batch_is_active ? 'color-mix(in srgb, var(--tg-link, #4f46e5) 15%, transparent)' : 'var(--tg-secondary-bg)',
                      color: exp.batch_is_active ? 'var(--tg-link, #4f46e5)' : 'var(--tg-hint)',
                    }}
                  >
                    {exp.batch_name}
                  </span>
                )}
              </div>
              <p className="text-base font-semibold shrink-0">{formatCurrency(exp.amount)}</p>
            </div>
            <div className="flex gap-2 mt-2">
              <button type="button" onClick={() => openEdit(exp)} className="flex-1 rounded-lg px-3 py-2 text-xs bg-tg-secondary" style={{ minHeight: 36 }}>✏️ Изменить</button>
              <button type="button" onClick={() => setConfirmDeleteId(exp.id)} className="flex-1 rounded-lg px-3 py-2 text-xs text-tg-destructive bg-tg-secondary" style={{ minHeight: 36 }}>🗑 Удалить</button>
            </div>
          </Card>
        ))
      )}

      <BottomSheet open={formOpen} onClose={() => setFormOpen(false)} title={editingId ? 'Редактировать расход' : 'Новый расход'}>
        <div className="flex flex-col gap-3">
          <FormField label="Дата">
            <input type="date" value={form.expense_date} onChange={(e) => setForm((f) => ({ ...f, expense_date: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }} />
          </FormField>
          <FormField label="Описание *">
            <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Например: ремонт вентилятора" className={fieldClass} style={{ minHeight: 48 }} />
          </FormField>
          <FormField label="Сумма *">
            <input type="number" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="0.00" className={fieldClass} style={{ minHeight: 48 }} />
          </FormField>
          <FormField label="Категория">
            <input value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} placeholder="Например: ремонт, корм" className={fieldClass} style={{ minHeight: 44 }} />
          </FormField>
          <FormField label="Партия (опционально)">
            <select value={form.batch_id} onChange={(e) => setForm((f) => ({ ...f, batch_id: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }}>
              <option value="">— Не привязывать —</option>
              {activeBatches.map((b) => <option key={b.id} value={b.id}>{b.batch_name}</option>)}
            </select>
          </FormField>
          <button
            type="button" onClick={save} disabled={saving}
            className="rounded-xl px-4 py-3 text-base font-semibold bg-tg-button text-tg-button-text disabled:opacity-60"
            style={{ minHeight: 48 }}
          >
            {saving ? 'Сохраняем…' : editingId ? 'Сохранить' : 'Добавить расход'}
          </button>
        </div>
      </BottomSheet>

      <ConfirmSheet
        open={!!confirmDeleteId}
        title="Удалить расход?"
        onConfirm={confirmDelete}
        onClose={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Wire the `/expenses` route**

In `src/mobile/TelegramApp.jsx`, add the import near the other `Mobile*Page` imports:

```js
import MobileExpensesPage from './pages/MobileExpensesPage';
```

Replace:

```js
        <Route path="/expenses" element={<MobileStub title="Расходы" />} />
```

with:

```js
        <Route path="/expenses" element={<MobileExpensesPage />} />
```

- [ ] **Step 3: Verify**

Run: `npx eslint src`
Expected: no new errors.

Run: `npm run build`
Expected: build succeeds.

In the Browser pane, open the app at `?tg_debug=1&tg_linked=1`, navigate to `/expenses`:
- Confirm the segmented control (Рабочие/Домашние), the "+ Добавить расход" button, the collapsible report card, and either the empty state or a list of expense cards render without console errors (`read_console_messages`).
- Tap "+ Добавить расход", fill description+amount, submit; confirm the new card appears and the sheet closes.
- Tap "✏️ Изменить" on a card, change the amount, save; confirm the card updates.
- Tap "🗑 Удалить", confirm via the sheet; confirm the card disappears.

- [ ] **Step 4: Commit**

```bash
git add src/mobile/pages/MobileExpensesPage.jsx src/mobile/TelegramApp.jsx
git commit -m "feat(mobile): add expenses screen at /expenses

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Sales — MobileSalesPage

**Files:**
- Create: `src/mobile/pages/MobileSalesPage.jsx`
- Modify: `src/mobile/TelegramApp.jsx` (`/sales` route)

**Interfaces:**
- Consumes: `NamePicker` from Task 1 (`items`, `value`, `onChange`, `onSelectExisting`, `onCreateNew`, `placeholder`); RPC `get_sales_with_stats()` returning `{id, sale_date, customer_id, customer_name, weight_kg, price_per_kg, created_at, batch_id, batch_name, batch_is_active, total_amount, total_paid, balance}`; tables `sales`, `payments`, `customers`.
- Produces: default export `MobileSalesPage`, mounted at `/sales`.
- Note: this page has two independent save-capable `BottomSheet`s (add/edit sale, and new payment) open at different times — per Global Constraints, `useTelegramMainButton` is **not** used here; both sheets rely on their own in-sheet submit button only.

- [ ] **Step 1: Create `MobileSalesPage.jsx`**

```jsx
// src/mobile/pages/MobileSalesPage.jsx
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabaseClient';
import Card from '../components/Card';
import BottomSheet from '../components/BottomSheet';
import ConfirmSheet from '../components/ConfirmSheet';
import FormField from '../components/FormField';
import NamePicker from '../components/NamePicker';
import EmptyState from '../components/EmptyState';
import Spinner from '../components/Spinner';

const fieldClass = 'w-full rounded-xl px-3 bg-tg-secondary text-tg-text';
const formatCurrency = (v) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'TJS' }).format(v || 0);

function firstDayOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function lastDayOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
}

const EMPTY_FORM = { sale_date: new Date().toISOString().slice(0, 10), customerId: '', customerText: '', weight_kg: '', price_per_kg: '', batch_id: '' };

export default function MobileSalesPage() {
  const [allSales, setAllSales] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [activeBatches, setActiveBatches] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showArchived, setShowArchived] = useState(false);

  const [reportOpen, setReportOpen] = useState(false);
  const [startDate, setStartDate] = useState(firstDayOfMonth());
  const [endDate, setEndDate] = useState(lastDayOfMonth());

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const [paymentsSale, setPaymentsSale] = useState(null);
  const [modalPayments, setModalPayments] = useState([]);

  const [newPaymentOpen, setNewPaymentOpen] = useState(false);
  const [newPaymentCustomerId, setNewPaymentCustomerId] = useState('');
  const [newPaymentCustomerText, setNewPaymentCustomerText] = useState('');
  const [newPaymentAmount, setNewPaymentAmount] = useState('');
  const [newPaymentDate, setNewPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [processingPayment, setProcessingPayment] = useState(false);

  async function fetchData() {
    setLoading(true);
    const [salesRes, batchesRes, customersRes] = await Promise.all([
      supabase.rpc('get_sales_with_stats'),
      supabase.from('broiler_batches').select('id, batch_name').eq('is_active', true).or('is_summary.eq.false,is_summary.is.null'),
      supabase.from('customers').select('id, full_name').order('full_name'),
    ]);
    if (salesRes.error) window.alert('Ошибка: ' + salesRes.error.message);
    else setAllSales(salesRes.data || []);
    if (batchesRes.error) window.alert('Ошибка: ' + batchesRes.error.message);
    else setActiveBatches(batchesRes.data || []);
    if (customersRes.error) window.alert('Ошибка: ' + customersRes.error.message);
    else setCustomers(customersRes.data || []);
    setLoading(false);
  }

  useEffect(() => { fetchData(); }, []);

  const filteredSales = useMemo(() => {
    return allSales.filter((s) => {
      if (showArchived) return true;
      return !s.batch_id || s.batch_is_active === true;
    });
  }, [allSales, showArchived]);

  const reportTotals = useMemo(() => {
    if (!startDate || !endDate) return { totalSales: 0, totalPayments: 0, totalBalance: 0 };
    return filteredSales
      .filter((s) => s.sale_date >= startDate && s.sale_date <= endDate)
      .reduce((acc, s) => {
        acc.totalSales += Number(s.total_amount) || 0;
        acc.totalPayments += Number(s.total_paid) || 0;
        acc.totalBalance += Number(s.balance) || 0;
        return acc;
      }, { totalSales: 0, totalPayments: 0, totalBalance: 0 });
  }, [filteredSales, startDate, endDate]);

  async function handleCreateCustomer(name, target) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
    const { data, error } = await supabase.from('customers').insert([{ full_name: name, user_id: user.id }]).select().single();
    if (error) { window.alert('Ошибка: ' + error.message); return; }
    setCustomers((prev) => [...prev, data].sort((a, b) => a.full_name.localeCompare(b.full_name)));
    if (target === 'form') setForm((f) => ({ ...f, customerId: data.id, customerText: data.full_name }));
    else { setNewPaymentCustomerId(data.id); setNewPaymentCustomerText(data.full_name); }
  }

  function openCreate() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, sale_date: new Date().toISOString().slice(0, 10) });
    setFormOpen(true);
  }
  function openEdit(sale) {
    setEditingId(sale.id);
    setForm({
      sale_date: sale.sale_date,
      customerId: sale.customer_id || '',
      customerText: sale.customer_name || '',
      weight_kg: String(sale.weight_kg ?? ''),
      price_per_kg: String(sale.price_per_kg ?? ''),
      batch_id: sale.batch_id || '',
    });
    setFormOpen(true);
  }

  async function save() {
    if (!(Number(form.weight_kg) > 0)) { window.alert('Укажите вес больше нуля'); return; }
    if (!(Number(form.price_per_kg) > 0)) { window.alert('Укажите цену больше нуля'); return; }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
      const payload = {
        sale_date: form.sale_date,
        customer_id: form.customerId || null,
        weight_kg: Number(form.weight_kg),
        price_per_kg: Number(form.price_per_kg),
        batch_id: form.batch_id || null,
      };
      let error;
      if (editingId) {
        ({ error } = await supabase.from('sales').update(payload).eq('id', editingId));
      } else {
        ({ error } = await supabase.from('sales').insert([{ ...payload, user_id: user.id }]));
      }
      if (error) window.alert('Ошибка: ' + error.message);
      else { setFormOpen(false); await fetchData(); }
    } catch (e) {
      window.alert('Ошибка: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
    const { error } = await supabase.from('sales').delete().eq('id', confirmDeleteId);
    if (error) window.alert('Ошибка: ' + error.message);
    setConfirmDeleteId(null);
    await fetchData();
  }

  async function openPayments(sale) {
    setPaymentsSale(sale);
    const { data, error } = await supabase.from('payments').select('*').eq('sale_id', sale.id).order('payment_date', { ascending: false });
    if (error) { window.alert('Ошибка: ' + error.message); setModalPayments([]); }
    else setModalPayments(data || []);
  }

  async function deletePayment(paymentId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
    const { error } = await supabase.from('payments').delete().eq('id', paymentId);
    if (error) { window.alert('Ошибка: ' + error.message); return; }
    await fetchData();
    const { data } = await supabase.from('payments').select('*').eq('sale_id', paymentsSale.id).order('payment_date', { ascending: false });
    setModalPayments(data || []);
    const { data: freshSales } = await supabase.rpc('get_sales_with_stats');
    setPaymentsSale(freshSales?.find((s) => s.id === paymentsSale.id) || null);
  }

  async function submitNewPayment() {
    if (!newPaymentCustomerId) { window.alert('Выберите клиента.'); return; }
    const amount = Number(newPaymentAmount);
    if (!(amount > 0)) { window.alert('Сумма должна быть больше нуля.'); return; }
    setProcessingPayment(true);
    try {
      const { data: freshSales, error: fetchError } = await supabase.rpc('get_sales_with_stats');
      if (fetchError) { window.alert('Ошибка: ' + fetchError.message); return; }
      const unpaidSales = (freshSales || [])
        .filter((s) => s.customer_id === newPaymentCustomerId && s.balance > 0)
        .sort((a, b) => new Date(a.sale_date) - new Date(b.sale_date));
      const totalOwed = unpaidSales.reduce((sum, s) => sum + (Number(s.balance) || 0), 0);
      if (amount > totalOwed) {
        window.alert(`У клиента остаток всего ${totalOwed.toFixed(2)} TJS, введено ${amount.toFixed(2)} TJS.`);
        return;
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
      let remaining = amount;
      const rowsToInsert = [];
      for (const sale of unpaidSales) {
        if (remaining <= 0) break;
        const chunk = Math.min(remaining, sale.balance);
        rowsToInsert.push({ sale_id: sale.id, payment_date: newPaymentDate, amount: chunk, user_id: user.id });
        remaining -= chunk;
      }
      const { error: insertError } = await supabase.from('payments').insert(rowsToInsert);
      if (insertError) { window.alert('Ошибка: ' + insertError.message); return; }
      setNewPaymentCustomerId(''); setNewPaymentCustomerText(''); setNewPaymentAmount('');
      setNewPaymentOpen(false);
      await fetchData();
    } finally {
      setProcessingPayment(false);
    }
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  return (
    <div className="flex flex-col gap-3 py-3">
      <div className="flex gap-2">
        <button
          type="button" onClick={openCreate}
          className="flex-1 rounded-xl px-4 py-3 text-sm font-semibold bg-tg-button text-tg-button-text"
          style={{ minHeight: 44 }}
        >
          + Продажа
        </button>
        <button
          type="button" onClick={() => setNewPaymentOpen(true)}
          className="flex-1 rounded-xl px-4 py-3 text-sm font-semibold text-white"
          style={{ minHeight: 44, background: '#28a745' }}
        >
          + Поступление
        </button>
      </div>

      <label className="flex items-center gap-2 text-sm text-tg-hint select-none">
        <input type="checkbox" checked={showArchived} onChange={() => setShowArchived((v) => !v)} />
        Показать продажи архивных партий
      </label>

      <Card onClick={() => setReportOpen((v) => !v)}>
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">📊 Отчёт за период</p>
          <span className="text-tg-hint">{reportOpen ? '▲' : '▼'}</span>
        </div>
        {reportOpen && (
          <div className="mt-3 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex gap-2">
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={fieldClass} style={{ minHeight: 44 }} />
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={fieldClass} style={{ minHeight: 44 }} />
            </div>
            <p className="text-sm">Продажи: <strong>{formatCurrency(reportTotals.totalSales)}</strong></p>
            <p className="text-sm">Оплачено: <strong style={{ color: '#28a745' }}>{formatCurrency(reportTotals.totalPayments)}</strong></p>
            <p className="text-sm">Остаток: <strong style={{ color: 'var(--tg-destructive)' }}>{formatCurrency(reportTotals.totalBalance)}</strong></p>
          </div>
        )}
      </Card>

      {filteredSales.length === 0 ? (
        <EmptyState icon="💰" title="Продаж пока нет" hint="Нажмите «+ Продажа»" />
      ) : (
        filteredSales.map((sale) => (
          <Card key={sale.id} onClick={() => openPayments(sale)}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-base font-medium truncate">{sale.customer_name || 'Без клиента'}</p>
                <p className="text-xs text-tg-hint">
                  {new Date(sale.sale_date).toLocaleDateString('ru-RU')} · {sale.weight_kg} кг @ {sale.price_per_kg}
                </p>
                {sale.batch_name && (
                  <span
                    className="inline-block mt-1 text-xs rounded-full px-2 py-0.5"
                    style={{
                      background: sale.batch_is_active ? 'color-mix(in srgb, var(--tg-link, #4f46e5) 15%, transparent)' : 'var(--tg-secondary-bg)',
                      color: sale.batch_is_active ? 'var(--tg-link, #4f46e5)' : 'var(--tg-hint)',
                    }}
                  >
                    {sale.batch_name}
                  </span>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="text-base font-semibold">{formatCurrency(sale.total_amount)}</p>
                {sale.balance <= 0 ? (
                  <span className="text-xs font-medium" style={{ color: '#28a745' }}>Выплачено</span>
                ) : (
                  <span className="text-xs font-medium" style={{ color: 'var(--tg-destructive)' }}>Остаток: {formatCurrency(sale.balance)}</span>
                )}
              </div>
            </div>
            <div className="flex gap-2 mt-2" onClick={(e) => e.stopPropagation()}>
              <button type="button" onClick={() => openEdit(sale)} className="flex-1 rounded-lg px-3 py-2 text-xs bg-tg-secondary" style={{ minHeight: 36 }}>✏️ Изменить</button>
              <button type="button" onClick={() => setConfirmDeleteId(sale.id)} className="flex-1 rounded-lg px-3 py-2 text-xs text-tg-destructive bg-tg-secondary" style={{ minHeight: 36 }}>🗑 Удалить</button>
            </div>
          </Card>
        ))
      )}

      <BottomSheet open={formOpen} onClose={() => setFormOpen(false)} title={editingId ? 'Редактировать продажу' : 'Новая продажа'}>
        <div className="flex flex-col gap-3">
          <FormField label="Дата">
            <input type="date" value={form.sale_date} onChange={(e) => setForm((f) => ({ ...f, sale_date: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }} />
          </FormField>
          <FormField label="Клиент (опционально)">
            <NamePicker
              items={customers}
              value={form.customerText}
              onChange={(text) => setForm((f) => ({ ...f, customerText: text, customerId: '' }))}
              onSelectExisting={(c) => setForm((f) => ({ ...f, customerId: c.id, customerText: c.full_name }))}
              onCreateNew={(name) => handleCreateCustomer(name, 'form')}
              placeholder="Введите имя клиента..."
            />
          </FormField>
          <FormField label="Вес (кг) *">
            <input type="number" step="0.01" value={form.weight_kg} onChange={(e) => setForm((f) => ({ ...f, weight_kg: e.target.value }))} className={fieldClass} style={{ minHeight: 48 }} />
          </FormField>
          <FormField label="Цена за кг *">
            <input type="number" step="0.01" value={form.price_per_kg} onChange={(e) => setForm((f) => ({ ...f, price_per_kg: e.target.value }))} className={fieldClass} style={{ minHeight: 48 }} />
          </FormField>
          <FormField label="Партия (опционально)">
            <select value={form.batch_id} onChange={(e) => setForm((f) => ({ ...f, batch_id: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }}>
              <option value="">— Не привязывать —</option>
              {activeBatches.map((b) => <option key={b.id} value={b.id}>{b.batch_name}</option>)}
            </select>
          </FormField>
          <button
            type="button" onClick={save} disabled={saving}
            className="rounded-xl px-4 py-3 text-base font-semibold bg-tg-button text-tg-button-text disabled:opacity-60"
            style={{ minHeight: 48 }}
          >
            {saving ? 'Сохраняем…' : editingId ? 'Сохранить' : 'Добавить продажу'}
          </button>
        </div>
      </BottomSheet>

      <BottomSheet open={!!paymentsSale} onClose={() => setPaymentsSale(null)} title="История платежей по продаже">
        {paymentsSale && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-tg-hint">
              от {new Date(paymentsSale.sale_date).toLocaleDateString('ru-RU')} (Клиент: {paymentsSale.customer_name || 'Не указан'})
            </p>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div><p className="text-xs text-tg-hint">К оплате</p><p className="font-bold">{formatCurrency(paymentsSale.total_amount)}</p></div>
              <div><p className="text-xs text-tg-hint">Оплачено</p><p className="font-bold" style={{ color: '#28a745' }}>{formatCurrency(paymentsSale.total_paid)}</p></div>
              <div><p className="text-xs text-tg-hint">Остаток</p><p className="font-bold" style={{ color: 'var(--tg-destructive)' }}>{formatCurrency(paymentsSale.balance)}</p></div>
            </div>
            <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
              {modalPayments.length === 0 ? (
                <p className="text-sm text-tg-hint text-center py-4">Платежей пока нет.</p>
              ) : modalPayments.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg bg-tg-secondary px-3 py-2">
                  <span className="text-sm">{new Date(p.payment_date).toLocaleDateString('ru-RU')} · {formatCurrency(p.amount)}</span>
                  <button type="button" onClick={() => deletePayment(p.id)} className="text-xs text-tg-destructive px-2 py-2 -my-2">Удалить</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </BottomSheet>

      <BottomSheet open={newPaymentOpen} onClose={() => setNewPaymentOpen(false)} title="Новое поступление">
        <div className="flex flex-col gap-3">
          <FormField label="Клиент *">
            <NamePicker
              items={customers}
              value={newPaymentCustomerText}
              onChange={(text) => { setNewPaymentCustomerText(text); setNewPaymentCustomerId(''); }}
              onSelectExisting={(c) => { setNewPaymentCustomerId(c.id); setNewPaymentCustomerText(c.full_name); }}
              onCreateNew={(name) => handleCreateCustomer(name, 'payment')}
              placeholder="Введите имя клиента..."
            />
          </FormField>
          <FormField label="Дата">
            <input type="date" value={newPaymentDate} onChange={(e) => setNewPaymentDate(e.target.value)} className={fieldClass} style={{ minHeight: 44 }} />
          </FormField>
          <FormField label="Сумма *">
            <input type="number" step="0.01" value={newPaymentAmount} onChange={(e) => setNewPaymentAmount(e.target.value)} className={fieldClass} style={{ minHeight: 48 }} />
          </FormField>
          <button
            type="button" onClick={submitNewPayment} disabled={processingPayment}
            className="rounded-xl px-4 py-3 text-base font-semibold text-white disabled:opacity-60"
            style={{ minHeight: 48, background: '#28a745' }}
          >
            {processingPayment ? 'Обработка…' : 'Провести'}
          </button>
        </div>
      </BottomSheet>

      <ConfirmSheet
        open={!!confirmDeleteId}
        title="Удалить продажу?"
        message="Будут удалены и все связанные платежи."
        onConfirm={confirmDelete}
        onClose={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Wire the `/sales` route**

In `src/mobile/TelegramApp.jsx`, add:

```js
import MobileSalesPage from './pages/MobileSalesPage';
```

Replace:

```js
        <Route path="/sales" element={<MobileStub title="Продажи" />} />
```

with:

```js
        <Route path="/sales" element={<MobileSalesPage />} />
```

- [ ] **Step 3: Verify**

Run: `npx eslint src`
Expected: no new errors.

Run: `npm run build`
Expected: build succeeds.

In the Browser pane at `?tg_debug=1&tg_linked=1`, navigate to `/sales`:
- Confirm the page renders (empty state or sale cards) with no console errors.
- Tap "+ Продажа", type a new customer name in the "Клиент" field, tap "➕ Создать «...»", fill weight+price, submit; confirm the card appears with the new customer's name.
- Tap the sale card (not its buttons); confirm the payments `BottomSheet` opens showing totals and an empty payments list.
- Tap "+ Поступление", select the customer just created, enter an amount ≤ the sale's balance, submit; confirm it succeeds and the sale's balance/status updates on the list.
- Re-open the sale's payments sheet; confirm the new payment is listed and deletable.

- [ ] **Step 4: Commit**

```bash
git add src/mobile/pages/MobileSalesPage.jsx src/mobile/TelegramApp.jsx
git commit -m "feat(mobile): add sales screen at /sales

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Workshop debts — MobileDebtsPage

**Files:**
- Create: `src/mobile/pages/MobileDebtsPage.jsx`
- Modify: `src/mobile/TelegramApp.jsx` (`/debts` route)

**Interfaces:**
- Consumes: `StatGrid` from Task 1; table `debts` (`id, amount, description, debt_date, is_settled, user_id, creditor_name`) joined with `debt_payments(*)`.
- Produces: default export `MobileDebtsPage`, mounted at `/debts`.

- [ ] **Step 1: Create `MobileDebtsPage.jsx`**

```jsx
// src/mobile/pages/MobileDebtsPage.jsx
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabaseClient';
import Card from '../components/Card';
import BottomSheet from '../components/BottomSheet';
import ConfirmSheet from '../components/ConfirmSheet';
import FormField from '../components/FormField';
import StatGrid from '../components/StatGrid';
import EmptyState from '../components/EmptyState';
import Spinner from '../components/Spinner';
import { useTelegramMainButton } from '../telegram/useTelegramMainButton';

const fieldClass = 'w-full rounded-xl px-3 bg-tg-secondary text-tg-text';
const formatCurrency = (v) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'TJS' }).format(v || 0);
const EMPTY_DEBT_FORM = { creditor_name: '', amount: '', description: '', debt_date: new Date().toISOString().slice(0, 10) };

export default function MobileDebtsPage() {
  const [debts, setDebts] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showSettled, setShowSettled] = useState(false);
  const [filterCreditor, setFilterCreditor] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const [formOpen, setFormOpen] = useState(false);
  const [debtForm, setDebtForm] = useState(EMPTY_DEBT_FORM);
  const [savingDebt, setSavingDebt] = useState(false);

  const [payingDebtId, setPayingDebtId] = useState(null);
  const [payAmount, setPayAmount] = useState('');
  const [payDescription, setPayDescription] = useState('');
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [savingPayment, setSavingPayment] = useState(false);

  const [confirmDeleteDebtId, setConfirmDeleteDebtId] = useState(null);
  const [confirmDeletePaymentId, setConfirmDeletePaymentId] = useState(null);

  async function fetchDebts() {
    setLoading(true);
    const { data, error } = await supabase.from('debts').select('*, debt_payments(*)').order('debt_date', { ascending: false });
    if (error) { window.alert('Ошибка: ' + error.message); setDebts([]); }
    else setDebts(data || []);
    setLoading(false);
  }

  useEffect(() => { fetchDebts(); }, []);

  const uniqueCreditors = useMemo(() => {
    const set = new Set();
    debts.forEach((d) => { if (d.creditor_name) set.add(d.creditor_name); });
    return Array.from(set).sort();
  }, [debts]);

  const filteredDebts = useMemo(() => {
    return debts.filter((d) => {
      if (!showSettled && d.is_settled) return false;
      if (filterCreditor && d.creditor_name !== filterCreditor) return false;
      return true;
    });
  }, [debts, showSettled, filterCreditor]);

  const getDebtPaid = (debt) => (debt.debt_payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const getDebtRemaining = (debt) => Math.max((Number(debt.amount) || 0) - getDebtPaid(debt), 0);

  const dashboard = useMemo(() => {
    const totalDebt = debts.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
    const totalPaid = debts.reduce((sum, d) => sum + getDebtPaid(d), 0);
    const activeDebts = debts.filter((d) => !d.is_settled).length;
    const settledDebts = debts.filter((d) => d.is_settled).length;
    const byCreditor = {};
    debts.forEach((d) => {
      const name = d.creditor_name || 'Без имени';
      if (!byCreditor[name]) byCreditor[name] = { totalDebt: 0, totalPaid: 0 };
      byCreditor[name].totalDebt += Number(d.amount) || 0;
      byCreditor[name].totalPaid += getDebtPaid(d);
    });
    return {
      totalDebt, totalPaid, remaining: totalDebt - totalPaid, activeDebts, settledDebts,
      byCreditor: Object.entries(byCreditor)
        .map(([name, v]) => ({ name, ...v, remaining: v.totalDebt - v.totalPaid }))
        .sort((a, b) => b.remaining - a.remaining),
    };
  }, [debts]);

  function openCreate() {
    setDebtForm({ ...EMPTY_DEBT_FORM, debt_date: new Date().toISOString().slice(0, 10) });
    setFormOpen(true);
  }

  async function saveDebt() {
    if (!debtForm.creditor_name.trim()) { window.alert('Укажите, кому должны'); return; }
    if (!(Number(debtForm.amount) > 0)) { window.alert('Сумма должна быть больше нуля'); return; }
    setSavingDebt(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
      const { error } = await supabase.from('debts').insert({
        creditor_name: debtForm.creditor_name.trim(),
        amount: Number(debtForm.amount),
        description: debtForm.description || null,
        debt_date: debtForm.debt_date,
        user_id: user.id,
      });
      if (error) window.alert('Ошибка: ' + error.message);
      else { setFormOpen(false); await fetchDebts(); }
    } finally {
      setSavingDebt(false);
    }
  }

  useTelegramMainButton({
    text: savingDebt ? 'Сохраняем…' : 'Записать долг',
    onClick: saveDebt,
    visible: formOpen,
    loading: savingDebt,
  });

  function startPay(debt) {
    setPayingDebtId(debt.id); setPayAmount(''); setPayDescription('');
    setPayDate(new Date().toISOString().slice(0, 10));
  }

  async function savePayment(debtId) {
    if (!(Number(payAmount) > 0)) { window.alert('Сумма должна быть больше нуля'); return; }
    setSavingPayment(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
      const { error } = await supabase.from('debt_payments').insert({
        debt_id: debtId, amount: Number(payAmount), payment_date: payDate,
        description: payDescription || null, user_id: user.id,
      });
      if (error) { window.alert('Ошибка: ' + error.message); return; }
      const debt = debts.find((d) => d.id === debtId);
      if (debt) {
        const totalPaidNow = getDebtPaid(debt) + Number(payAmount);
        if (totalPaidNow >= Number(debt.amount)) {
          await supabase.from('debts').update({ is_settled: true }).eq('id', debtId);
        }
      }
      setPayingDebtId(null);
      await fetchDebts();
    } finally {
      setSavingPayment(false);
    }
  }

  async function toggleSettled(debt) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
    const { error } = await supabase.from('debts').update({ is_settled: !debt.is_settled }).eq('id', debt.id);
    if (error) window.alert('Ошибка: ' + error.message);
    await fetchDebts();
  }

  async function confirmDeleteDebt() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
    const { error } = await supabase.from('debts').delete().eq('id', confirmDeleteDebtId);
    if (error) window.alert('Ошибка: ' + error.message);
    setConfirmDeleteDebtId(null);
    await fetchDebts();
  }

  async function confirmDeletePayment() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
    const { error } = await supabase.from('debt_payments').delete().eq('id', confirmDeletePaymentId);
    if (error) window.alert('Ошибка: ' + error.message);
    setConfirmDeletePaymentId(null);
    await fetchDebts();
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  return (
    <div className="flex flex-col gap-3 py-3">
      <StatGrid items={[
        { label: 'Всего долгов', value: formatCurrency(dashboard.totalDebt), color: '#fd7e14' },
        { label: 'Оплачено', value: formatCurrency(dashboard.totalPaid), color: '#28a745' },
        { label: 'Остаток', value: formatCurrency(dashboard.remaining), color: dashboard.remaining > 0 ? '#dc3545' : 'var(--tg-hint)' },
        { label: 'Активных / Закрытых', value: `${dashboard.activeDebts} / ${dashboard.settledDebts}`, color: 'var(--tg-link, #4f46e5)' },
      ]} />

      {dashboard.byCreditor.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-tg-hint">По кредиторам</p>
          {dashboard.byCreditor.map((c) => (
            <Card key={c.name}>
              <div className="flex justify-between items-center">
                <p className="font-semibold">{c.name}</p>
                <p className="text-sm font-bold" style={{ color: c.remaining > 0 ? 'var(--tg-destructive)' : '#28a745' }}>{formatCurrency(c.remaining)}</p>
              </div>
            </Card>
          ))}
        </div>
      )}

      <button
        type="button" onClick={openCreate}
        className="w-full rounded-xl px-4 py-3 text-base font-semibold bg-tg-button text-tg-button-text"
        style={{ minHeight: 48 }}
      >
        + Записать долг
      </button>

      <div className="flex flex-wrap gap-2 items-center">
        {uniqueCreditors.length > 0 && (
          <select value={filterCreditor} onChange={(e) => setFilterCreditor(e.target.value)} className={fieldClass} style={{ minHeight: 40, flex: 1 }}>
            <option value="">Все кредиторы</option>
            {uniqueCreditors.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <label className="flex items-center gap-2 text-sm text-tg-hint select-none">
          <input type="checkbox" checked={showSettled} onChange={() => setShowSettled((v) => !v)} />
          Закрытые
        </label>
      </div>

      {filteredDebts.length === 0 ? (
        <EmptyState icon="📋" title="Долгов нет" hint={!showSettled ? 'Попробуйте включить закрытые' : undefined} />
      ) : (
        filteredDebts.map((debt) => {
          const paid = getDebtPaid(debt);
          const remaining = getDebtRemaining(debt);
          const progress = Number(debt.amount) > 0 ? Math.min((paid / Number(debt.amount)) * 100, 100) : 0;
          const isExpanded = expandedId === debt.id;
          return (
            <Card key={debt.id} onClick={() => setExpandedId(isExpanded ? null : debt.id)}>
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold truncate">{debt.creditor_name || '—'}</p>
                    <span
                      className="text-xs rounded-full px-2 py-0.5"
                      style={{
                        background: debt.is_settled ? 'color-mix(in srgb, #28a745 15%, transparent)' : 'color-mix(in srgb, #dc3545 15%, transparent)',
                        color: debt.is_settled ? '#28a745' : '#dc3545',
                      }}
                    >
                      {debt.is_settled ? 'Закрыт' : 'Активный'}
                    </span>
                  </div>
                  <p className="text-xs text-tg-hint">
                    {new Date(debt.debt_date).toLocaleDateString('ru-RU')}{debt.description ? ` · ${debt.description}` : ''}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-tg-hint">Остаток</p>
                  <p className="text-base font-bold" style={{ color: remaining > 0 ? 'var(--tg-destructive)' : 'var(--tg-text)' }}>{formatCurrency(remaining)}</p>
                </div>
              </div>
              <div className="mt-2 h-2 rounded-full bg-tg-secondary overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${progress}%`, background: progress >= 100 ? '#28a745' : progress > 50 ? '#fd7e14' : '#dc3545' }} />
              </div>

              {isExpanded && (
                <div className="mt-3 pt-3 flex flex-col gap-3" style={{ borderTop: '1px solid var(--tg-secondary-bg)' }} onClick={(e) => e.stopPropagation()}>
                  <div>
                    <p className="text-xs font-semibold text-tg-hint mb-1">История оплат</p>
                    {(debt.debt_payments || []).length === 0 ? (
                      <p className="text-sm text-tg-hint">Оплат ещё не было</p>
                    ) : (
                      [...debt.debt_payments].sort((a, b) => new Date(b.payment_date) - new Date(a.payment_date)).map((p) => (
                        <div key={p.id} className="flex items-center justify-between py-1">
                          <span className="text-sm">{new Date(p.payment_date).toLocaleDateString('ru-RU')} · {formatCurrency(p.amount)}</span>
                          <button type="button" onClick={() => setConfirmDeletePaymentId(p.id)} className="text-xs text-tg-destructive px-2 py-2 -my-2">Удалить</button>
                        </div>
                      ))
                    )}
                  </div>

                  {!debt.is_settled && (
                    payingDebtId === debt.id ? (
                      <div className="flex flex-col gap-2 rounded-xl bg-tg-secondary p-3">
                        <FormField label="Сумма">
                          <input type="number" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder={`Макс. ${remaining}`} className={fieldClass} style={{ minHeight: 44 }} />
                        </FormField>
                        <FormField label="Дата">
                          <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className={fieldClass} style={{ minHeight: 44 }} />
                        </FormField>
                        <FormField label="Комментарий">
                          <input value={payDescription} onChange={(e) => setPayDescription(e.target.value)} className={fieldClass} style={{ minHeight: 44 }} />
                        </FormField>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => savePayment(debt.id)} disabled={savingPayment} className="flex-1 rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" style={{ minHeight: 44, background: '#28a745' }}>
                            {savingPayment ? 'Сохранение…' : 'Сохранить'}
                          </button>
                          <button type="button" onClick={() => setPayingDebtId(null)} className="flex-1 rounded-xl px-4 py-2 text-sm bg-tg-secondary" style={{ minHeight: 44 }}>Отмена</button>
                        </div>
                      </div>
                    ) : (
                      <button type="button" onClick={() => startPay(debt)} className="rounded-xl px-4 py-2 text-sm font-semibold text-white" style={{ minHeight: 44, background: '#28a745' }}>
                        💵 Внести часть оплаты
                      </button>
                    )
                  )}

                  <div className="flex gap-2">
                    <button type="button" onClick={() => toggleSettled(debt)} className="flex-1 rounded-xl px-3 py-2 text-xs font-medium bg-tg-secondary" style={{ minHeight: 40 }}>
                      {debt.is_settled ? '↩ Вернуть в активные' : '✅ Отметить закрытым'}
                    </button>
                    <button type="button" onClick={() => setConfirmDeleteDebtId(debt.id)} className="flex-1 rounded-xl px-3 py-2 text-xs font-medium text-tg-destructive bg-tg-secondary" style={{ minHeight: 40 }}>
                      🗑 Удалить долг
                    </button>
                  </div>
                </div>
              )}
            </Card>
          );
        })
      )}

      <BottomSheet open={formOpen} onClose={() => setFormOpen(false)} title="Записать долг">
        <div className="flex flex-col gap-3">
          <FormField label="Кому должны *">
            <input
              list="mobile-creditor-suggestions"
              value={debtForm.creditor_name}
              onChange={(e) => setDebtForm((f) => ({ ...f, creditor_name: e.target.value }))}
              placeholder="Имя / Фирма"
              className={fieldClass} style={{ minHeight: 48 }}
            />
            <datalist id="mobile-creditor-suggestions">
              {uniqueCreditors.map((c) => <option key={c} value={c} />)}
            </datalist>
          </FormField>
          <FormField label="Сумма *">
            <input type="number" step="0.01" value={debtForm.amount} onChange={(e) => setDebtForm((f) => ({ ...f, amount: e.target.value }))} className={fieldClass} style={{ minHeight: 48 }} />
          </FormField>
          <FormField label="Дата">
            <input type="date" value={debtForm.debt_date} onChange={(e) => setDebtForm((f) => ({ ...f, debt_date: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }} />
          </FormField>
          <FormField label="За что">
            <input value={debtForm.description} onChange={(e) => setDebtForm((f) => ({ ...f, description: e.target.value }))} placeholder="Корм, лекарства и т.д." className={fieldClass} style={{ minHeight: 44 }} />
          </FormField>
          <button
            type="button" onClick={saveDebt} disabled={savingDebt}
            className="rounded-xl px-4 py-3 text-base font-semibold bg-tg-button text-tg-button-text disabled:opacity-60"
            style={{ minHeight: 48 }}
          >
            {savingDebt ? 'Сохранение…' : 'Записать долг'}
          </button>
        </div>
      </BottomSheet>

      <ConfirmSheet open={!!confirmDeleteDebtId} title="Удалить долг?" message="Будут удалены все его погашения." onConfirm={confirmDeleteDebt} onClose={() => setConfirmDeleteDebtId(null)} />
      <ConfirmSheet open={!!confirmDeletePaymentId} title="Удалить погашение?" onConfirm={confirmDeletePayment} onClose={() => setConfirmDeletePaymentId(null)} />
    </div>
  );
}
```

- [ ] **Step 2: Wire the `/debts` route**

In `src/mobile/TelegramApp.jsx`, add:

```js
import MobileDebtsPage from './pages/MobileDebtsPage';
```

Replace:

```js
        <Route path="/debts" element={<MobileStub title="Долги" />} />
```

with:

```js
        <Route path="/debts" element={<MobileDebtsPage />} />
```

- [ ] **Step 3: Verify**

Run: `npx eslint src`
Expected: no new errors.

Run: `npm run build`
Expected: build succeeds.

In the Browser pane at `?tg_debug=1&tg_linked=1`, navigate to `/debts`:
- Confirm the `StatGrid` dashboard and either the empty state or debt cards render without console errors.
- Tap "+ Записать долг", fill creditor+amount, submit; confirm a new card appears.
- Tap the card to expand it, tap "💵 Внести часть оплаты", enter a partial amount, save; confirm the progress bar and remaining amount update.
- Pay the remaining balance in a second payment; confirm the debt auto-marks as "Закрыт" and disappears from the default (non-settled) view; toggle "Закрытые" to see it again.

- [ ] **Step 4: Commit**

```bash
git add src/mobile/pages/MobileDebtsPage.jsx src/mobile/TelegramApp.jsx
git commit -m "feat(mobile): add workshop debts screen at /debts

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Feed — MobileFeedPage

**Files:**
- Create: `src/mobile/pages/MobileFeedPage.jsx`
- Modify: `src/mobile/TelegramApp.jsx` (`/feed` route)

**Interfaces:**
- Consumes: `StatGrid` from Task 1; RPC `get_feed_deliveries()` returning `{id, delivery_date, feed_type, quantity_kg, created_at, batch_id, batch_name, batch_is_active, price_per_kg, amount, transaction_type, company}`.
- Produces: default export `MobileFeedPage`, mounted at `/feed`.

- [ ] **Step 1: Create `MobileFeedPage.jsx`**

```jsx
// src/mobile/pages/MobileFeedPage.jsx
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabaseClient';
import Card from '../components/Card';
import BottomSheet from '../components/BottomSheet';
import ConfirmSheet from '../components/ConfirmSheet';
import FormField from '../components/FormField';
import StatGrid from '../components/StatGrid';
import EmptyState from '../components/EmptyState';
import Spinner from '../components/Spinner';
import { useTelegramMainButton } from '../telegram/useTelegramMainButton';

const KG_PER_BAG = 40;
const fieldClass = 'w-full rounded-xl px-3 bg-tg-secondary text-tg-text';
const formatCurrency = (v) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'TJS' }).format(v || 0);
const EMPTY_FORM = { delivery_date: new Date().toISOString().slice(0, 10), feed_type: 'старт', bags: '', batch_id: '', price_per_kg: '', transaction_type: 'purchase', company: '' };

export default function MobileFeedPage() {
  const [allDeliveries, setAllDeliveries] = useState([]);
  const [activeBatches, setActiveBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  async function fetchData() {
    setLoading(true);
    const [deliveriesRes, batchesRes] = await Promise.all([
      supabase.rpc('get_feed_deliveries'),
      supabase.from('broiler_batches').select('id, batch_name').eq('is_active', true).or('is_summary.eq.false,is_summary.is.null'),
    ]);
    if (deliveriesRes.error) window.alert('Ошибка: ' + deliveriesRes.error.message);
    else setAllDeliveries(deliveriesRes.data || []);
    if (batchesRes.error) window.alert('Ошибка: ' + batchesRes.error.message);
    else setActiveBatches(batchesRes.data || []);
    setLoading(false);
  }

  useEffect(() => { fetchData(); }, []);

  const filteredDeliveries = useMemo(() => {
    return allDeliveries.filter((d) => {
      if (showArchived) return true;
      return !d.batch_id || d.batch_is_active === true;
    });
  }, [allDeliveries, showArchived]);

  const totals = useMemo(() => {
    const kg = filteredDeliveries.reduce((acc, d) => {
      if (d.feed_type === 'старт') acc.start += d.quantity_kg;
      else if (d.feed_type === 'рост') acc.growth += d.quantity_kg;
      else if (d.feed_type === 'финиш') acc.finish += d.quantity_kg;
      return acc;
    }, { start: 0, growth: 0, finish: 0 });
    const totalKg = kg.start + kg.growth + kg.finish;
    const totalCost = filteredDeliveries.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
    return { kg, totalKg, totalCost };
  }, [filteredDeliveries]);

  function openCreate() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, delivery_date: new Date().toISOString().slice(0, 10) });
    setFormOpen(true);
  }
  function openEdit(d) {
    setEditingId(d.id);
    setForm({
      delivery_date: d.delivery_date, feed_type: d.feed_type,
      bags: String(d.quantity_kg / KG_PER_BAG), batch_id: d.batch_id || '',
      price_per_kg: d.price_per_kg != null ? String(d.price_per_kg) : '',
      transaction_type: d.transaction_type || 'purchase', company: d.company || '',
    });
    setFormOpen(true);
  }

  async function save() {
    const bagsNum = Number(form.bags);
    if (!(bagsNum > 0)) { window.alert('Количество мешков должно быть больше нуля'); return; }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
      const quantityKg = bagsNum * KG_PER_BAG;
      const priceNum = Number(form.price_per_kg);
      const payload = {
        delivery_date: form.delivery_date, feed_type: form.feed_type, quantity_kg: quantityKg,
        batch_id: form.batch_id || null,
        price_per_kg: priceNum || null,
        amount: priceNum > 0 ? quantityKg * priceNum : null,
        transaction_type: priceNum > 0 ? form.transaction_type : null,
      };
      let error;
      if (editingId) {
        ({ error } = await supabase.from('feed_deliveries').update(payload).eq('id', editingId));
      } else {
        ({ error } = await supabase.from('feed_deliveries').insert([{ ...payload, user_id: user.id, company: form.company || null }]));
      }
      if (error) window.alert('Ошибка: ' + error.message);
      else { setFormOpen(false); await fetchData(); }
    } finally {
      setSaving(false);
    }
  }

  useTelegramMainButton({
    text: saving ? 'Сохраняем…' : editingId ? 'Сохранить' : 'Добавить приход',
    onClick: save,
    visible: formOpen,
    loading: saving,
  });

  async function confirmDelete() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
    const { error } = await supabase.from('feed_deliveries').delete().eq('id', confirmDeleteId);
    if (error) window.alert('Ошибка: ' + error.message);
    setConfirmDeleteId(null);
    await fetchData();
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  return (
    <div className="flex flex-col gap-3 py-3">
      <StatGrid items={[
        { label: 'Старт', value: `${(totals.kg.start / KG_PER_BAG).toFixed(1)} меш.`, hint: `${totals.kg.start} кг`, color: '#007bff' },
        { label: 'Рост', value: `${(totals.kg.growth / KG_PER_BAG).toFixed(1)} меш.`, hint: `${totals.kg.growth} кг`, color: '#28a745' },
        { label: 'Финиш', value: `${(totals.kg.finish / KG_PER_BAG).toFixed(1)} меш.`, hint: `${totals.kg.finish} кг`, color: '#fd7e14' },
        { label: 'Всего', value: `${(totals.totalKg / KG_PER_BAG).toFixed(1)} меш.`, hint: totals.totalCost > 0 ? formatCurrency(totals.totalCost) : `${totals.totalKg} кг`, color: 'var(--tg-hint)' },
      ]} />

      <button
        type="button" onClick={openCreate}
        className="w-full rounded-xl px-4 py-3 text-base font-semibold bg-tg-button text-tg-button-text"
        style={{ minHeight: 48 }}
      >
        + Добавить приход
      </button>

      <label className="flex items-center gap-2 text-sm text-tg-hint select-none">
        <input type="checkbox" checked={showArchived} onChange={() => setShowArchived((v) => !v)} />
        Показать поставки архивных партий
      </label>

      {filteredDeliveries.length === 0 ? (
        <EmptyState icon="🌾" title="Поставок пока нет" hint="Нажмите «+ Добавить приход»" />
      ) : (
        filteredDeliveries.map((d) => (
          <Card key={d.id}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-base font-medium">{d.feed_type.charAt(0).toUpperCase() + d.feed_type.slice(1)}</p>
                <p className="text-xs text-tg-hint">{new Date(d.delivery_date).toLocaleDateString('ru-RU')} · {(d.quantity_kg / KG_PER_BAG).toFixed(1)} меш. ({d.quantity_kg} кг)</p>
                {d.batch_name && (
                  <span
                    className="inline-block mt-1 text-xs rounded-full px-2 py-0.5"
                    style={{
                      background: d.batch_is_active ? 'color-mix(in srgb, var(--tg-link, #4f46e5) 15%, transparent)' : 'var(--tg-secondary-bg)',
                      color: d.batch_is_active ? 'var(--tg-link, #4f46e5)' : 'var(--tg-hint)',
                    }}
                  >
                    {d.batch_name}
                  </span>
                )}
              </div>
              <p className="text-base font-semibold shrink-0">{d.amount > 0 ? formatCurrency(d.amount) : '–'}</p>
            </div>
            <div className="flex gap-2 mt-2">
              <button type="button" onClick={() => openEdit(d)} className="flex-1 rounded-lg px-3 py-2 text-xs bg-tg-secondary" style={{ minHeight: 36 }}>✏️ Изменить</button>
              <button type="button" onClick={() => setConfirmDeleteId(d.id)} className="flex-1 rounded-lg px-3 py-2 text-xs text-tg-destructive bg-tg-secondary" style={{ minHeight: 36 }}>🗑 Удалить</button>
            </div>
          </Card>
        ))
      )}

      <BottomSheet open={formOpen} onClose={() => setFormOpen(false)} title={editingId ? 'Редактировать приход' : 'Новый приход корма'}>
        <div className="flex flex-col gap-3">
          <FormField label="Дата">
            <input type="date" value={form.delivery_date} onChange={(e) => setForm((f) => ({ ...f, delivery_date: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }} />
          </FormField>
          <FormField label="Тип корма">
            <select value={form.feed_type} onChange={(e) => setForm((f) => ({ ...f, feed_type: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }}>
              <option value="старт">Старт</option>
              <option value="рост">Рост</option>
              <option value="финиш">Финиш</option>
            </select>
          </FormField>
          <FormField label={`Мешки (1 меш. = ${KG_PER_BAG} кг) *`}>
            <input type="number" step="0.5" value={form.bags} onChange={(e) => setForm((f) => ({ ...f, bags: e.target.value }))} placeholder="10" className={fieldClass} style={{ minHeight: 48 }} />
            {form.bags && <p className="text-xs text-tg-hint mt-1">= {(Number(form.bags) * KG_PER_BAG).toFixed(0)} кг</p>}
          </FormField>
          <FormField label="Партия (опционально)">
            <select value={form.batch_id} onChange={(e) => setForm((f) => ({ ...f, batch_id: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }}>
              <option value="">— Не привязывать —</option>
              {activeBatches.map((b) => <option key={b.id} value={b.id}>{b.batch_name}</option>)}
            </select>
          </FormField>
          <FormField label="Цена за кг (опционально)">
            <input type="number" step="0.01" value={form.price_per_kg} onChange={(e) => setForm((f) => ({ ...f, price_per_kg: e.target.value }))} placeholder="5.00" className={fieldClass} style={{ minHeight: 44 }} />
          </FormField>
          {Number(form.price_per_kg) > 0 && (
            <FormField label="Тип оплаты">
              <select value={form.transaction_type} onChange={(e) => setForm((f) => ({ ...f, transaction_type: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }}>
                <option value="purchase">Сразу</option>
                <option value="debt">В долг</option>
              </select>
            </FormField>
          )}
          <FormField label="Фирма (опционально)">
            <input value={form.company} onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }} />
          </FormField>
          <button
            type="button" onClick={save} disabled={saving}
            className="rounded-xl px-4 py-3 text-base font-semibold bg-tg-button text-tg-button-text disabled:opacity-60"
            style={{ minHeight: 48 }}
          >
            {saving ? 'Сохраняем…' : editingId ? 'Сохранить' : 'Добавить приход'}
          </button>
        </div>
      </BottomSheet>

      <ConfirmSheet open={!!confirmDeleteId} title="Удалить запись?" onConfirm={confirmDelete} onClose={() => setConfirmDeleteId(null)} />
    </div>
  );
}
```

- [ ] **Step 2: Wire the `/feed` route**

In `src/mobile/TelegramApp.jsx`, add:

```js
import MobileFeedPage from './pages/MobileFeedPage';
```

Replace:

```js
        <Route path="/feed" element={<MobileStub title="Корм" />} />
```

with:

```js
        <Route path="/feed" element={<MobileFeedPage />} />
```

- [ ] **Step 3: Verify**

Run: `npx eslint src`
Expected: no new errors.

Run: `npm run build`
Expected: build succeeds.

In the Browser pane at `?tg_debug=1&tg_linked=1`, navigate to `/feed`:
- Confirm the `StatGrid` summary and either the empty state or delivery cards render without console errors.
- Tap "+ Добавить приход", pick a feed type, enter bags (confirm the "= N кг" hint updates live), submit; confirm the card appears with correct kg.
- Add a price per kg and confirm the "Тип оплаты" field appears conditionally; submit; confirm the amount shows on the card.
- Edit and delete a delivery; confirm the summary totals update accordingly.

- [ ] **Step 4: Commit**

```bash
git add src/mobile/pages/MobileFeedPage.jsx src/mobile/TelegramApp.jsx
git commit -m "feat(mobile): add feed screen at /feed

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Coal — MobileCoalPage

**Files:**
- Create: `src/mobile/pages/MobileCoalPage.jsx`
- Modify: `src/mobile/TelegramApp.jsx` (`/coal` route)

**Interfaces:**
- Consumes: `StatGrid`, `Tabs` from Task 1 / existing components; table `coal_transactions` (`id, transaction_date, transaction_type, quantity_kg, price_per_kg, amount, description, is_hidden, batch_id`), check constraint `transaction_type IN ('purchase','debt','payment')`.
- Produces: default export `MobileCoalPage`, mounted at `/coal`. No `BottomSheet` forms here (mirrors desktop's inline tabbed forms), so `useTelegramMainButton` is not used.

- [ ] **Step 1: Create `MobileCoalPage.jsx`**

```jsx
// src/mobile/pages/MobileCoalPage.jsx
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabaseClient';
import Card from '../components/Card';
import ConfirmSheet from '../components/ConfirmSheet';
import FormField from '../components/FormField';
import StatGrid from '../components/StatGrid';
import Tabs from '../components/Tabs';
import EmptyState from '../components/EmptyState';
import Spinner from '../components/Spinner';

const fieldClass = 'w-full rounded-xl px-3 bg-tg-secondary text-tg-text';
const formatCurrency = (v) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'TJS' }).format(v || 0);
const TYPE_LABELS = { purchase: { label: 'Покупка', color: '#007bff' }, debt: { label: 'В долг', color: '#fd7e14' }, payment: { label: 'Оплата', color: '#28a745' } };

const EMPTY_TXN_FORM = { transaction_date: new Date().toISOString().slice(0, 10), quantity_kg: '', price_per_kg: '', description: '', batch_id: '' };
const EMPTY_PAYMENT_FORM = { transaction_date: new Date().toISOString().slice(0, 10), amount: '', description: '' };

export default function MobileCoalPage() {
  const [transactions, setTransactions] = useState([]);
  const [activeBatches, setActiveBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showHidden, setShowHidden] = useState(false);

  const [activeTab, setActiveTab] = useState('purchase');
  const [txnForm, setTxnForm] = useState(EMPTY_TXN_FORM);
  const [paymentForm, setPaymentForm] = useState(EMPTY_PAYMENT_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  async function fetchData() {
    setLoading(true);
    const [txRes, batchesRes] = await Promise.all([
      supabase.from('coal_transactions').select('*').order('transaction_date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('broiler_batches').select('id, batch_name').eq('is_active', true).or('is_summary.eq.false,is_summary.is.null'),
    ]);
    if (txRes.error) window.alert('Ошибка: ' + txRes.error.message);
    else setTransactions(txRes.data || []);
    if (batchesRes.error) window.alert('Ошибка: ' + batchesRes.error.message);
    else setActiveBatches(batchesRes.data || []);
    setLoading(false);
  }

  useEffect(() => { fetchData(); }, []);

  const filteredTransactions = useMemo(() => transactions.filter((t) => showHidden || !t.is_hidden), [transactions, showHidden]);

  const summary = useMemo(() => {
    const s = { total_kg: 0, total_purchased: 0, total_debt: 0, total_paid: 0 };
    filteredTransactions.forEach((t) => {
      const amt = Number(t.amount) || 0;
      const kg = Number(t.quantity_kg) || 0;
      if (t.transaction_type === 'purchase') { s.total_purchased += amt; s.total_kg += kg; }
      else if (t.transaction_type === 'debt') { s.total_debt += amt; s.total_kg += kg; }
      else if (t.transaction_type === 'payment') { s.total_paid += amt; }
    });
    s.current_balance = s.total_debt - s.total_paid;
    return s;
  }, [filteredTransactions]);

  async function submitTxn() {
    const qty = Number(txnForm.quantity_kg);
    const price = Number(txnForm.price_per_kg);
    const totalAmount = qty * price;
    if (!(totalAmount > 0)) { window.alert('Сумма должна быть больше нуля'); return; }
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
      const { error } = await supabase.from('coal_transactions').insert([{
        transaction_date: txnForm.transaction_date, transaction_type: activeTab,
        quantity_kg: qty, price_per_kg: price, amount: totalAmount,
        description: txnForm.description || null, batch_id: txnForm.batch_id || null, user_id: user.id,
      }]);
      if (error) window.alert('Ошибка: ' + error.message);
      else { setTxnForm({ ...EMPTY_TXN_FORM, transaction_date: new Date().toISOString().slice(0, 10) }); await fetchData(); }
    } finally {
      setSubmitting(false);
    }
  }

  async function submitPayment() {
    const amount = Number(paymentForm.amount);
    if (!(amount > 0)) { window.alert('Сумма должна быть больше нуля'); return; }
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
      const { error } = await supabase.from('coal_transactions').insert([{
        transaction_date: paymentForm.transaction_date, transaction_type: 'payment',
        quantity_kg: null, price_per_kg: null, amount,
        description: paymentForm.description || 'Платёж за уголь', user_id: user.id,
      }]);
      if (error) window.alert('Ошибка: ' + error.message);
      else { setPaymentForm({ ...EMPTY_PAYMENT_FORM, transaction_date: new Date().toISOString().slice(0, 10) }); await fetchData(); }
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleHidden(t) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
    const { error } = await supabase.from('coal_transactions').update({ is_hidden: !t.is_hidden }).eq('id', t.id);
    if (error) window.alert('Ошибка: ' + error.message);
    await fetchData();
  }

  async function confirmDelete() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
    const { error } = await supabase.from('coal_transactions').delete().eq('id', confirmDeleteId);
    if (error) window.alert('Ошибка: ' + error.message);
    setConfirmDeleteId(null);
    await fetchData();
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  return (
    <div className="flex flex-col gap-3 py-3">
      <StatGrid items={[
        { label: 'Всего (кг)', value: `${summary.total_kg || 0} кг`, color: 'var(--tg-hint)' },
        { label: 'Куплено', value: formatCurrency(summary.total_purchased), color: '#007bff' },
        { label: 'В долг', value: formatCurrency(summary.total_debt), color: '#fd7e14' },
        { label: 'Оплачено', value: formatCurrency(summary.total_paid), color: '#28a745' },
      ]} />
      <StatGrid items={[
        { label: 'Остаток долга', value: formatCurrency(summary.current_balance), color: summary.current_balance > 0 ? '#dc3545' : 'var(--tg-hint)' },
      ]} />

      <label className="flex items-center gap-2 text-sm text-tg-hint select-none">
        <input type="checkbox" checked={showHidden} onChange={() => setShowHidden((v) => !v)} />
        Показать скрытые позиции
      </label>

      <Tabs
        tabs={[
          { key: 'purchase', label: '📦 Покупка' },
          { key: 'debt', label: '📋 В долг' },
          { key: 'payment', label: '💰 Оплата' },
        ]}
        active={activeTab}
        onChange={setActiveTab}
      />

      <Card>
        {activeTab !== 'payment' ? (
          <div className="flex flex-col gap-3">
            <FormField label="Дата">
              <input type="date" value={txnForm.transaction_date} onChange={(e) => setTxnForm((f) => ({ ...f, transaction_date: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }} />
            </FormField>
            <FormField label="Кол-во (кг) *">
              <input type="number" step="0.1" value={txnForm.quantity_kg} onChange={(e) => setTxnForm((f) => ({ ...f, quantity_kg: e.target.value }))} placeholder="1000" className={fieldClass} style={{ minHeight: 48 }} />
            </FormField>
            <FormField label="Цена за кг *">
              <input type="number" step="0.01" value={txnForm.price_per_kg} onChange={(e) => setTxnForm((f) => ({ ...f, price_per_kg: e.target.value }))} placeholder="3.50" className={fieldClass} style={{ minHeight: 48 }} />
            </FormField>
            {txnForm.quantity_kg && txnForm.price_per_kg && (
              <p className="text-sm text-tg-hint">Итого: <strong>{formatCurrency(Number(txnForm.quantity_kg) * Number(txnForm.price_per_kg))}</strong></p>
            )}
            <FormField label="Описание">
              <input value={txnForm.description} onChange={(e) => setTxnForm((f) => ({ ...f, description: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }} />
            </FormField>
            <FormField label="Партия (опционально)">
              <select value={txnForm.batch_id} onChange={(e) => setTxnForm((f) => ({ ...f, batch_id: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }}>
                <option value="">— Не привязывать —</option>
                {activeBatches.map((b) => <option key={b.id} value={b.id}>{b.batch_name}</option>)}
              </select>
            </FormField>
            <button
              type="button" onClick={submitTxn} disabled={submitting}
              className="rounded-xl px-4 py-3 text-base font-semibold text-white disabled:opacity-60"
              style={{ minHeight: 48, background: activeTab === 'purchase' ? '#007bff' : '#fd7e14' }}
            >
              {submitting ? 'Сохранение…' : activeTab === 'purchase' ? '📦 Записать покупку' : '📋 Записать в долг'}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <FormField label="Дата">
              <input type="date" value={paymentForm.transaction_date} onChange={(e) => setPaymentForm((f) => ({ ...f, transaction_date: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }} />
            </FormField>
            <FormField label="Сумма *">
              <input type="number" step="0.01" value={paymentForm.amount} onChange={(e) => setPaymentForm((f) => ({ ...f, amount: e.target.value }))} placeholder="5000" className={fieldClass} style={{ minHeight: 48 }} />
            </FormField>
            <FormField label="Описание">
              <input value={paymentForm.description} onChange={(e) => setPaymentForm((f) => ({ ...f, description: e.target.value }))} placeholder="Платёж за уголь" className={fieldClass} style={{ minHeight: 44 }} />
            </FormField>
            <button
              type="button" onClick={submitPayment} disabled={submitting}
              className="rounded-xl px-4 py-3 text-base font-semibold text-white disabled:opacity-60"
              style={{ minHeight: 48, background: '#28a745' }}
            >
              {submitting ? 'Сохранение…' : '💰 Записать оплату'}
            </button>
          </div>
        )}
      </Card>

      {filteredTransactions.length === 0 ? (
        <EmptyState icon="🔥" title="Операций пока нет" />
      ) : (
        filteredTransactions.map((t) => {
          const info = TYPE_LABELS[t.transaction_type] || {};
          return (
            <Card key={t.id} className={t.is_hidden ? 'opacity-50' : ''}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-xs font-semibold rounded-full px-2 py-0.5" style={{ background: `color-mix(in srgb, ${info.color} 15%, transparent)`, color: info.color }}>
                    {info.label}
                  </span>
                  <p className="text-xs text-tg-hint mt-1">{new Date(t.transaction_date).toLocaleDateString('ru-RU')}{t.description ? ` · ${t.description}` : ''}</p>
                  {t.quantity_kg ? <p className="text-xs text-tg-hint">{t.quantity_kg} кг @ {t.price_per_kg}</p> : null}
                </div>
                <p className="text-base font-semibold shrink-0" style={{ color: info.color }}>
                  {t.transaction_type === 'payment' ? '−' : '+'}{formatCurrency(t.amount)}
                </p>
              </div>
              <div className="flex gap-2 mt-2">
                <button type="button" onClick={() => toggleHidden(t)} className="flex-1 rounded-lg px-3 py-2 text-xs bg-tg-secondary" style={{ minHeight: 36 }}>
                  {t.is_hidden ? '👁️ Показать' : '🙈 Скрыть'}
                </button>
                <button type="button" onClick={() => setConfirmDeleteId(t.id)} className="flex-1 rounded-lg px-3 py-2 text-xs text-tg-destructive bg-tg-secondary" style={{ minHeight: 36 }}>🗑 Удалить</button>
              </div>
            </Card>
          );
        })
      )}

      <ConfirmSheet open={!!confirmDeleteId} title="Удалить запись?" message="Это повлияет на общий баланс." onConfirm={confirmDelete} onClose={() => setConfirmDeleteId(null)} />
    </div>
  );
}
```

- [ ] **Step 2: Wire the `/coal` route**

In `src/mobile/TelegramApp.jsx`, add:

```js
import MobileCoalPage from './pages/MobileCoalPage';
```

Replace:

```js
        <Route path="/coal" element={<MobileStub title="Уголь" />} />
```

with:

```js
        <Route path="/coal" element={<MobileCoalPage />} />
```

- [ ] **Step 3: Verify**

Run: `npx eslint src`
Expected: no new errors.

Run: `npm run build`
Expected: build succeeds.

In the Browser pane at `?tg_debug=1&tg_linked=1`, navigate to `/coal`:
- Confirm both `StatGrid` rows and the tabs render without console errors.
- On "📦 Покупка", enter kg+price, confirm the "Итого" preview line updates, submit; confirm a purchase card appears and totals update.
- Switch to "💰 Оплата", submit a payment; confirm "Остаток долга" reflects it.
- Toggle hide/show and delete on a transaction card; confirm the list and summary update.

- [ ] **Step 4: Commit**

```bash
git add src/mobile/pages/MobileCoalPage.jsx src/mobile/TelegramApp.jsx
git commit -m "feat(mobile): add coal screen at /coal

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Salaries — MobileCreateEmployeeTab

**Files:**
- Create: `src/mobile/pages/salaries/MobileCreateEmployeeTab.jsx`

**Interfaces:**
- Consumes: `NamePicker` from Task 1; props `{ activeBatches: {id, batch_name}[], fetchPersons: () => Promise<void>, persons: {id, full_name}[] }` (same shape the desktop `CreateEmployeeTab` receives).
- Produces: default export `MobileCreateEmployeeTab`, consumed by Task 10's `MobileSalariesPage`. Not routed directly.

- [ ] **Step 1: Create `MobileCreateEmployeeTab.jsx`**

```jsx
// src/mobile/pages/salaries/MobileCreateEmployeeTab.jsx
import { useState } from 'react';
import { supabase } from '../../../supabaseClient';
import Card from '../../components/Card';
import FormField from '../../components/FormField';
import NamePicker from '../../components/NamePicker';

const fieldClass = 'w-full rounded-xl px-3 bg-tg-secondary text-tg-text';

export default function MobileCreateEmployeeTab({ activeBatches, fetchPersons, persons }) {
  const [nameInput, setNameInput] = useState('');
  const [personChoice, setPersonChoice] = useState(null); // { mode: 'existing', person } | { mode: 'new', name }
  const [position, setPosition] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [batchId, setBatchId] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  function handleNameChange(text) {
    setNameInput(text);
    setPersonChoice(null);
  }

  async function handleAdd() {
    if (!personChoice) { window.alert('Выберите физлицо из списка или создайте новое.'); return; }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }

      let personId; let fullName;
      if (personChoice.mode === 'existing') {
        personId = personChoice.person.id;
        fullName = personChoice.person.full_name;
        const { data: openPeriods, error: checkError } = await supabase
          .from('employees').select('id').eq('person_id', personId).eq('is_active', true).is('end_date', null);
        if (checkError) throw checkError;
        if (openPeriods && openPeriods.length > 0) {
          window.alert('У этого физлица уже есть активный период работы. Сначала уволить его во вкладке «Приём и увольнение».');
          return;
        }
      } else {
        fullName = personChoice.name;
        const { data: newPerson, error: personError } = await supabase.from('persons').insert([{ full_name: fullName, user_id: user.id }]).select().single();
        if (personError) throw personError;
        personId = newPerson.id;
      }

      const { error: employeeError } = await supabase.from('employees').insert([{
        full_name: fullName, person_id: personId, position, start_date: startDate,
        batch_id: batchId || null, is_active: true, user_id: user.id,
      }]);
      if (employeeError) {
        if (employeeError.code === '23505') {
          throw new Error('У этого физлица уже есть активный период работы. Сначала уволить его во вкладке «Приём и увольнение».');
        }
        throw employeeError;
      }

      setNameInput(''); setPersonChoice(null); setPosition(''); setBatchId('');
      setStartDate(new Date().toISOString().slice(0, 10));
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      await fetchPersons();
    } catch (e) {
      window.alert('Ошибка: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {success && (
        <Card style={{ borderLeft: '4px solid #28a745' }}>
          <p className="text-sm font-semibold" style={{ color: '#28a745' }}>✅ Сотрудник добавлен!</p>
        </Card>
      )}
      <Card>
        <div className="flex flex-col gap-3">
          <FormField label="ФИО">
            <NamePicker
              items={persons || []}
              value={nameInput}
              onChange={handleNameChange}
              onSelectExisting={(p) => { setNameInput(p.full_name); setPersonChoice({ mode: 'existing', person: p }); }}
              onCreateNew={(name) => setPersonChoice({ mode: 'new', name })}
              placeholder="Начните вводить имя..."
            />
            {personChoice?.mode === 'existing' && <p className="text-xs mt-1" style={{ color: 'var(--tg-link, #4f46e5)' }}>✓ Существующее физлицо — будет добавлен новый период</p>}
            {personChoice?.mode === 'new' && <p className="text-xs mt-1" style={{ color: '#28a745' }}>✓ Будет создано новое физлицо «{personChoice.name}»</p>}
          </FormField>
          <FormField label="Должность">
            <input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="Например: рабочий, сторож" className={fieldClass} style={{ minHeight: 48 }} />
          </FormField>
          <FormField label="Дата начала работы">
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={fieldClass} style={{ minHeight: 44 }} />
          </FormField>
          <FormField label="Партия (опционально)">
            <select value={batchId} onChange={(e) => setBatchId(e.target.value)} className={fieldClass} style={{ minHeight: 44 }}>
              <option value="">— Без партии —</option>
              {activeBatches.map((b) => <option key={b.id} value={b.id}>{b.batch_name}</option>)}
            </select>
          </FormField>
          <button
            type="button" onClick={handleAdd} disabled={saving}
            className="rounded-xl px-4 py-3 text-base font-semibold bg-tg-button text-tg-button-text disabled:opacity-60"
            style={{ minHeight: 48 }}
          >
            {saving ? 'Добавление…' : '✨ Принять на работу'}
          </button>
        </div>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx eslint src/mobile/pages/salaries/MobileCreateEmployeeTab.jsx`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds (this component isn't wired into any route yet — it's consumed by Task 10).

- [ ] **Step 3: Commit**

```bash
git add src/mobile/pages/salaries/MobileCreateEmployeeTab.jsx
git commit -m "feat(mobile): add MobileCreateEmployeeTab for salaries

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Salaries — MobileHireFireTab

**Files:**
- Create: `src/mobile/pages/salaries/MobileHireFireTab.jsx`

**Interfaces:**
- Consumes: `NamePicker` from Task 1; props `{ persons: Person[], activeBatches: {id, batch_name}[], fetchPersons: () => Promise<void> }` where `Person = { id, full_name, employees: Employee[] }` and `Employee = { id, position, start_date, end_date, is_active, batch_id, rate, absent_days, salary_tiers, first_days_n, fixed_sum, broiler_batches }`.
- Produces: default export `MobileHireFireTab`, consumed by Task 10's `MobileSalariesPage`. Full parity with desktop `src/pages/employees/HireFireTab.jsx`: fire, rehire, edit-current-period (incl. salary tiers editor), add-historical-period (incl. tiers editor), merge-duplicate-persons, delete-person.

- [ ] **Step 1: Create `MobileHireFireTab.jsx`**

```jsx
// src/mobile/pages/salaries/MobileHireFireTab.jsx
import { useMemo, useState } from 'react';
import { supabase } from '../../../supabaseClient';
import Card from '../../components/Card';
import BottomSheet from '../../components/BottomSheet';
import ConfirmSheet from '../../components/ConfirmSheet';
import FormField from '../../components/FormField';
import NamePicker from '../../components/NamePicker';
import EmptyState from '../../components/EmptyState';

const fieldClass = 'w-full rounded-xl px-3 bg-tg-secondary text-tg-text';

function tiersToForm(tiers) {
  return (Array.isArray(tiers) ? tiers : []).map((t) => ({ days: String(t.days || ''), rate: String(t.rate || '') }));
}
function tiersFromForm(tiers) {
  return tiers.filter((t) => Number(t.days) > 0).map((t) => ({ days: Number(t.days), rate: Number(t.rate) || 0 }));
}

function TiersEditor({ tiers, setTiers, baseRate }) {
  return (
    <div className="rounded-xl bg-tg-secondary p-3">
      <div className="flex justify-between items-center mb-2">
        <p className="text-xs font-semibold text-tg-hint">📊 Ступени ставок</p>
        <button type="button" onClick={() => setTiers([...tiers, { days: '', rate: '' }])} className="text-xs px-2 py-1 rounded-lg font-medium" style={{ background: 'var(--tg-bg)', color: 'var(--tg-link, #4f46e5)' }}>
          + Добавить
        </button>
      </div>
      {tiers.length === 0 ? (
        <p className="text-xs text-tg-hint">Нет ступеней — все дни по основной ставке ({baseRate || 0}/день)</p>
      ) : (
        <div className="flex flex-col gap-2">
          {tiers.map((tier, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="text-xs text-tg-hint w-4">{idx + 1}.</span>
              <input
                type="number" placeholder="Дней" value={tier.days}
                onChange={(e) => { const u = [...tiers]; u[idx] = { ...u[idx], days: e.target.value }; setTiers(u); }}
                className={fieldClass} style={{ minHeight: 40, flex: 1 }}
              />
              <span className="text-xs text-tg-hint">дн. по</span>
              <input
                type="number" step="0.01" placeholder="Ставка" value={tier.rate}
                onChange={(e) => { const u = [...tiers]; u[idx] = { ...u[idx], rate: e.target.value }; setTiers(u); }}
                className={fieldClass} style={{ minHeight: 40, flex: 1 }}
              />
              <button type="button" onClick={() => setTiers(tiers.filter((_, i) => i !== idx))} className="text-tg-destructive px-1">✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MobileHireFireTab({ persons, activeBatches, fetchPersons }) {
  const [selectedPersonId, setSelectedPersonId] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [saving, setSaving] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState(null);

  const [addPeriodOpen, setAddPeriodOpen] = useState(false);
  const [addPeriodForm, setAddPeriodForm] = useState(null);

  const [rehireOpen, setRehireOpen] = useState(false);
  const [rehireForm, setRehireForm] = useState(null);

  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeSearchText, setMergeSearchText] = useState('');
  const [mergeTarget, setMergeTarget] = useState(null);

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const filteredPersons = useMemo(() => {
    if (!persons) return [];
    return persons.filter((person) => {
      if (showArchived) return true;
      if (!person.employees || person.employees.length === 0) return false;
      return person.employees.some((emp) => {
        const batchIsActive = emp.broiler_batches?.is_active;
        const empIsActive = emp.is_active !== false && !emp.end_date;
        return empIsActive && (batchIsActive === true || batchIsActive === undefined);
      });
    });
  }, [persons, showArchived]);

  const selectedPerson = useMemo(() => persons?.find((p) => p.id === selectedPersonId) || null, [persons, selectedPersonId]);
  const recentEmployment = selectedPerson?.employees?.[0];
  const isEmployeeFired = !recentEmployment || recentEmployment.is_active === false || !!recentEmployment.end_date;

  function openEdit() {
    if (!recentEmployment) return;
    setEditForm({
      name: selectedPerson.full_name,
      position: recentEmployment.position || '',
      start_date: recentEmployment.start_date || new Date().toISOString().slice(0, 10),
      end_date: recentEmployment.end_date || '',
      batch_id: recentEmployment.batch_id || '',
      rate: recentEmployment.rate ?? '',
      absent_days: recentEmployment.absent_days ?? 0,
      tiers: tiersToForm(
        Array.isArray(recentEmployment.salary_tiers) && recentEmployment.salary_tiers.length > 0
          ? recentEmployment.salary_tiers
          : (Number(recentEmployment.first_days_n) > 0 ? [{ days: recentEmployment.first_days_n, rate: recentEmployment.fixed_sum || 0 }] : []),
      ),
    });
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!selectedPerson || !recentEmployment) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
      if (editForm.name !== selectedPerson.full_name) {
        await supabase.from('persons').update({ full_name: editForm.name }).eq('id', selectedPerson.id);
      }
      const { error } = await supabase.from('employees').update({
        full_name: editForm.name, position: editForm.position, start_date: editForm.start_date,
        end_date: editForm.end_date || null, batch_id: editForm.batch_id || null,
        rate: Number(editForm.rate) || 0, absent_days: Number(editForm.absent_days) || 0,
        is_active: !editForm.end_date, salary_tiers: tiersFromForm(editForm.tiers),
      }).eq('id', recentEmployment.id);
      if (error) { window.alert('Ошибка: ' + error.message); return; }
      await fetchPersons();
      setEditOpen(false);
      setSelectedPersonId(null);
    } finally {
      setSaving(false);
    }
  }

  async function fireEmployee() {
    if (!selectedPerson || !recentEmployment) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
      const { error } = await supabase.from('employees').update({ end_date: new Date().toISOString().slice(0, 10), is_active: false }).eq('id', recentEmployment.id);
      if (error) { window.alert('Ошибка: ' + error.message); return; }
      await fetchPersons();
      setSelectedPersonId(null);
    } finally {
      setSaving(false);
    }
  }

  function openRehire() {
    setRehireForm({ position: recentEmployment?.position || '', start_date: new Date().toISOString().slice(0, 10), batch_id: '' });
    setRehireOpen(true);
  }

  async function confirmRehire() {
    if (!selectedPerson) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
      const { error } = await supabase.from('employees').insert({
        person_id: selectedPerson.id, full_name: selectedPerson.full_name,
        position: rehireForm.position, start_date: rehireForm.start_date, end_date: null,
        batch_id: rehireForm.batch_id || null, is_active: true, user_id: user.id,
        rate: recentEmployment?.rate || 0, salary_tiers: recentEmployment?.salary_tiers || [],
      });
      if (error) {
        window.alert(error.code === '23505' ? 'У этого физлица уже есть активный период работы.' : 'Ошибка: ' + error.message);
        return;
      }
      await fetchPersons();
      setRehireOpen(false);
      setSelectedPersonId(null);
    } finally {
      setSaving(false);
    }
  }

  function openAddPeriod() {
    setAddPeriodForm({
      position: recentEmployment?.position || '', start_date: new Date().toISOString().slice(0, 10), end_date: '',
      batch_id: '', rate: recentEmployment?.rate || '',
      tiers: tiersToForm(recentEmployment?.salary_tiers || []),
    });
    setAddPeriodOpen(true);
  }

  async function saveAddPeriod() {
    if (!selectedPerson) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
      const { error } = await supabase.from('employees').insert({
        person_id: selectedPerson.id, full_name: selectedPerson.full_name,
        position: addPeriodForm.position, start_date: addPeriodForm.start_date,
        end_date: addPeriodForm.end_date || null, batch_id: addPeriodForm.batch_id || null,
        rate: Number(addPeriodForm.rate) || 0, is_active: !addPeriodForm.end_date, user_id: user.id,
        salary_tiers: tiersFromForm(addPeriodForm.tiers),
      });
      if (error) {
        window.alert(error.code === '23505' ? 'У этого физлица уже есть активный период работы. Сначала уволить его.' : 'Ошибка: ' + error.message);
        return;
      }
      await fetchPersons();
      setAddPeriodOpen(false);
      setSelectedPersonId(null);
    } finally {
      setSaving(false);
    }
  }

  function openMerge() {
    setMergeSearchText(''); setMergeTarget(null); setMergeOpen(true);
  }

  async function confirmMerge() {
    if (!selectedPerson || !mergeTarget) return;
    const targetOpen = mergeTarget.employees?.some((e) => e.is_active !== false && !e.end_date);
    const selectedOpen = selectedPerson.employees?.some((e) => e.is_active !== false && !e.end_date);
    if (targetOpen && selectedOpen) {
      window.alert('У обоих физлиц есть активный период работы. Сначала уволить один из них.');
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
      const { error: reparentError } = await supabase.from('employees')
        .update({ person_id: selectedPerson.id, full_name: selectedPerson.full_name })
        .eq('person_id', mergeTarget.id);
      if (reparentError) {
        window.alert(reparentError.code === '23505'
          ? 'Не удалось объединить: у обоих физлиц есть активный период работы.'
          : 'Ошибка: ' + reparentError.message);
        return;
      }
      const { error: deleteError } = await supabase.from('persons').delete().eq('id', mergeTarget.id);
      if (deleteError) window.alert('Карточки перенесены, но не удалось удалить дубль: ' + deleteError.message);
      await fetchPersons();
      setMergeOpen(false);
      setMergeTarget(null);
      setSelectedPersonId(null);
    } finally {
      setSaving(false);
    }
  }

  async function deletePerson() {
    if (!selectedPerson) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
      const { error } = await supabase.from('persons').delete().eq('id', selectedPerson.id);
      if (error) { window.alert('Ошибка: ' + error.message); return; }
      await fetchPersons();
      setConfirmDeleteOpen(false);
      setSelectedPersonId(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-2 text-sm text-tg-hint select-none">
        <input type="checkbox" checked={showArchived} onChange={() => setShowArchived((v) => !v)} />
        Показать уволенных
      </label>

      {filteredPersons.length === 0 ? (
        <EmptyState icon="👤" title="Нет сотрудников" />
      ) : (
        filteredPersons.map((person) => {
          const latestEmp = person.employees?.[0];
          const batch = latestEmp?.broiler_batches;
          const isArchived = !latestEmp || latestEmp.is_active === false || batch?.is_active === false;
          const isExpanded = selectedPersonId === person.id;
          return (
            <Card key={person.id} onClick={() => setSelectedPersonId(isExpanded ? null : person.id)}>
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{person.full_name}</p>
                  {latestEmp?.position && <p className="text-xs text-tg-hint">{latestEmp.position}</p>}
                  {batch && (
                    <span
                      className="inline-block mt-1 text-xs rounded-full px-2 py-0.5"
                      style={{
                        background: batch.is_active ? 'color-mix(in srgb, var(--tg-link, #4f46e5) 15%, transparent)' : 'var(--tg-secondary-bg)',
                        color: batch.is_active ? 'var(--tg-link, #4f46e5)' : 'var(--tg-hint)',
                      }}
                    >
                      {batch.batch_name}{!batch.is_active && ' (архив)'}
                    </span>
                  )}
                </div>
                {isArchived && <span className="text-xs rounded-full px-2 py-0.5 shrink-0" style={{ background: 'color-mix(in srgb, #dc3545 15%, transparent)', color: '#dc3545' }}>уволен</span>}
              </div>

              {isExpanded && (
                <div className="mt-3 pt-3 flex flex-col gap-3" style={{ borderTop: '1px solid var(--tg-secondary-bg)' }} onClick={(e) => e.stopPropagation()}>
                  {isEmployeeFired ? (
                    <p className="text-sm font-medium" style={{ color: '#dc3545' }}>🔴 В данный момент уволен</p>
                  ) : (
                    <p className="text-sm font-medium" style={{ color: '#28a745' }}>🟢 Работает (c {new Date(recentEmployment.start_date).toLocaleDateString('ru-RU')})</p>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={openEdit} className="rounded-xl px-3 py-2 text-xs font-medium text-white" style={{ minHeight: 40, background: '#007bff' }}>✏️ Редактировать</button>
                    {isEmployeeFired ? (
                      <button type="button" onClick={openRehire} className="rounded-xl px-3 py-2 text-xs font-medium text-white" style={{ minHeight: 40, background: '#28a745' }}>🔄 Принять заново</button>
                    ) : (
                      <button type="button" onClick={fireEmployee} className="rounded-xl px-3 py-2 text-xs font-medium text-white" style={{ minHeight: 40, background: '#fd7e14' }}>📤 Уволить</button>
                    )}
                    <button type="button" onClick={openAddPeriod} className="rounded-xl px-3 py-2 text-xs font-medium text-white" style={{ minHeight: 40, background: '#059669' }}>➕ Добавить период</button>
                    <button type="button" onClick={openMerge} className="rounded-xl px-3 py-2 text-xs font-medium text-white" style={{ minHeight: 40, background: '#9333ea' }}>🔗 Объединить</button>
                  </div>
                  <button type="button" onClick={() => setConfirmDeleteOpen(true)} className="rounded-xl px-3 py-2 text-xs font-medium text-white" style={{ minHeight: 40, background: '#dc3545' }}>🗑 Удалить</button>

                  <div>
                    <p className="text-xs font-semibold text-tg-hint mb-1">История работы</p>
                    {(person.employees || []).map((emp) => (
                      <div key={emp.id} className="rounded-lg bg-tg-secondary p-2 mb-1">
                        <p className="text-sm font-medium" style={{ color: 'var(--tg-link, #4f46e5)' }}>{emp.position || 'Должность не указана'}</p>
                        <p className="text-xs text-tg-hint">{new Date(emp.start_date).toLocaleDateString('ru-RU')} — {emp.end_date ? new Date(emp.end_date).toLocaleDateString('ru-RU') : 'По настоящее время'}</p>
                        <p className="text-xs text-tg-hint">Ставка: {emp.rate} TJS/день{emp.broiler_batches ? ` · ${emp.broiler_batches.batch_name}` : ''}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          );
        })
      )}

      <BottomSheet open={editOpen} onClose={() => setEditOpen(false)} title="Редактировать текущий период">
        {editForm && (
          <div className="flex flex-col gap-3">
            <FormField label="ФИО"><input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} className={fieldClass} style={{ minHeight: 48 }} /></FormField>
            <FormField label="Должность"><input value={editForm.position} onChange={(e) => setEditForm((f) => ({ ...f, position: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }} /></FormField>
            <FormField label="Дата начала"><input type="date" value={editForm.start_date} onChange={(e) => setEditForm((f) => ({ ...f, start_date: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }} /></FormField>
            <FormField label="Дата увольнения"><input type="date" value={editForm.end_date} onChange={(e) => setEditForm((f) => ({ ...f, end_date: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }} /></FormField>
            <FormField label="Партия">
              <select value={editForm.batch_id} onChange={(e) => setEditForm((f) => ({ ...f, batch_id: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }}>
                <option value="">— Без партии —</option>
                {activeBatches.map((b) => <option key={b.id} value={b.id}>{b.batch_name}</option>)}
              </select>
            </FormField>
            <FormField label="Основная ставка/день"><input type="number" step="0.01" value={editForm.rate} onChange={(e) => setEditForm((f) => ({ ...f, rate: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }} /></FormField>
            <FormField label="Дней отсутствия"><input type="number" value={editForm.absent_days} onChange={(e) => setEditForm((f) => ({ ...f, absent_days: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }} /></FormField>
            <TiersEditor tiers={editForm.tiers} setTiers={(tiers) => setEditForm((f) => ({ ...f, tiers }))} baseRate={editForm.rate} />
            <button type="button" onClick={saveEdit} disabled={saving} className="rounded-xl px-4 py-3 text-base font-semibold bg-tg-button text-tg-button-text disabled:opacity-60" style={{ minHeight: 48 }}>
              {saving ? 'Сохранение…' : 'Сохранить'}
            </button>
          </div>
        )}
      </BottomSheet>

      <BottomSheet open={addPeriodOpen} onClose={() => setAddPeriodOpen(false)} title="Добавить новый период">
        {addPeriodForm && (
          <div className="flex flex-col gap-3">
            <FormField label="Должность"><input value={addPeriodForm.position} onChange={(e) => setAddPeriodForm((f) => ({ ...f, position: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }} /></FormField>
            <FormField label="Дата начала"><input type="date" value={addPeriodForm.start_date} onChange={(e) => setAddPeriodForm((f) => ({ ...f, start_date: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }} /></FormField>
            <FormField label="Дата окончания"><input type="date" value={addPeriodForm.end_date} onChange={(e) => setAddPeriodForm((f) => ({ ...f, end_date: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }} /></FormField>
            <FormField label="Партия">
              <select value={addPeriodForm.batch_id} onChange={(e) => setAddPeriodForm((f) => ({ ...f, batch_id: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }}>
                <option value="">— Без партии —</option>
                {activeBatches.map((b) => <option key={b.id} value={b.id}>{b.batch_name}</option>)}
              </select>
            </FormField>
            <FormField label="Основная ставка/день"><input type="number" step="0.01" value={addPeriodForm.rate} onChange={(e) => setAddPeriodForm((f) => ({ ...f, rate: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }} /></FormField>
            <TiersEditor tiers={addPeriodForm.tiers} setTiers={(tiers) => setAddPeriodForm((f) => ({ ...f, tiers }))} baseRate={addPeriodForm.rate} />
            <button type="button" onClick={saveAddPeriod} disabled={saving} className="rounded-xl px-4 py-3 text-base font-semibold text-white disabled:opacity-60" style={{ minHeight: 48, background: '#059669' }}>
              {saving ? 'Сохранение…' : 'Сохранить период'}
            </button>
          </div>
        )}
      </BottomSheet>

      <BottomSheet open={rehireOpen} onClose={() => setRehireOpen(false)} title="Принять заново">
        {rehireForm && (
          <div className="flex flex-col gap-3">
            <FormField label="Должность"><input value={rehireForm.position} onChange={(e) => setRehireForm((f) => ({ ...f, position: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }} /></FormField>
            <FormField label="Дата начала работы"><input type="date" value={rehireForm.start_date} onChange={(e) => setRehireForm((f) => ({ ...f, start_date: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }} /></FormField>
            <FormField label="Партия / цех">
              <select value={rehireForm.batch_id} onChange={(e) => setRehireForm((f) => ({ ...f, batch_id: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }}>
                <option value="">— Без партии —</option>
                {activeBatches.map((b) => <option key={b.id} value={b.id}>{b.batch_name}</option>)}
              </select>
            </FormField>
            <p className="text-xs text-tg-hint">Ставка и ступени оплаты подтянутся из последнего периода автоматически.</p>
            <button type="button" onClick={confirmRehire} disabled={saving} className="rounded-xl px-4 py-3 text-base font-semibold text-white disabled:opacity-60" style={{ minHeight: 48, background: '#28a745' }}>
              {saving ? 'Сохранение…' : 'Принять на работу'}
            </button>
          </div>
        )}
      </BottomSheet>

      <BottomSheet open={mergeOpen} onClose={() => setMergeOpen(false)} title="Объединить с другим физлицом">
        <div className="flex flex-col gap-3">
          <p className="text-sm text-tg-hint">Вся история работы дубля переедет в текущую карточку, а дубль будет удалён.</p>
          <NamePicker
            items={persons}
            value={mergeSearchText}
            onChange={(text) => { setMergeSearchText(text); setMergeTarget(null); }}
            onSelectExisting={(p) => { setMergeTarget(p); setMergeSearchText(p.full_name); }}
            excludeId={selectedPerson?.id}
            placeholder="Введите ФИО дубля..."
          />
          {mergeTarget && (
            <p className="text-xs" style={{ color: '#9333ea' }}>✓ Выбран дубль: «{mergeTarget.full_name}» ({mergeTarget.employees?.length || 0} период(ов) будет перенесено)</p>
          )}
          <button type="button" onClick={confirmMerge} disabled={!mergeTarget || saving} className="rounded-xl px-4 py-3 text-base font-semibold text-white disabled:opacity-60" style={{ minHeight: 48, background: '#9333ea' }}>
            {saving ? 'Объединение…' : 'Объединить'}
          </button>
        </div>
      </BottomSheet>

      <ConfirmSheet
        open={confirmDeleteOpen}
        title="Удалить сотрудника?"
        message="Будут удалены все периоды работы и история выплат."
        onConfirm={deletePerson}
        onClose={() => setConfirmDeleteOpen(false)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx eslint src/mobile/pages/salaries/MobileHireFireTab.jsx`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds (not yet wired into a route — consumed by Task 10).

- [ ] **Step 3: Commit**

```bash
git add src/mobile/pages/salaries/MobileHireFireTab.jsx
git commit -m "feat(mobile): add MobileHireFireTab with full HR parity

Fire/rehire/edit-period/add-period/merge-duplicates/delete, including
the salary tiers editor — full parity with the desktop HireFireTab.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: Salaries — MobileSalaryTab

**Files:**
- Create: `src/mobile/pages/salaries/MobileSalaryTab.jsx`

**Interfaces:**
- Consumes: `calculateSalary` from `src/utils/calculateSalary.js` (unchanged); props `{ selectedPerson: Person|null, setSelectedPerson: (p) => void, activeBatches: {id, batch_name}[], persons: Person[] }` — same shape as desktop `SalaryTab`.
- Produces: default export `MobileSalaryTab`, consumed by Task 10's `MobileSalariesPage`. Not routed directly.

- [ ] **Step 1: Create `MobileSalaryTab.jsx`**

```jsx
// src/mobile/pages/salaries/MobileSalaryTab.jsx
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../supabaseClient';
import { calculateSalary } from '../../../utils/calculateSalary';
import Card from '../../components/Card';
import FormField from '../../components/FormField';
import EmptyState from '../../components/EmptyState';

const fieldClass = 'w-full rounded-xl px-3 bg-tg-secondary text-tg-text';
const formatCurrency = (v) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'TJS' }).format(v || 0);

export default function MobileSalaryTab({ selectedPerson, setSelectedPerson, activeBatches, persons }) {
  const [allSalaries, setAllSalaries] = useState([]);
  const [showPastPeriods, setShowPastPeriods] = useState(false);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentType, setPaymentType] = useState('аванс');
  const [saving, setSaving] = useState(false);
  const [editingPaymentId, setEditingPaymentId] = useState(null);
  const [editDate, setEditDate] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editType, setEditType] = useState('аванс');

  async function loadSalaries() {
    if (!selectedPerson) { setAllSalaries([]); return; }
    const employeeIds = (selectedPerson.employees || []).map((e) => e.id);
    if (employeeIds.length === 0) { setAllSalaries([]); return; }
    const { data, error } = await supabase.from('salaries').select('*').in('employee_id', employeeIds).order('payment_date', { ascending: false });
    if (error) { window.alert('Ошибка: ' + error.message); setAllSalaries([]); return; }
    const formatted = (data || []).map((s) => {
      let batchName = null; let batchIsActive = true;
      if (s.batch_id) {
        const batch = activeBatches.find((b) => b.id === s.batch_id);
        if (batch) { batchName = batch.batch_name; batchIsActive = true; }
        else {
          selectedPerson.employees?.forEach((emp) => {
            if (emp.broiler_batches?.id === s.batch_id) { batchName = emp.broiler_batches.batch_name; batchIsActive = emp.broiler_batches.is_active; }
          });
        }
      }
      return { ...s, batch_name: batchName, batch_is_active: batchIsActive };
    });
    setAllSalaries(formatted);
  }

  useEffect(() => { loadSalaries(); }, [selectedPerson]);

  const recentEmployment = selectedPerson?.employees?.[0];
  const currentEmployeeId = recentEmployment?.id;

  const { currentPeriodSalaries, pastPeriodSalaries } = useMemo(() => {
    const current = []; const past = [];
    allSalaries.forEach((s) => (s.employee_id === currentEmployeeId ? current : past).push(s));
    return { currentPeriodSalaries: current, pastPeriodSalaries: past };
  }, [allSalaries, currentEmployeeId]);

  const currentAccruedData = useMemo(() => {
    if (!recentEmployment) return { salary: 0, effectiveDays: 0, breakdown: [] };
    return calculateSalary(recentEmployment, recentEmployment.broiler_batches || {});
  }, [recentEmployment]);

  const currentTotals = useMemo(() => {
    const totals = { totalAdvance: 0, totalSalary: 0, totalAll: 0, byBatch: {} };
    currentPeriodSalaries.forEach((s) => {
      const amount = Number(s.amount) || 0;
      totals.totalAll += amount;
      if (s.payment_type === 'аванс') totals.totalAdvance += amount;
      else if (s.payment_type === 'зарплата') totals.totalSalary += amount;
      if (s.batch_id && s.batch_name) {
        if (!totals.byBatch[s.batch_id]) totals.byBatch[s.batch_id] = { name: s.batch_name, total: 0, isActive: s.batch_is_active };
        totals.byBatch[s.batch_id].total += amount;
      }
    });
    return totals;
  }, [currentPeriodSalaries]);

  const pastTotals = useMemo(() => pastPeriodSalaries.reduce((sum, s) => sum + (Number(s.amount) || 0), 0), [pastPeriodSalaries]);

  const pastPeriodGroups = useMemo(() => {
    if (!selectedPerson?.employees) return [];
    return selectedPerson.employees.slice(1).map((emp) => {
      const empSalaries = pastPeriodSalaries.filter((s) => s.employee_id === emp.id);
      const empTotal = empSalaries.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
      const accrued = calculateSalary(emp, emp.broiler_batches || {});
      return {
        employee: emp, salaries: empSalaries, total: empTotal, accrued,
        periodLabel: `${new Date(emp.start_date).toLocaleDateString('ru-RU')} — ${emp.end_date ? new Date(emp.end_date).toLocaleDateString('ru-RU') : 'По н.в.'}`,
      };
    }).filter((g) => g.salaries.length > 0 || g.accrued.salary > 0);
  }, [selectedPerson, pastPeriodSalaries]);

  async function addPayment() {
    if (!selectedPerson) return;
    if (!(Number(paymentAmount) > 0)) { window.alert('Сумма должна быть больше нуля'); return; }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
      const { error } = await supabase.from('salaries').insert([{
        employee_id: recentEmployment?.id || null, amount: Number(paymentAmount), payment_type: paymentType,
        payment_date: paymentDate, batch_id: recentEmployment?.batch_id || null, user_id: user.id,
      }]);
      if (error) { window.alert('Ошибка: ' + error.message); return; }
      setPaymentAmount('');
      await loadSalaries();
    } finally {
      setSaving(false);
    }
  }

  function startEditPayment(p) {
    setEditingPaymentId(p.id); setEditDate(p.payment_date); setEditAmount(String(p.amount)); setEditType(p.payment_type);
  }

  async function saveEditPayment() {
    setSaving(true);
    try {
      const { error } = await supabase.from('salaries').update({ payment_date: editDate, amount: Number(editAmount), payment_type: editType }).eq('id', editingPaymentId);
      if (error) { window.alert('Ошибка: ' + error.message); return; }
      setEditingPaymentId(null);
      await loadSalaries();
    } finally {
      setSaving(false);
    }
  }

  async function deletePayment(paymentId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
    const { error } = await supabase.from('salaries').delete().eq('id', paymentId);
    if (error) { window.alert('Ошибка: ' + error.message); return; }
    await loadSalaries();
  }

  if (!selectedPerson) {
    return (
      <div className="flex flex-col gap-3">
        <EmptyState icon="👤" title="Сотрудник не выбран" hint="Выберите сотрудника ниже" />
        <select
          className={fieldClass} style={{ minHeight: 48 }}
          onChange={(e) => setSelectedPerson(persons.find((p) => p.id === e.target.value) || null)}
          value=""
        >
          <option value="" disabled>-- Выберите сотрудника --</option>
          {persons && persons.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
        </select>
      </div>
    );
  }

  const isEmployeeFired = !recentEmployment || recentEmployment.is_active === false || !!recentEmployment.end_date;
  const remainingToPay = Math.max(currentAccruedData.salary - currentTotals.totalAll, 0);

  function PaymentRow({ p, allowEdit }) {
    const isEditing = editingPaymentId === p.id;
    return (
      <div className="flex items-center justify-between gap-2 py-2" style={{ borderBottom: '1px solid var(--tg-secondary-bg)' }}>
        {isEditing ? (
          <div className="flex flex-col gap-2 flex-1">
            <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className={fieldClass} style={{ minHeight: 40 }} />
            <div className="flex gap-2">
              <input type="number" step="0.01" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} className={fieldClass} style={{ minHeight: 40, flex: 1 }} />
              <select value={editType} onChange={(e) => setEditType(e.target.value)} className={fieldClass} style={{ minHeight: 40, flex: 1 }}>
                <option value="аванс">аванс</option>
                <option value="зарплата">зарплата</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={saveEditPayment} disabled={saving} className="flex-1 rounded-lg px-3 py-2 text-xs font-semibold text-white" style={{ minHeight: 36, background: '#28a745' }}>Сохранить</button>
              <button type="button" onClick={() => setEditingPaymentId(null)} className="flex-1 rounded-lg px-3 py-2 text-xs bg-tg-secondary" style={{ minHeight: 36 }}>Отмена</button>
            </div>
          </div>
        ) : (
          <>
            <div className="min-w-0">
              <p className="text-sm">{new Date(p.payment_date).toLocaleDateString('ru-RU')} · <span className="capitalize">{p.payment_type}</span></p>
              <p className="text-xs text-tg-hint">{p.batch_name || 'Без партии'}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-sm font-semibold">{formatCurrency(p.amount)}</span>
              {allowEdit && (
                <>
                  <button type="button" onClick={() => startEditPayment(p)} className="text-xs px-2 py-2" style={{ color: 'var(--tg-link, #4f46e5)' }}>✏️</button>
                  <button type="button" onClick={() => deletePayment(p.id)} className="text-xs px-2 py-2 text-tg-destructive">🗑</button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <FormField label="Сотрудник">
        <select
          value={selectedPerson.id}
          onChange={(e) => setSelectedPerson(persons.find((p) => p.id === e.target.value) || null)}
          className={fieldClass} style={{ minHeight: 48 }}
        >
          {persons && persons.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
        </select>
      </FormField>

      <Card>
        <p className="text-lg font-bold">{selectedPerson.full_name}</p>
        {isEmployeeFired ? (
          <p className="text-sm font-medium mt-1" style={{ color: '#dc3545' }}>🔴 Уволен</p>
        ) : (
          <p className="text-sm font-medium mt-1" style={{ color: '#28a745' }}>🟢 Работает</p>
        )}
      </Card>

      <Card style={{ background: 'color-mix(in srgb, var(--tg-link, #4f46e5) 8%, var(--tg-section))' }}>
        <p className="text-sm font-bold" style={{ color: 'var(--tg-link, #4f46e5)' }}>Начисление за текущий период</p>
        {recentEmployment && (
          <p className="text-xs text-tg-hint mt-1">
            {new Date(recentEmployment.start_date).toLocaleDateString('ru-RU')} — {recentEmployment.end_date ? new Date(recentEmployment.end_date).toLocaleDateString('ru-RU') : 'По настоящее время'}
            {recentEmployment.broiler_batches && ` · ${recentEmployment.broiler_batches.batch_name}`}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2 mt-3">
          <div><p className="text-xs text-tg-hint">Отработано дней</p><p className="font-bold">{currentAccruedData.effectiveDays} дн.</p></div>
          <div><p className="text-xs text-tg-hint">Начислено</p><p className="font-bold" style={{ color: 'var(--tg-link, #4f46e5)' }}>{formatCurrency(currentAccruedData.salary)}</p></div>
          <div><p className="text-xs text-tg-hint">Выплачено</p><p className="font-bold" style={{ color: '#28a745' }}>{formatCurrency(currentTotals.totalAll)}</p></div>
          <div><p className="text-xs text-tg-hint">Остаток</p><p className="font-bold" style={{ color: remainingToPay > 0 ? '#dc3545' : 'var(--tg-text)' }}>{formatCurrency(remainingToPay)}</p></div>
        </div>
        {currentAccruedData.breakdown && currentAccruedData.breakdown.length > 0 && (
          <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--tg-secondary-bg)' }}>
            <p className="text-xs font-semibold text-tg-hint mb-1">Детализация расчёта:</p>
            {currentAccruedData.breakdown.map((item, idx) => (
              <p key={idx} className="text-xs text-tg-hint">• {item.label} = <strong>{formatCurrency(item.sum)}</strong></p>
            ))}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-2">
        <Card><p className="text-xs text-tg-hint">Авансы</p><p className="font-bold">{formatCurrency(currentTotals.totalAdvance)}</p></Card>
        <Card><p className="text-xs text-tg-hint">Зарплаты</p><p className="font-bold">{formatCurrency(currentTotals.totalSalary)}</p></Card>
        {Object.entries(currentTotals.byBatch).map(([batchId, info]) => (
          <Card key={batchId}><p className="text-xs text-tg-hint">{info.name}{info.isActive ? '' : ' (архив)'}</p><p className="font-bold">{formatCurrency(info.total)}</p></Card>
        ))}
      </div>

      <Card>
        <p className="text-sm font-semibold mb-2">Выплатить</p>
        <div className="flex flex-col gap-2">
          <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className={fieldClass} style={{ minHeight: 44 }} />
          <input type="number" step="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} placeholder="0.00" className={fieldClass} style={{ minHeight: 44 }} />
          <select value={paymentType} onChange={(e) => setPaymentType(e.target.value)} className={fieldClass} style={{ minHeight: 44 }}>
            <option value="аванс">Аванс</option>
            <option value="зарплата">Зарплата (остаток)</option>
          </select>
          <button type="button" onClick={addPayment} disabled={saving} className="rounded-xl px-4 py-3 text-base font-semibold bg-tg-button text-tg-button-text disabled:opacity-60" style={{ minHeight: 48 }}>
            {saving ? 'Добавление…' : '+ Выплатить'}
          </button>
        </div>
      </Card>

      <Card>
        <p className="text-sm font-semibold mb-2">Выплаты текущего периода</p>
        {currentPeriodSalaries.length === 0 ? <p className="text-sm text-tg-hint">Нет выплат</p> : currentPeriodSalaries.map((p) => <PaymentRow key={p.id} p={p} allowEdit />)}
      </Card>

      {pastPeriodGroups.length > 0 && (
        <Card onClick={() => setShowPastPeriods((v) => !v)}>
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">📂 Выплаты прошлых периодов ({pastPeriodSalaries.length} · {formatCurrency(pastTotals)})</p>
            <span className="text-tg-hint">{showPastPeriods ? '▲' : '▼'}</span>
          </div>
          {showPastPeriods && (
            <div className="mt-3 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
              {pastPeriodGroups.map((group) => (
                <div key={group.employee.id} className="rounded-xl bg-tg-secondary p-3">
                  <p className="text-xs font-semibold">{group.periodLabel}</p>
                  <p className="text-xs text-tg-hint">{group.employee.position || 'Должность не указана'}{group.employee.broiler_batches ? ` · ${group.employee.broiler_batches.batch_name}` : ''}</p>
                  <p className="text-xs text-tg-hint mt-1">Начислено: <strong style={{ color: 'var(--tg-link, #4f46e5)' }}>{formatCurrency(group.accrued.salary)}</strong> · Выплачено: <strong style={{ color: '#28a745' }}>{formatCurrency(group.total)}</strong></p>
                  <div className="mt-2">
                    {group.salaries.length === 0 ? <p className="text-xs text-tg-hint">Нет выплат</p> : group.salaries.map((p) => <PaymentRow key={p.id} p={p} allowEdit />)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx eslint src/mobile/pages/salaries/MobileSalaryTab.jsx`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds (not yet wired into a route — consumed by Task 10).

- [ ] **Step 3: Commit**

```bash
git add src/mobile/pages/salaries/MobileSalaryTab.jsx
git commit -m "feat(mobile): add MobileSalaryTab (accrual + payments)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 10: Salaries wrapper — MobileSalariesPage and `/salaries` route

**Files:**
- Create: `src/mobile/pages/MobileSalariesPage.jsx`
- Modify: `src/mobile/TelegramApp.jsx` (`/salaries` route)

**Interfaces:**
- Consumes: `MobileCreateEmployeeTab` (Task 7), `MobileHireFireTab` (Task 8), `MobileSalaryTab` (Task 9); `Tabs` from `../components/Tabs`; table `persons` joined with `employees(*, broiler_batches(id, batch_name, is_active, batch_end))`; table `broiler_batches`.
- Produces: default export `MobileSalariesPage`, mounted at `/salaries` — the final integration point for all three salary sub-tabs, matching desktop `src/pages/SalariesPage.jsx`.

- [ ] **Step 1: Create `MobileSalariesPage.jsx`**

```jsx
// src/mobile/pages/MobileSalariesPage.jsx
import { useEffect, useState } from 'react';
import { supabase } from '../../supabaseClient';
import Tabs from '../components/Tabs';
import Spinner from '../components/Spinner';
import MobileCreateEmployeeTab from './salaries/MobileCreateEmployeeTab';
import MobileHireFireTab from './salaries/MobileHireFireTab';
import MobileSalaryTab from './salaries/MobileSalaryTab';

export default function MobileSalariesPage() {
  const [persons, setPersons] = useState([]);
  const [activeBatches, setActiveBatches] = useState([]);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('create');

  async function fetchPersons() {
    const { data, error } = await supabase
      .from('persons')
      .select('*, employees (*, broiler_batches (id, batch_name, is_active, batch_end))')
      .order('full_name');
    if (error) { window.alert('Ошибка: ' + error.message); return; }
    const formatted = (data || []).map((person) => {
      person.employees = (person.employees || []).sort((a, b) => new Date(b.start_date) - new Date(a.start_date));
      return person;
    });
    setPersons(formatted);
  }

  async function fetchActiveBatches() {
    const { data, error } = await supabase.from('broiler_batches').select('id, batch_name, start_date, is_active').order('start_date', { ascending: false });
    if (error) { window.alert('Ошибка: ' + error.message); return; }
    setActiveBatches(data || []);
  }

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchPersons(), fetchActiveBatches()]).then(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  return (
    <div className="flex flex-col gap-3 py-3">
      <Tabs
        tabs={[
          { key: 'create', label: 'Создание' },
          { key: 'hire', label: 'Приём/увольнение' },
          { key: 'salary', label: 'Зарплата' },
        ]}
        active={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === 'create' && <MobileCreateEmployeeTab activeBatches={activeBatches} fetchPersons={fetchPersons} persons={persons} />}
      {activeTab === 'hire' && <MobileHireFireTab persons={persons} activeBatches={activeBatches} fetchPersons={fetchPersons} />}
      {activeTab === 'salary' && <MobileSalaryTab selectedPerson={selectedPerson} setSelectedPerson={setSelectedPerson} activeBatches={activeBatches} persons={persons} />}
    </div>
  );
}
```

- [ ] **Step 2: Wire the `/salaries` route**

In `src/mobile/TelegramApp.jsx`, add:

```js
import MobileSalariesPage from './pages/MobileSalariesPage';
```

Replace:

```js
        <Route path="/salaries" element={<MobileStub title="Сотрудники и ЗП" />} />
```

with:

```js
        <Route path="/salaries" element={<MobileSalariesPage />} />
```

- [ ] **Step 3: Verify**

Run: `npx eslint src`
Expected: no new errors anywhere in `src/mobile/`.

Run: `npm run build`
Expected: build succeeds.

In the Browser pane at `?tg_debug=1&tg_linked=1`, navigate to `/salaries`:
- On "Создание", type a brand-new name, tap "➕ Создать", fill position+start date, submit; confirm the success card appears.
- Switch to "Приём/увольнение"; confirm the new person appears in the list. Tap to expand; confirm the action buttons render. Test "✏️ Редактировать" (change position, add a tier, save) and confirm it persists. Test "📤 Уволить" then "🔄 Принять заново" on the same person; confirm status flips correctly both times.
- Create a second person via "Создание", then in "Приём/увольнение" select the first person, tap "🔗 Объединить", search for and pick the second person, confirm the merge dialog and confirm; verify the second person's card disappears from the list and its period (if any) now shows under the first person's history.
- Switch to "Зарплата"; select the remaining person; confirm accrual figures render (`0 TJS`/`0 дн.` is an acceptable baseline with no `daily_logs` data), add a payment, confirm it appears in "Выплаты текущего периода" and totals update.
- Confirm no console errors throughout (`read_console_messages`).

- [ ] **Step 4: Commit**

```bash
git add src/mobile/pages/MobileSalariesPage.jsx src/mobile/TelegramApp.jsx
git commit -m "feat(mobile): wire salaries tabs at /salaries, completing B2

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Post-plan note

After Task 10, all six B2 routes (`/expenses`, `/sales`, `/salaries`, `/debts`, `/feed`, `/coal`) serve real screens and no `<MobileStub>` remains for any B2 domain. Remaining roadmap after B2 ships: **B3** (medicines, notes) and **C** (3 admin screens) — separate subprojects, out of scope here.
