# Telegram Mini App — B1 (Daily Cycle) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `<MobileStub>` on `/batch/:batchId`, `/batch/:batchId/report`, `/workshops`, and `/tasks` with full mobile screens matching desktop parity, on Foundation's established primitives.

**Architecture:** Four new top-level mobile pages plus a nested `/workshops/:workshopId` route, built entirely from Foundation's shared components (`Card`, `ListRow`, `BottomSheet`, `StatusPill`, `EmptyState`, `Spinner`, `FormField`, `NumberStepper`) and four new small shared components (`ConfirmSheet`, `NormBadge`, `Tabs`, `WeightChart`). All domain logic (`normComparison.js`, `broilerStandards.js`, `useTasks.js`, `useBatchData.js`, `summaryBatchSync.js`) is reused unchanged from the desktop app.

**Tech Stack:** Same as Foundation — Vite (rolldown-vite) + React 19, react-router-dom 7, Tailwind CSS v4, Supabase JS v2, `recharts` (already a dependency, used by desktop `DashboardNormFact.jsx`).

**Spec:** `docs/superpowers/specs/2026-09-11-telegram-mini-app-b1-daily-cycle-design.md`

## Global Constraints

- **UI language:** Russian. All user-facing strings in Russian.
- **Do not modify:** `src/pages/**`, `src/hooks/**`, `src/utils/**`, `src/constants/**`, `src/layouts/{MainLayout,AdminLayout}.jsx`, `src/components/**` (the desktop, non-mobile components), `vercel.json`. The desktop path must stay functionally unchanged.
- **Domain invariant (this project's central rule):** any code that writes `daily_logs` — insert, update, OR delete — MUST call `syncSummaryBatchLog(logDate, userId)` afterward, UNLESS the batch being written is itself the summary batch (`batch.is_summary === true`), exactly mirroring the guard the desktop `BatchLogPage`/`DailyEntryPage` already use (`if (!batch?.is_summary) await syncSummaryBatchLog(...)`). This plan's Task 8 explicitly extends this to edit and delete, which the desktop `JournalTable` does not do — that is an intentional, documented improvement, not a bug to avoid reintroducing.
- **`mortality` must always equal `mortality_natural + mortality_halal`** on every write path (insert, edit).
- **No new npm packages.** `recharts` is already a dependency (`src/components/DashboardNormFact.jsx`).
- **Lint must stay at exactly the current baseline: `20 problems (8 errors, 12 warnings)`** (`npx eslint src`) — all pre-existing in `src/pages/**`/`src/hooks/**`, none in the files this plan touches. `npm run build` must pass after every task.
- **Supabase client is a singleton** from `src/supabaseClient.js` (`import { supabase }`). Never call `createClient` in new code.
- **Tailwind v4, config-free.** Use the existing `tg-*` utility classes (`bg-tg-bg`, `text-tg-text`, `text-tg-hint`, `bg-tg-section`, `bg-tg-secondary`, `text-tg-link`, `bg-tg-button`, `text-tg-button-text`, `text-tg-destructive`) — do not invent new `@theme` tokens. For text sitting ON a button, use `text-tg-button-text`, not `text-tg-button` (that's the button's own background color).
- **No JS test runner in this repo.** Verification per task = `npx eslint src`, `npm run build`, and a `?tg_debug=1` Browser-pane check (`&tg_linked=1` to skip the linking screen). Where real Supabase data is required (viewing/writing rows) and no test credentials are available in the environment, verify the non-data states (loading/empty/error) and state the gap plainly — do not skip verification silently.
- **Dev server:** `npm run dev` on port 5173 (`.claude/launch.json` name `broiler-dev`). Clear `localStorage` for `localhost:5173` before a browser check if a stale `sb-…-auth-token` short-circuits straight past the state you're trying to see.
- **Commit after every task.** Conventional Commit messages, present tense.

---

## File Structure

**New:**
| File | Responsibility |
|---|---|
| `src/mobile/components/ConfirmSheet.jsx` | `BottomSheet`-based confirm/cancel dialog — replaces `window.confirm` |
| `src/mobile/components/NormBadge.jsx` | Compact norm/deviation badge for a form field — mobile analog of desktop `NormIndicator` |
| `src/mobile/components/Tabs.jsx` | Horizontal scrollable tab chips with counts |
| `src/mobile/components/WeightChart.jsx` | `recharts` `LineChart` wrapper (fact/norm/forecast) — mobile-sized port of `DashboardNormFact`'s chart |
| `src/mobile/pages/MobileBatchReportPage.jsx` | `/batch/:batchId/report` — read-only financial report |
| `src/mobile/pages/MobileWorkshopsPage.jsx` | `/workshops` — workshop list, create/edit/delete, compact all-workshops summary |
| `src/mobile/pages/workshops/MobileWorkshopDetailPage.jsx` | `/workshops/:workshopId` — one workshop's daily log as cards |
| `src/mobile/pages/MobileTasksPage.jsx` | `/tasks` — task list, filters, create/edit/delete, status cycling |
| `src/mobile/pages/MobileBatchLogPage.jsx` | `/batch/:batchId` — header, norm/fact dashboard, weight chart, historical mortality comparison, tab switcher, financial read-only tabs, journal tab (read-only in Task 7, full CRUD after Task 8) |
| `src/mobile/pages/batchLog/MobileJournalTab.jsx` | The journal tab's add/edit/delete form and cards — split out of `MobileBatchLogPage.jsx` so Task 8's write-path and domain-invariant logic has its own file and its own reviewable diff |

**Modified:**
| File | Change |
|---|---|
| `src/mobile/components/Card.jsx` | Add an optional `style` prop, passed through to the root `div` (backward compatible — default `undefined`, existing callers unaffected) |
| `src/mobile/TelegramApp.jsx` | 4 stub routes become real pages (Tasks 3, 4, 6, 7); 1 new route added (Task 5) |

**Not touched:** everything under `src/pages/**`, `src/hooks/**`, `src/utils/**`, `src/constants/**`, `src/components/**`, `src/layouts/**`, plus all of Foundation's `src/mobile/telegram/**`, `src/mobile/layouts/**`, `src/mobile/screens/**`, and the existing `src/mobile/pages/{MobileBatchesPage,MobileDailyEntryPage}.jsx`.

---

## Task 1: Shared components — `ConfirmSheet`, `NormBadge`, `Tabs`, `Card` style passthrough

**Files:**
- Create: `src/mobile/components/ConfirmSheet.jsx`
- Create: `src/mobile/components/NormBadge.jsx`
- Create: `src/mobile/components/Tabs.jsx`
- Modify: `src/mobile/components/Card.jsx`

**Interfaces:**
- Produces:
  - `ConfirmSheet({ open, title, message, confirmLabel = 'Удалить', danger = true, onConfirm, onClose })` — default export. Renders a `BottomSheet` with `message` (optional) and two buttons: a confirm button (destructive red by default, or `var(--tg-button)` when `danger=false`) that calls `onConfirm()` then `onClose()`, and a cancel button that calls `onClose()`.
  - `NormBadge({ result })` — default export. `result` is the object returned by `compareWithNorm()` from `src/utils/normComparison.js` (shape: `{status: 'ok'|'warning'|'critical', normLabel, deviation, percent}`, or `null`/`undefined`). Renders nothing if `result` is falsy or `result.status` isn't one of the three known statuses.
  - `Tabs({ tabs, active, onChange })` — default export. `tabs` is `{key, label, count?}[]`. Renders one pill button per tab; the active one is filled with `var(--tg-button)`/`text-tg-button-text`, others use `bg-tg-secondary`/`text-tg-text`. Calls `onChange(key)` on tap.
  - `Card({ children, className, onClick, style })` — `style` is new, optional, forwarded to the root `div`'s `style` attribute alongside the existing Tailwind classes.
- Consumes: `BottomSheet` (`src/mobile/components/BottomSheet.jsx`, already exists).

- [ ] **Step 1: Write `ConfirmSheet.jsx`**

```jsx
// src/mobile/components/ConfirmSheet.jsx
import BottomSheet from './BottomSheet';

export default function ConfirmSheet({
  open, title, message, confirmLabel = 'Удалить', danger = true, onConfirm, onClose,
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      {message && <p className="text-sm text-tg-hint mb-4">{message}</p>}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => { onConfirm(); onClose(); }}
          className="w-full rounded-xl px-4 py-3 text-base font-semibold text-white"
          style={{ minHeight: 48, background: danger ? 'var(--tg-destructive, #df3f40)' : 'var(--tg-button)' }}
        >
          {confirmLabel}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-xl px-4 py-3 text-base bg-tg-secondary text-tg-text"
          style={{ minHeight: 48 }}
        >
          Отмена
        </button>
      </div>
    </BottomSheet>
  );
}
```

- [ ] **Step 2: Write `NormBadge.jsx`**

```jsx
// src/mobile/components/NormBadge.jsx
const STATUS_STYLE = {
  ok: { color: '#28a745', icon: '✅' },
  warning: { color: '#fd7e14', icon: '⚠️' },
  critical: { color: 'var(--tg-destructive, #df3f40)', icon: '🔴' },
};

export default function NormBadge({ result }) {
  if (!result) return null;
  const s = STATUS_STYLE[result.status];
  if (!s) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ml-2 align-middle"
      style={{ color: s.color, background: `color-mix(in srgb, ${s.color} 15%, transparent)` }}
    >
      {s.icon} Норма: {result.normLabel}
      {result.deviation != null && (
        <>
          {' '}· {result.deviation > 0 ? '+' : ''}
          {result.deviation} ({result.percent}%)
        </>
      )}
    </span>
  );
}
```

- [ ] **Step 3: Write `Tabs.jsx`**

```jsx
// src/mobile/components/Tabs.jsx
export default function Tabs({ tabs, active, onChange }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
      {tabs.map((t) => {
        const isActive = active === t.key;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className="flex-shrink-0 rounded-full px-3 py-1.5 text-sm font-medium flex items-center gap-1.5"
            style={{
              minHeight: 36,
              background: isActive ? 'var(--tg-button)' : 'var(--tg-secondary-bg)',
              color: isActive ? 'var(--tg-button-text)' : 'var(--tg-text)',
            }}
          >
            {t.label}
            {t.count != null && (
              <span
                className="rounded-full px-1.5 text-xs"
                style={{
                  background: isActive ? 'rgba(255,255,255,0.25)' : 'var(--tg-bg)',
                  color: isActive ? 'var(--tg-button-text)' : 'var(--tg-hint)',
                }}
              >
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Add `style` passthrough to `Card.jsx`**

Read the current file first. It is:

```jsx
// src/mobile/components/Card.jsx
export default function Card({ children, className = '', onClick }) {
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl bg-tg-section p-4 ${onClick ? 'active:opacity-70' : ''} ${className}`}
    >
      {children}
    </div>
  );
}
```

Change the signature and the `div` to also accept and forward `style`:

```jsx
// src/mobile/components/Card.jsx
export default function Card({ children, className = '', onClick, style }) {
  return (
    <div
      onClick={onClick}
      style={style}
      className={`rounded-2xl bg-tg-section p-4 ${onClick ? 'active:opacity-70' : ''} ${className}`}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 5: Verify**

Run: `npx eslint src` → expect `20 problems (8 errors, 12 warnings)`, unchanged, none in the 4 touched files.
Run: `npm run build` → expect success.

These four components have no page consuming them yet — there is nothing to browser-check in isolation. Confirm via a quick temporary import: in `src/mobile/pages/MobileBatchesPage.jsx`, temporarily add `import ConfirmSheet from '../components/ConfirmSheet';` and render `<ConfirmSheet open title="Тест" message="Проверка" onConfirm={() => {}} onClose={() => {}} />` at the top of the returned JSX, `npm run dev`, open `http://localhost:5173/?tg_debug=1&tg_linked=1`, confirm the sheet renders with title/message/two buttons via `read_page`, then **revert the temporary import and JSX** before committing. Do the same smoke check for `Tabs` (render `<Tabs tabs={[{key:'a',label:'А',count:1},{key:'b',label:'Б'}]} active="a" onChange={()=>{}} />`) and `NormBadge` (render `<NormBadge result={{status:'warning', normLabel:'123 г', deviation:5, percent:10}} />`). `git diff --stat` before committing must show only the 4 files in this task.

- [ ] **Step 6: Commit**

```bash
git add src/mobile/components/ConfirmSheet.jsx src/mobile/components/NormBadge.jsx src/mobile/components/Tabs.jsx src/mobile/components/Card.jsx
git commit -m "feat(mobile): add ConfirmSheet, NormBadge, Tabs and Card style prop"
```

---

## Task 2: `WeightChart` (recharts wrapper)

**Files:**
- Create: `src/mobile/components/WeightChart.jsx`

**Interfaces:**
- Consumes: `recharts` (`LineChart`, `Line`, `XAxis`, `YAxis`, `CartesianGrid`, `Tooltip`, `ResponsiveContainer`) — already a project dependency.
- Produces: `WeightChart({ data })` — default export. `data` is the array shape returned by `buildWeightSeries()` from `src/utils/normComparison.js` (each item has `day`, and optionally `actual`, `forecast`, `standard` numeric fields). Renders nothing (`null`) if `data` is empty/falsy. Otherwise a 220px-tall responsive line chart with three series (norm dashed grey, actual solid green with dots, forecast dashed green) and a small legend row underneath (recharts' built-in `<Legend>` is dropped in favor of a simpler two-item legend to save vertical space on a phone).

- [ ] **Step 1: Write `WeightChart.jsx`**

```jsx
// src/mobile/components/WeightChart.jsx
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const ACTUAL_COLOR = '#28a745';
const NORM_COLOR = '#9ca3af';

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const rows = [
    { key: 'actual', name: 'Факт', color: ACTUAL_COLOR },
    { key: 'forecast', name: 'Прогноз', color: ACTUAL_COLOR },
    { key: 'standard', name: 'Норма', color: NORM_COLOR },
  ];
  return (
    <div
      className="rounded-lg px-3 py-2 text-xs"
      style={{ background: 'var(--tg-section-bg)', border: '1px solid var(--tg-secondary-bg)' }}
    >
      <p className="font-semibold mb-1">День {label}</p>
      {rows.map((r) => {
        const entry = payload.find((p) => p.dataKey === r.key);
        if (!entry || entry.value == null) return null;
        return (
          <p key={r.key} className="flex items-center gap-1.5">
            <span style={{ display: 'inline-block', width: 8, height: 2, background: r.color }} />
            {r.name}: <strong>{entry.value} г</strong>
          </p>
        );
      })}
    </div>
  );
}

export default function WeightChart({ data }) {
  if (!data?.length) return null;
  return (
    <div>
      <div style={{ width: '100%', height: 220 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--tg-secondary-bg)" vertical={false} />
            <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'var(--tg-hint)' }} />
            <YAxis tick={{ fontSize: 10, fill: 'var(--tg-hint)' }} width={36} />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: NORM_COLOR, strokeWidth: 1 }} />
            <Line
              type="monotone" dataKey="standard" stroke={NORM_COLOR} strokeWidth={2}
              strokeDasharray="4 4" dot={false} isAnimationActive={false}
            />
            <Line
              type="monotone" dataKey="actual" stroke={ACTUAL_COLOR} strokeWidth={2}
              dot={{ r: 3, fill: ACTUAL_COLOR, stroke: 'var(--tg-bg)', strokeWidth: 2 }}
              connectNulls isAnimationActive={false}
            />
            <Line
              type="monotone" dataKey="forecast" stroke={ACTUAL_COLOR} strokeWidth={2}
              strokeDasharray="4 4" dot={false} connectNulls isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="flex gap-4 justify-center mt-1 text-xs text-tg-hint">
        <span className="flex items-center gap-1">
          <span style={{ width: 8, height: 2, background: ACTUAL_COLOR, display: 'inline-block' }} /> Факт/Прогноз
        </span>
        <span className="flex items-center gap-1">
          <span style={{ width: 8, height: 2, background: NORM_COLOR, display: 'inline-block' }} /> Норма
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx eslint src` → `20/8/12` unchanged.
Run: `npm run build` → passes (confirms `recharts` import resolves with no new bundle errors).

Smoke check: temporarily import `WeightChart` and `buildWeightSeries` into `MobileBatchesPage.jsx`, render `<WeightChart data={buildWeightSeries([{age:1,weight:45},{age:5,weight:120},{age:10,weight:280}], 42)} />` above the batch list, `npm run dev`, `http://localhost:5173/?tg_debug=1&tg_linked=1`, screenshot to confirm a line chart renders (not a blank box — `recharts` sometimes needs a sized parent; the `height:220` wrapper div provides that). Revert the temporary import/JSX before committing.

- [ ] **Step 3: Commit**

```bash
git add src/mobile/components/WeightChart.jsx
git commit -m "feat(mobile): add WeightChart recharts wrapper"
```

---

## Task 3: `MobileBatchReportPage`

**Files:**
- Create: `src/mobile/pages/MobileBatchReportPage.jsx`
- Modify: `src/mobile/TelegramApp.jsx` (route `/batch/:batchId/report`)

**Interfaces:**
- Consumes: `supabase` from `src/supabaseClient.js`; RPCs `get_active_summary_report()` (no args, returns one row: `total_sales, total_feed_cost, total_medicine_cost, total_coal_cost, total_expenses, total_salaries, total_cost, profit` — all `numeric`) and `generate_batch_report({p_batch_id})` (returns one row of the `batch_report` type: `batch_name, start_date, end_date, total_sales, total_expenses, total_salaries, profit`); `Card`, `ListRow`, `EmptyState`, `Spinner` (Foundation).
- Produces: `MobileBatchReportPage` default export, mounted at `/batch/:batchId/report` via `useParams()`.

- [ ] **Step 1: Write `MobileBatchReportPage.jsx`**

```jsx
// src/mobile/pages/MobileBatchReportPage.jsx
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import Card from '../components/Card';
import ListRow from '../components/ListRow';
import EmptyState from '../components/EmptyState';
import Spinner from '../components/Spinner';

function formatCurrency(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '0 TJS';
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'TJS' }).format(value);
}

export default function MobileBatchReportPage() {
  const { batchId } = useParams();
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      setReport(null);
      setError('');
      const { data: batchRow, error: batchError } = await supabase
        .from('broiler_batches')
        .select('is_summary, batch_name')
        .eq('id', batchId)
        .single();
      if (batchError) { setError('Не удалось загрузить партию.'); return; }

      if (batchRow.is_summary) {
        const { data, error: rpcError } = await supabase.rpc('get_active_summary_report');
        if (rpcError) setError('Не удалось сгенерировать сводный отчёт.');
        else setReport({ ...data[0], batch_name: batchRow.batch_name, is_summary: true });
      } else {
        const { data, error: rpcError } = await supabase.rpc('generate_batch_report', { p_batch_id: batchId });
        if (rpcError) setError('Не удалось сгенерировать отчёт. Убедитесь, что партия существует.');
        else setReport(data);
      }
    })();
  }, [batchId]);

  if (error) return <EmptyState icon="⚠️" title="Ошибка" hint={error} />;
  if (!report) return <div className="flex justify-center py-20"><Spinner /></div>;

  return (
    <div className="flex flex-col gap-3 py-3">
      <Card>
        <p className="text-lg font-semibold">{report.batch_name}</p>
        <p className="text-sm text-tg-hint">
          {report.is_summary
            ? 'Сводка по всем активным партиям'
            : `${new Date(report.start_date).toLocaleDateString('ru-RU')} – ${new Date(report.end_date).toLocaleDateString('ru-RU')}`}
        </p>
      </Card>

      <Card>
        <p className="text-xs uppercase text-tg-hint mb-1">Доходы</p>
        <ListRow
          label={report.is_summary ? 'Продажи' : 'Продажи (привязанные)'}
          value={formatCurrency(report.total_sales)}
        />
      </Card>

      <Card>
        <p className="text-xs uppercase text-tg-hint mb-1">Расходы</p>
        {report.is_summary && (
          <>
            <ListRow label="Корм" value={formatCurrency(report.total_feed_cost)} />
            <ListRow label="Лекарства" value={formatCurrency(report.total_medicine_cost)} />
            <ListRow label="Уголь" value={formatCurrency(report.total_coal_cost)} />
          </>
        )}
        <ListRow
          label={report.is_summary ? 'Расходы' : 'Расходы (привязанные)'}
          value={formatCurrency(report.total_expenses)}
        />
        <ListRow
          label={report.is_summary ? 'Зарплаты' : 'Зарплаты (привязанные)'}
          value={formatCurrency(report.total_salaries)}
        />
      </Card>

      <Card>
        {report.is_summary && (
          <ListRow label="Итого затрат" value={formatCurrency(report.total_cost)} />
        )}
        <div className="flex items-center justify-between pt-2">
          <span className="text-base font-semibold">Итоговая прибыль</span>
          <span
            className="text-lg font-bold"
            style={{ color: report.profit >= 0 ? '#28a745' : 'var(--tg-destructive, #df3f40)' }}
          >
            {formatCurrency(report.profit)}
          </span>
        </div>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Wire the route**

In `src/mobile/TelegramApp.jsx`, add the import near the other page imports and replace the stub route:

```jsx
import MobileBatchReportPage from './pages/MobileBatchReportPage';
```
```jsx
<Route path="/batch/:batchId/report" element={<MobileBatchReportPage />} />
```
(replacing the existing `<Route path="/batch/:batchId/report" element={<MobileStub title="Отчёт партии" />} />` line — leave every other route as-is).

- [ ] **Step 3: Verify**

Run: `npx eslint src` → `20/8/12` unchanged.
Run: `npm run build` → passes.
Run: `npm run dev` + Browser pane. Clear `localStorage` for `localhost:5173`, open `http://localhost:5173/?tg_debug=1&tg_linked=1`, navigate to `/batch/00000000-0000-0000-0000-000000000000/report` directly via the address bar (a nonexistent id) — expect the `EmptyState` error path ("Ошибка" / "Не удалось загрузить партию."). If real Supabase credentials are available (via `LinkingScreen` with a real login), navigate to a real batch id from the Batches list and confirm real numbers render in the three cards, formatted as `… TJS`. If no credentials are available, state that the happy path was not exercised against real data and rely on the error-path check plus code review against `src/pages/BatchReportPage.jsx`.

- [ ] **Step 4: Commit**

```bash
git add src/mobile/pages/MobileBatchReportPage.jsx src/mobile/TelegramApp.jsx
git commit -m "feat(mobile): add batch report screen"
```

---

## Task 4: `MobileWorkshopsPage`

**Files:**
- Create: `src/mobile/pages/MobileWorkshopsPage.jsx`
- Modify: `src/mobile/TelegramApp.jsx` (route `/workshops`)

**Interfaces:**
- Consumes: `useWorkshops()` from `src/hooks/useBatchData.js` (`{workshops, loading, createWorkshop, updateWorkshop, deleteWorkshop}` — `createWorkshop`/`updateWorkshop` take `{name, capacity, description}` and return `{error}`; `deleteWorkshop(id)` deactivates and returns `{error}`); `supabase`; `getNormForDay` from `src/constants/broilerStandards.js`; `Card`, `ListRow`, `BottomSheet`, `FormField`, `NumberStepper`, `EmptyState`, `Spinner` (Foundation); `ConfirmSheet` (Task 1).
- Produces: `MobileWorkshopsPage` default export, mounted at `/workshops`. Tapping a workshop card (not its edit/delete buttons) navigates to `/workshops/${id}` (Task 5's route).

- [ ] **Step 1: Write `MobileWorkshopsPage.jsx`**

```jsx
// src/mobile/pages/MobileWorkshopsPage.jsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkshops } from '../../hooks/useBatchData';
import { supabase } from '../../supabaseClient';
import { getNormForDay } from '../../constants/broilerStandards';
import Card from '../components/Card';
import ListRow from '../components/ListRow';
import BottomSheet from '../components/BottomSheet';
import ConfirmSheet from '../components/ConfirmSheet';
import FormField from '../components/FormField';
import NumberStepper from '../components/NumberStepper';
import EmptyState from '../components/EmptyState';
import Spinner from '../components/Spinner';

export default function MobileWorkshopsPage() {
  const { workshops, loading, createWorkshop, updateWorkshop, deleteWorkshop } = useWorkshops();
  const navigate = useNavigate();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState('');
  const [capacity, setCapacity] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [summary, setSummary] = useState({});

  useEffect(() => {
    (async () => {
      const data = {};
      for (const w of workshops) {
        const active = w.batches?.find((b) => b.is_active);
        if (!active) continue;
        const { data: lastLog } = await supabase
          .from('daily_logs')
          .select('age, mortality, weight, daily_feed')
          .eq('batch_id', active.id)
          .order('age', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (lastLog) data[w.id] = { ...lastLog, norm: getNormForDay(lastLog.age) };
      }
      setSummary(data);
    })();
  }, [workshops]);

  function openCreate() {
    setEditing(null); setName(''); setCapacity(''); setDescription(''); setFormOpen(true);
  }
  function openEdit(w) {
    setEditing(w); setName(w.name); setCapacity(w.capacity ? String(w.capacity) : ''); setDescription(w.description || ''); setFormOpen(true);
  }

  async function save() {
    if (!name.trim()) { window.alert('Укажите название цеха'); return; }
    setSaving(true);
    const payload = { name: name.trim(), capacity, description };
    const { error } = editing ? await updateWorkshop(editing.id, payload) : await createWorkshop(payload);
    setSaving(false);
    if (error) window.alert('Ошибка: ' + error.message);
    else setFormOpen(false);
  }

  async function confirmDelete() {
    const { error } = await deleteWorkshop(confirmDeleteId);
    if (error) window.alert('Ошибка: ' + error.message);
    setConfirmDeleteId(null);
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  return (
    <div className="flex flex-col gap-3 py-3">
      <button
        type="button"
        onClick={openCreate}
        className="w-full rounded-xl px-4 py-3 text-base font-semibold bg-tg-button text-tg-button-text"
        style={{ minHeight: 48 }}
      >
        + Добавить цех
      </button>

      {workshops.length === 0 ? (
        <EmptyState icon="🏭" title="Цеха ещё не добавлены" hint="Нажмите «+ Добавить цех», чтобы создать первый" />
      ) : (
        workshops.map((w) => {
          const active = w.batches?.find((b) => b.is_active);
          const sd = summary[w.id];
          return (
            <Card key={w.id} onClick={() => navigate(`/workshops/${w.id}`)}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-base font-semibold truncate">🏠 {w.name}</p>
                  {w.capacity ? <p className="text-xs text-tg-hint">Вместимость: {w.capacity.toLocaleString('ru-RU')} гол.</p> : null}
                  {w.description ? <p className="text-xs text-tg-hint italic truncate">{w.description}</p> : null}
                </div>
                <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <button type="button" onClick={() => openEdit(w)} className="w-9 h-9 rounded-lg bg-tg-secondary">✏️</button>
                  <button type="button" onClick={() => setConfirmDeleteId(w.id)} className="w-9 h-9 rounded-lg bg-tg-secondary text-tg-destructive">🗑</button>
                </div>
              </div>
              {!active ? (
                <p className="text-sm text-tg-hint mt-2">Нет активной партии</p>
              ) : (
                <div className="mt-2">
                  <ListRow label={active.batch_name} value={`${active.initial_quantity?.toLocaleString('ru-RU')} гол.`} />
                  {sd && (
                    <>
                      <ListRow label="День выращивания" value={sd.age} />
                      <ListRow label="Падёж сегодня" value={sd.mortality} />
                      {sd.weight && sd.norm && <ListRow label="Масса" value={`${sd.weight} г (норма ${sd.norm.weight})`} />}
                      {sd.daily_feed && sd.norm && <ListRow label="Корм" value={`${sd.daily_feed} мешк. (норма ${sd.norm.dailyFeed} г/гол)`} />}
                    </>
                  )}
                </div>
              )}
            </Card>
          );
        })
      )}

      <BottomSheet open={formOpen} onClose={() => setFormOpen(false)} title={editing ? 'Редактировать цех' : 'Новый цех'}>
        <div className="flex flex-col gap-3">
          <FormField label="Название цеха *">
            <input
              value={name} onChange={(e) => setName(e.target.value)} placeholder="Цех №1"
              className="w-full rounded-xl px-3 bg-tg-secondary text-tg-text" style={{ minHeight: 48 }}
            />
          </FormField>
          <FormField label="Вместимость (голов)">
            <NumberStepper value={capacity} onChange={setCapacity} step={1000} suffix="гол." />
          </FormField>
          <FormField label="Описание">
            <input
              value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Основной цех, утеплённый..."
              className="w-full rounded-xl px-3 bg-tg-secondary text-tg-text" style={{ minHeight: 48 }}
            />
          </FormField>
          <button
            type="button" onClick={save} disabled={saving}
            className="rounded-xl px-4 py-3 text-base font-semibold bg-tg-button text-tg-button-text disabled:opacity-60"
            style={{ minHeight: 48 }}
          >
            {saving ? 'Сохранение…' : editing ? 'Сохранить' : 'Создать цех'}
          </button>
        </div>
      </BottomSheet>

      <ConfirmSheet
        open={!!confirmDeleteId}
        title="Удалить цех?"
        message="Цех будет деактивирован, данные сохранятся."
        onConfirm={confirmDelete}
        onClose={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Wire the route**

In `src/mobile/TelegramApp.jsx`:

```jsx
import MobileWorkshopsPage from './pages/MobileWorkshopsPage';
```
```jsx
<Route path="/workshops" element={<MobileWorkshopsPage />} />
```

- [ ] **Step 3: Verify**

Run: `npx eslint src` → `20/8/12` unchanged.
Run: `npm run build` → passes.
Run: `npm run dev` + Browser pane, `http://localhost:5173/?tg_debug=1&tg_linked=1`, navigate to «Ещё» → «Учёт по цехам». With no real session, `useWorkshops()` still runs its own Supabase query independent of the mock auth — if it errors (RLS/no session), confirm the page doesn't crash (an empty `workshops` array renders the empty state) and check the console for the expected auth error, not a JS exception. If real credentials are available: confirm the workshop list renders, «+ Добавить цех» opens the sheet, create a test workshop, confirm it appears, edit it, delete it (confirm sheet appears, workshop disappears from the active list after "Удалить"). Tap a workshop card (not the ✏️/🗑 buttons) → confirm navigation to `/workshops/<id>` (will show `MobileStub` until Task 5 lands — expected for this task).

- [ ] **Step 4: Commit**

```bash
git add src/mobile/pages/MobileWorkshopsPage.jsx src/mobile/TelegramApp.jsx
git commit -m "feat(mobile): add workshops list screen"
```

---

## Task 5: `MobileWorkshopDetailPage`

**Files:**
- Create: `src/mobile/pages/workshops/MobileWorkshopDetailPage.jsx`
- Modify: `src/mobile/TelegramApp.jsx` (new route `/workshops/:workshopId`)

**Interfaces:**
- Consumes: `supabase`; `getNormForDay`, `FEED_BAG_WEIGHT_G` from `src/constants/broilerStandards.js`; `Card`, `ListRow`, `EmptyState`, `Spinner` (Foundation).
- Produces: `MobileWorkshopDetailPage` default export, mounted at `/workshops/:workshopId` via `useParams()`. Relies entirely on Foundation's existing route-based `useTelegramBackButton()` (already wired in `TelegramLayout`) — no changes to that hook or to `TelegramLayout.jsx` are needed, since neither `/workshops` nor `/workshops/:workshopId` is in the root set `{'/', '/daily-entry', '/tasks'}`; the BackButton on the detail page calls `navigate(-1)`, which returns to `/workshops` via normal browser history.

- [ ] **Step 1: Write `MobileWorkshopDetailPage.jsx`**

```jsx
// src/mobile/pages/workshops/MobileWorkshopDetailPage.jsx
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../../supabaseClient';
import { getNormForDay, FEED_BAG_WEIGHT_G } from '../../../constants/broilerStandards';
import Card from '../../components/Card';
import ListRow from '../../components/ListRow';
import EmptyState from '../../components/EmptyState';
import Spinner from '../../components/Spinner';

export default function MobileWorkshopDetailPage() {
  const { workshopId } = useParams();
  const [workshop, setWorkshop] = useState(null);
  const [batch, setBatch] = useState(null);
  const [logs, setLogs] = useState(null); // null = still loading
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    (async () => {
      setLogs(null);
      setNotFound(false);
      const { data: w } = await supabase.from('workshops').select('id, name').eq('id', workshopId).maybeSingle();
      if (!w) { setNotFound(true); return; }
      setWorkshop(w);

      const { data: b } = await supabase
        .from('broiler_batches')
        .select('*')
        .eq('workshop_id', workshopId)
        .eq('is_active', true)
        .order('start_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      setBatch(b);
      if (!b) { setLogs([]); return; }

      const { data: l } = await supabase
        .from('daily_logs')
        .select('log_date, age, mortality, weight, daily_feed, water_consumption')
        .eq('batch_id', b.id)
        .order('age', { ascending: false });
      setLogs(l || []);
    })();
  }, [workshopId]);

  if (notFound) return <EmptyState icon="⚠️" title="Цех не найден" />;
  if (logs === null) return <div className="flex justify-center py-20"><Spinner /></div>;
  if (!batch) return <EmptyState icon="🏭" title={`В «${workshop?.name ?? ''}» нет активной партии`} />;

  const totalDead = logs.reduce((s, r) => s + (r.mortality || 0), 0);
  const currentHead = batch.initial_quantity - totalDead;

  function feedPerHead(row) {
    let cumMort = 0;
    const sortedAsc = [...logs].sort((a, b) => a.age - b.age);
    for (const l of sortedAsc) {
      if (l.age < row.age) cumMort += l.mortality || 0;
    }
    const flock = batch.initial_quantity - cumMort;
    if (!flock || !row.daily_feed) return null;
    return Math.round((row.daily_feed * FEED_BAG_WEIGHT_G) / flock);
  }

  return (
    <div className="flex flex-col gap-3 py-3">
      <Card>
        <p className="text-base font-semibold">{batch.batch_name}</p>
        <ListRow label="Посадка" value={`${batch.initial_quantity?.toLocaleString('ru-RU')} гол.`} />
        <ListRow label="Сейчас" value={`${currentHead?.toLocaleString('ru-RU')} гол.`} />
        <ListRow label="Всего пало" value={totalDead} />
        <ListRow label="Начало" value={new Date(batch.start_date).toLocaleDateString('ru-RU')} />
      </Card>

      {logs.length === 0 ? (
        <EmptyState icon="📭" title="Записей журнала пока нет" />
      ) : (
        logs.map((row, i) => {
          const norm = getNormForDay(row.age);
          const fph = feedPerHead(row);
          return (
            <Card key={i}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold">{new Date(row.log_date).toLocaleDateString('ru-RU')}</span>
                <span className="text-xs text-tg-hint">День {row.age}</span>
              </div>
              <ListRow label="Падёж" value={row.mortality} />
              <ListRow label="Масса факт / норма" value={`${row.weight ?? '—'} / ${norm?.weight ?? '—'} г`} />
              <ListRow label="Корм факт / норма" value={`${fph ?? '—'} / ${norm?.dailyFeed ?? '—'} г/гол`} />
              <ListRow label="Вода" value={row.water_consumption != null ? `${row.water_consumption} л` : '—'} />
            </Card>
          );
        })
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire the route**

In `src/mobile/TelegramApp.jsx`:

```jsx
import MobileWorkshopDetailPage from './pages/workshops/MobileWorkshopDetailPage';
```
```jsx
<Route path="/workshops/:workshopId" element={<MobileWorkshopDetailPage />} />
```
Add it as a new `<Route>` line near `/workshops` — do not remove or reorder any existing route.

- [ ] **Step 3: Verify**

Run: `npx eslint src` → `20/8/12` unchanged.
Run: `npm run build` → passes.
Run: `npm run dev` + Browser pane, `http://localhost:5173/?tg_debug=1&tg_linked=1`. Navigate to a nonexistent workshop id directly (`/workshops/00000000-0000-0000-0000-000000000000`) → expect "Цех не найден". Confirm the native BackButton is visible (`javascript_tool`: `window.Telegram.WebApp.BackButton.isVisible === true`) since this route isn't a root. Tap it (`BackButton._click()`) → confirm it navigates back to `/workshops`. If real data is available: from `/workshops`, tap a real workshop card → confirm the detail page shows the batch header and per-day cards with correct norm columns; tap BackButton → back to the list.

- [ ] **Step 4: Commit**

```bash
git add src/mobile/pages/workshops/MobileWorkshopDetailPage.jsx src/mobile/TelegramApp.jsx
git commit -m "feat(mobile): add workshop detail screen"
```

---

## Task 6: `MobileTasksPage`

**Files:**
- Create: `src/mobile/pages/MobileTasksPage.jsx`
- Modify: `src/mobile/TelegramApp.jsx` (route `/tasks`)

**Interfaces:**
- Consumes: `useTasks(filters)` and `useEmployees()` from `src/hooks/useTasks.js` (`useTasks` filters: `{status?, assigneeId?, workshopId?, priority?}`; returns `{tasks, loading, createTask, updateTask, deleteTask}`; `createTask`/`updateTask` return `{error}`); `useWorkshops()` from `src/hooks/useBatchData.js`; `Card`, `BottomSheet`, `FormField`, `EmptyState`, `Spinner` (Foundation); `ConfirmSheet` (Task 1); `useTelegramMainButton` (Foundation, `src/mobile/telegram/useTelegramMainButton.js`).
- Produces: `MobileTasksPage` default export, mounted at `/tasks` (one of the 3 root tabs — no BackButton, matches Foundation's `ROOTS` set unchanged).

- [ ] **Step 1: Write `MobileTasksPage.jsx`**

```jsx
// src/mobile/pages/MobileTasksPage.jsx
import { useMemo, useState } from 'react';
import { useTasks, useEmployees } from '../../hooks/useTasks';
import { useWorkshops } from '../../hooks/useBatchData';
import Card from '../components/Card';
import BottomSheet from '../components/BottomSheet';
import ConfirmSheet from '../components/ConfirmSheet';
import FormField from '../components/FormField';
import EmptyState from '../components/EmptyState';
import Spinner from '../components/Spinner';
import { useTelegramMainButton } from '../telegram/useTelegramMainButton';

const PRIORITY_LABEL = { low: 'Низкий', medium: 'Средний', high: 'Высокий', urgent: '🚨 Срочный' };
const PRIORITY_COLOR = { low: '#6c757d', medium: '#4f46e5', high: '#fd7e14', urgent: '#dc3545' };
const STATUS_LABEL = { open: 'Открыта', in_progress: 'В работе', done: 'Выполнена', cancelled: 'Отменена' };
const STATUS_NEXT = { open: 'in_progress', in_progress: 'done', done: 'open' };
const STATUS_BTN = { open: '▶ В работу', in_progress: '✅ Выполнено', done: '↩ Открыть снова' };
const EMPTY_FORM = { title: '', description: '', assignee_id: '', workshop_id: '', priority: 'medium', due_date: '', created_by: '' };
const fieldClass = 'w-full rounded-xl px-3 bg-tg-secondary text-tg-text';

export default function MobileTasksPage() {
  const [filters, setFilters] = useState({ status: '', assigneeId: '', workshopId: '', priority: '' });
  const { tasks, loading, createTask, updateTask, deleteTask } = useTasks({
    status: filters.status || undefined,
    assigneeId: filters.assigneeId || undefined,
    workshopId: filters.workshopId || undefined,
    priority: filters.priority || undefined,
  });
  const { employees } = useEmployees();
  const { workshops } = useWorkshops();

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const counts = useMemo(
    () => tasks.reduce((acc, t) => { acc[t.status] = (acc[t.status] || 0) + 1; return acc; }, {}),
    [tasks],
  );
  const overdueCount = useMemo(
    () => tasks.filter((t) => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'done').length,
    [tasks],
  );
  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  function openCreate() { setEditingId(null); setForm(EMPTY_FORM); setFormOpen(true); }
  function openEdit(t) {
    setEditingId(t.id);
    setForm({
      title: t.title, description: t.description || '', assignee_id: t.assignee_id || '',
      workshop_id: t.workshop_id || '', priority: t.priority, due_date: t.due_date || '', created_by: t.created_by || '',
    });
    setFormOpen(true);
  }

  async function save() {
    if (!form.title.trim()) { window.alert('Укажите название задачи'); return; }
    if (!form.assignee_id) { window.alert('Выберите исполнителя'); return; }
    setSaving(true);
    const payload = { ...form, workshop_id: form.workshop_id || null, due_date: form.due_date || null };
    const { error } = editingId ? await updateTask(editingId, payload) : await createTask(payload);
    setSaving(false);
    if (error) window.alert('Ошибка: ' + error.message);
    else setFormOpen(false);
  }

  useTelegramMainButton({
    text: saving ? 'Сохраняем…' : editingId ? 'Сохранить' : 'Создать задачу',
    onClick: save,
    visible: formOpen,
    loading: saving,
  });

  async function confirmDelete() {
    const { error } = await deleteTask(confirmDeleteId);
    if (error) window.alert('Ошибка: ' + error.message);
    setConfirmDeleteId(null);
  }

  return (
    <div className="flex flex-col gap-3 py-3">
      <div className="flex gap-2">
        <button
          type="button" onClick={openCreate}
          className="flex-1 rounded-xl px-4 py-3 text-sm font-semibold bg-tg-button text-tg-button-text"
          style={{ minHeight: 44 }}
        >
          + Задача
        </button>
        <button
          type="button" onClick={() => setFiltersOpen(true)}
          className="flex-1 rounded-xl px-4 py-3 text-sm font-semibold bg-tg-secondary text-tg-text"
          style={{ minHeight: 44 }}
        >
          Фильтры{activeFilterCount ? ` (${activeFilterCount})` : ''}
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto">
        {[
          { label: 'Открытые', value: counts.open || 0, color: '#4f46e5' },
          { label: 'В работе', value: counts.in_progress || 0, color: '#fd7e14' },
          { label: 'Выполнены', value: counts.done || 0, color: '#28a745' },
          { label: 'Просрочены', value: overdueCount, color: '#dc3545' },
        ].map((s) => (
          <div
            key={s.label}
            className="flex-shrink-0 rounded-xl px-3 py-2 text-center"
            style={{ background: `color-mix(in srgb, ${s.color} 12%, transparent)`, border: `1px solid ${s.color}30`, minWidth: 84 }}
          >
            <div className="text-xl font-bold" style={{ color: s.color }}>{s.value}</div>
            <div className="text-xs text-tg-hint">{s.label}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : tasks.length === 0 ? (
        <EmptyState icon="✅" title="Задач нет" hint="Создайте первую" />
      ) : (
        tasks.map((task) => {
          const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done';
          return (
            <Card
              key={task.id}
              style={{ borderLeft: `4px solid ${PRIORITY_COLOR[task.priority] || 'var(--tg-secondary-bg)'}` }}
              className={isOverdue ? 'border border-tg-destructive' : ''}
            >
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span
                  className="text-xs font-bold rounded px-1.5 py-0.5"
                  style={{ color: PRIORITY_COLOR[task.priority], background: `${PRIORITY_COLOR[task.priority]}20` }}
                >
                  {PRIORITY_LABEL[task.priority]}
                </span>
                <span className="text-xs text-tg-hint">{STATUS_LABEL[task.status]}</span>
                {isOverdue && <span className="text-xs font-bold text-tg-destructive">⚠️ Просрочена</span>}
              </div>
              <p
                className="text-base font-medium"
                style={{
                  textDecoration: task.status === 'done' ? 'line-through' : 'none',
                  color: task.status === 'done' ? 'var(--tg-hint)' : 'var(--tg-text)',
                }}
              >
                {task.title}
              </p>
              {task.description && <p className="text-sm text-tg-hint mt-0.5">{task.description}</p>}
              <div className="flex flex-col gap-0.5 mt-1.5 text-xs text-tg-hint">
                {task.assignee && <span>👤 {task.assignee.full_name}{task.assignee.position ? ` · ${task.assignee.position}` : ''}</span>}
                {task.workshop && <span>🏠 {task.workshop.name}</span>}
                {task.due_date && (
                  <span style={{ color: isOverdue ? 'var(--tg-destructive)' : undefined }}>📅 Срок: {task.due_date}</span>
                )}
                {task.completed_at && (
                  <span style={{ color: '#28a745' }}>✅ Выполнено: {new Date(task.completed_at).toLocaleDateString('ru-RU')}</span>
                )}
                {task.created_by && <span>Создал: {task.created_by}</span>}
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => updateTask(task.id, { status: STATUS_NEXT[task.status] || 'open' })}
                  className="flex-1 rounded-lg px-3 py-2 text-xs font-semibold text-white"
                  style={{ background: task.status === 'done' ? '#6c757d' : '#28a745', minHeight: 36 }}
                >
                  {STATUS_BTN[task.status] || '↩ Открыть'}
                </button>
                <button type="button" onClick={() => openEdit(task)} className="rounded-lg px-3 py-2 text-xs bg-tg-secondary" style={{ minHeight: 36 }}>✏️</button>
                <button type="button" onClick={() => setConfirmDeleteId(task.id)} className="rounded-lg px-3 py-2 text-xs text-tg-destructive bg-tg-secondary" style={{ minHeight: 36 }}>🗑</button>
              </div>
            </Card>
          );
        })
      )}

      <BottomSheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Фильтры">
        <div className="flex flex-col gap-3">
          <FormField label="Статус">
            <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }}>
              <option value="">Все статусы</option>
              {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </FormField>
          <FormField label="Приоритет">
            <select value={filters.priority} onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }}>
              <option value="">Все приоритеты</option>
              {Object.entries(PRIORITY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </FormField>
          <FormField label="Исполнитель">
            <select value={filters.assigneeId} onChange={(e) => setFilters((f) => ({ ...f, assigneeId: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }}>
              <option value="">Все исполнители</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
            </select>
          </FormField>
          <FormField label="Цех">
            <select value={filters.workshopId} onChange={(e) => setFilters((f) => ({ ...f, workshopId: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }}>
              <option value="">Все цеха</option>
              {workshops.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </FormField>
          <button
            type="button"
            onClick={() => setFilters({ status: '', assigneeId: '', workshopId: '', priority: '' })}
            className="rounded-xl px-4 py-2 text-sm bg-tg-secondary text-tg-text"
            style={{ minHeight: 44 }}
          >
            Сбросить
          </button>
        </div>
      </BottomSheet>

      <BottomSheet open={formOpen} onClose={() => setFormOpen(false)} title={editingId ? 'Редактировать задачу' : 'Новая задача'}>
        <div className="flex flex-col gap-3">
          <FormField label="Название задачи *">
            <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Что нужно сделать?" className={fieldClass} style={{ minHeight: 48 }} />
          </FormField>
          <FormField label="Описание">
            <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className={fieldClass} style={{ minHeight: 80 }} />
          </FormField>
          <FormField label="Исполнитель *">
            <select value={form.assignee_id} onChange={(e) => setForm((f) => ({ ...f, assignee_id: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }}>
              <option value="">— Выберите —</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}{e.position ? ` (${e.position})` : ''}</option>)}
            </select>
          </FormField>
          <FormField label="Приоритет">
            <select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }}>
              {Object.entries(PRIORITY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </FormField>
          <FormField label="Цех (опционально)">
            <select value={form.workshop_id} onChange={(e) => setForm((f) => ({ ...f, workshop_id: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }}>
              <option value="">— Не привязывать —</option>
              {workshops.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </FormField>
          <FormField label="Срок выполнения">
            <input type="date" value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }} />
          </FormField>
          <FormField label="Создал (ваше имя)">
            <input value={form.created_by} onChange={(e) => setForm((f) => ({ ...f, created_by: e.target.value }))} placeholder="Иванов И.И." className={fieldClass} style={{ minHeight: 44 }} />
          </FormField>
        </div>
      </BottomSheet>

      <ConfirmSheet open={!!confirmDeleteId} title="Удалить задачу?" onConfirm={confirmDelete} onClose={() => setConfirmDeleteId(null)} />
    </div>
  );
}
```

- [ ] **Step 2: Wire the route**

In `src/mobile/TelegramApp.jsx`:

```jsx
import MobileTasksPage from './pages/MobileTasksPage';
```
```jsx
<Route path="/tasks" element={<MobileTasksPage />} />
```

- [ ] **Step 3: Verify**

Run: `npx eslint src` → `20/8/12` unchanged.
Run: `npm run build` → passes.
Run: `npm run dev` + Browser pane, `http://localhost:5173/?tg_debug=1&tg_linked=1`, tap «Задачи» tab (root — confirm NO native BackButton: `javascript_tool` → `window.Telegram.WebApp.BackButton.isVisible === false`). Confirm counters render, «Фильтры» opens the sheet with 4 selects + «Сбросить», «+ Задача» opens the create sheet and the native MainButton shows "Создать задачу". If real credentials/data available: create a task, confirm it appears in the list with correct priority color and counters updated; tap the status-cycle button, confirm status advances; edit it; delete it (confirm sheet). If not available, confirm the empty state renders without crashing and state the write path wasn't exercised against real data.

- [ ] **Step 4: Commit**

```bash
git add src/mobile/pages/MobileTasksPage.jsx src/mobile/TelegramApp.jsx
git commit -m "feat(mobile): add tasks screen with filters and status cycling"
```

---

## Task 7: `MobileBatchLogPage` (header, norm/fact dashboard, chart, history, tabs, read-only journal)

**Files:**
- Create: `src/mobile/pages/MobileBatchLogPage.jsx`
- Modify: `src/mobile/TelegramApp.jsx` (route `/batch/:batchId`)

**Interfaces:**
- Consumes: `supabase`; `compareWithNorm` (unused in this task, imported by Task 8), `calcMortality`, `forecastWeight`, `calcHistoricalMortality`, `buildWeightSeries` from `src/utils/normComparison.js`; `getNormForDay`, `FEED_BAG_WEIGHT_G` from `src/constants/broilerStandards.js`; `Card`, `ListRow`, `StatusPill`, `EmptyState`, `Spinner` (Foundation); `Tabs`, `WeightChart` (Tasks 1–2).
- Produces: `MobileBatchLogPage` default export, mounted at `/batch/:batchId`. Exposes an internal `fetchAll()` reload function that Task 8's `MobileJournalTab` will receive as an `onReload` prop (Task 8 wires this — this task keeps the journal tab read-only and self-contained, no prop threading yet).
- The `age` field on each `daily_logs` row already exists in the DB (`daily_logs.age`, `integer not null`) — do not recompute it for display, only for the norm-history calculation helpers which take it as an input (`calcHistoricalMortality`, `getNormForDay`).

- [ ] **Step 1: Write `MobileBatchLogPage.jsx`**

```jsx
// src/mobile/pages/MobileBatchLogPage.jsx
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { calcMortality, forecastWeight, calcHistoricalMortality, buildWeightSeries } from '../../utils/normComparison';
import { getNormForDay, FEED_BAG_WEIGHT_G } from '../../constants/broilerStandards';
import Card from '../components/Card';
import ListRow from '../components/ListRow';
import StatusPill from '../components/StatusPill';
import Tabs from '../components/Tabs';
import WeightChart from '../components/WeightChart';
import EmptyState from '../components/EmptyState';
import Spinner from '../components/Spinner';

function formatCurrency(v) {
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'TJS' }).format(v || 0);
}

export default function MobileBatchLogPage() {
  const { batchId } = useParams();
  const [batch, setBatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('journal');
  const [logs, setLogs] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [sales, setSales] = useState([]);
  const [feed, setFeed] = useState([]);
  const [salaries, setSalaries] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [historicalBatches, setHistoricalBatches] = useState([]);
  const [historicalLogs, setHistoricalLogs] = useState([]);

  async function fetchAll() {
    setLoading(true);
    try {
      const [batchRes, logsRes, medicinesRes, expensesRes, salesRes, feedRes, salariesRes] = await Promise.all([
        supabase.from('broiler_batches').select('*').eq('id', batchId).single(),
        supabase.from('daily_logs').select('*, medicine:medicines(name)').eq('batch_id', batchId).order('log_date', { ascending: false }),
        supabase.from('medicines').select('id, name'),
        supabase.rpc('get_expenses_by_batch', { batch_uuid: batchId }),
        supabase.rpc('get_sales_by_batch', { batch_uuid: batchId }),
        supabase.rpc('get_feed_by_batch', { batch_uuid: batchId }),
        supabase.rpc('get_salaries_by_batch', { batch_uuid: batchId }),
      ]);
      if (batchRes.error) throw batchRes.error;
      setBatch(batchRes.data);
      setLogs(logsRes.data || []);
      setMedicines(medicinesRes.data || []);
      setExpenses(expensesRes.data || []);
      setSales(salesRes.data || []);
      setFeed(feedRes.data || []);
      setSalaries(salariesRes.data || []);

      const { data: others } = await supabase
        .from('broiler_batches')
        .select('id, batch_name, initial_quantity')
        .neq('id', batchId);
      setHistoricalBatches(others || []);
      if (others?.length) {
        const { data: histLogs } = await supabase
          .from('daily_logs')
          .select('batch_id, age, mortality')
          .in('batch_id', others.map((b) => b.id));
        setHistoricalLogs(histLogs || []);
      } else {
        setHistoricalLogs([]);
      }
    } catch (e) {
      window.alert('Не удалось загрузить данные партии: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (batchId) fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId]);

  const totalMortality = useMemo(() => logs.reduce((s, l) => s + l.mortality, 0), [logs]);
  const currentQuantity = batch ? batch.initial_quantity - totalMortality : 0;
  const lastLog = useMemo(() => [...logs].sort((a, b) => b.age - a.age)[0], [logs]);
  const norm = lastLog ? getNormForDay(lastLog.age) : null;
  const mortality = logs.length && batch ? calcMortality(logs, batch.initial_quantity) : null;
  const forecast = logs.length ? forecastWeight(logs, 42) : null;
  const weightSeries = logs.length ? buildWeightSeries(logs, 42) : [];
  const histMortality = lastLog ? calcHistoricalMortality(historicalBatches, historicalLogs, lastLog.age) : [];
  const waterPerHead = lastLog?.water_consumption && currentQuantity > 0
    ? Math.round((lastLog.water_consumption * 1000) / currentQuantity) : null;
  const feedPerHead = lastLog?.daily_feed && currentQuantity > 0
    ? Math.round((lastLog.daily_feed * FEED_BAG_WEIGHT_G) / currentQuantity) : null;

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;
  if (!batch) return <EmptyState icon="⚠️" title="Партия не найдена" />;

  const tabs = [
    { key: 'journal', label: 'Журнал', count: logs.length },
    { key: 'expenses', label: 'Расходы', count: expenses.length },
    { key: 'sales', label: 'Продажи', count: sales.length },
    { key: 'feed', label: 'Корм', count: feed.length },
    { key: 'salaries', label: 'Зарплаты', count: salaries.length },
  ];

  return (
    <div className="flex flex-col gap-3 py-3">
      <Card>
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-lg font-semibold truncate">{batch.batch_name}</span>
          <StatusPill status={batch.is_active ? 'ok' : 'neutral'}>{batch.is_active ? 'Активна' : 'Завершена'}</StatusPill>
        </div>
        <ListRow label="Начало" value={new Date(batch.start_date).toLocaleDateString('ru-RU')} />
        <ListRow label="Начальное поголовье" value={batch.initial_quantity?.toLocaleString('ru-RU')} />
        <ListRow label="Общий падёж" value={totalMortality} />
        <ListRow label="Текущее поголовье" value={currentQuantity.toLocaleString('ru-RU')} />
      </Card>

      {logs.length > 0 && (
        <>
          {norm && (
            <Card>
              <p className="text-sm font-semibold mb-1">🐔 Живая масса</p>
              <ListRow label={`Факт (день ${lastLog.age})`} value={`${lastLog.weight ?? '—'} г`} />
              <ListRow label="Норма ROSS-308" value={`${norm.weight} г`} />
            </Card>
          )}
          {mortality && (
            <Card>
              <p className="text-sm font-semibold mb-1">💀 Падёж (накопительный)</p>
              <ListRow label="Пало" value={`${mortality.totalDead} гол. (${mortality.factPercent}%)`} />
              <ListRow label="Норма ROSS-308" value={`до ${mortality.normPercent}%`} />
              <div className="pt-1">
                <StatusPill status={mortality.status}>
                  {mortality.status === 'ok' ? 'В норме' : mortality.status === 'warning' ? 'Повышенный' : 'Критический'}
                </StatusPill>
              </div>
            </Card>
          )}
          {norm && waterPerHead != null && (
            <Card>
              <p className="text-sm font-semibold mb-1">💧 Вода, мл/гол/сутки</p>
              <ListRow label="Всего" value={`${lastLog.water_consumption} л`} />
              <ListRow label="На голову" value={`${waterPerHead} мл`} />
              <ListRow label="Норма ROSS-308" value={`${norm.waterNorm} мл`} />
            </Card>
          )}
          {norm && feedPerHead != null && (
            <Card>
              <p className="text-sm font-semibold mb-1">🌾 Корм, г/гол/сутки</p>
              <ListRow label="Всего" value={`${lastLog.daily_feed} мешк.`} />
              <ListRow label="На голову" value={`${feedPerHead} г`} />
              <ListRow label="Норма ROSS-308" value={`${norm.dailyFeed} г`} />
            </Card>
          )}
          {weightSeries.length > 0 && (
            <Card>
              <p className="text-sm font-semibold mb-2">📈 Масса: факт vs норма vs прогноз</p>
              {forecast && (
                <p className="text-xs text-tg-hint mb-2">
                  Прирост/сут: {forecast.dailyGain} г · Прогноз (42): {forecast.forecastWeight} г
                </p>
              )}
              <WeightChart data={weightSeries} />
            </Card>
          )}
          {histMortality.length > 0 && mortality && (
            <Card>
              <p className="text-sm font-semibold mb-2">📊 Падёж vs предыдущие партии (день {lastLog.age})</p>
              <ListRow label="Текущая" value={`${mortality.totalDead} / ${mortality.factPercent}%`} />
              {histMortality.map((h, i) => (
                <ListRow key={i} label={h.batchName} value={`${h.totalDead} / ${h.percent}%`} />
              ))}
            </Card>
          )}
        </>
      )}

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'journal' && (
        logs.length === 0 ? <EmptyState icon="📭" title="Записей журнала пока нет" /> : logs.map((log) => (
          <Card key={log.id}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-semibold">{new Date(log.log_date).toLocaleDateString('ru-RU')}</span>
              <span className="text-xs text-tg-hint">День {log.age}</span>
            </div>
            <ListRow label="Падёж (ест/хал)" value={`${log.mortality} (${log.mortality_natural || 0}/${log.mortality_halal || 0})`} />
            <ListRow label="Масса" value={log.weight ?? '—'} />
            <ListRow label="Вода" value={log.water_consumption ?? '—'} />
            <ListRow label="Корм" value={log.daily_feed ?? '—'} />
            <ListRow label="Лекарство" value={log.medicine?.name || '—'} />
          </Card>
        ))
      )}
      {tab === 'expenses' && (
        expenses.length === 0 ? <EmptyState icon="📭" title="Расходов нет" /> : expenses.map((e) => (
          <ListRow key={e.id} label={`${new Date(e.expense_date).toLocaleDateString('ru-RU')} · ${e.description}`} value={formatCurrency(e.amount)} />
        ))
      )}
      {tab === 'sales' && (
        sales.length === 0 ? <EmptyState icon="📭" title="Продаж нет" /> : sales.map((s) => (
          <ListRow key={s.id} label={`${new Date(s.sale_date).toLocaleDateString('ru-RU')} · ${s.customer_name || '—'}`} value={formatCurrency(s.weight_kg * s.price_per_kg)} />
        ))
      )}
      {tab === 'feed' && (
        feed.length === 0 ? <EmptyState icon="📭" title="Поставок корма нет" /> : feed.map((f) => (
          <ListRow key={f.id} label={`${new Date(f.delivery_date).toLocaleDateString('ru-RU')} · ${f.feed_type}`} value={`${f.quantity_kg} кг`} />
        ))
      )}
      {tab === 'salaries' && (
        salaries.length === 0 ? <EmptyState icon="📭" title="Выплат нет" /> : salaries.map((s) => (
          <ListRow key={s.id} label={`${new Date(s.payment_date).toLocaleDateString('ru-RU')} · ${s.employee_name}`} value={formatCurrency(s.amount)} />
        ))
      )}
    </div>
  );
}
```

Note: `medicines` is loaded and stored but not yet rendered anywhere in this task — it becomes a `<select>` data source in Task 8's add-entry form. Keep the `setMedicines`/`medicines` state as written; do not remove it as "unused" — it is consumed starting Task 8.

- [ ] **Step 2: Wire the route**

In `src/mobile/TelegramApp.jsx`:

```jsx
import MobileBatchLogPage from './pages/MobileBatchLogPage';
```
```jsx
<Route path="/batch/:batchId" element={<MobileBatchLogPage />} />
```

- [ ] **Step 3: Verify**

Run: `npx eslint src` → expect **21 problems** at this point (20 baseline + 1 new `no-unused-vars` warning for `medicines`/`setMedicines` being assigned but not read in this task alone — see the note above; if your linter does flag it, that is expected and resolved by Task 8, not a bug to fix now. If it does NOT flag it (some `no-unused-vars` configs only flag unused *declarations*, not unused state after being set), the baseline stays `20/8/12` — either is acceptable for this task's checkpoint, but the task reviewer must see `20/8/12` restored by Task 8's end at the latest).
Run: `npm run build` → passes.
Run: `npm run dev` + Browser pane, `http://localhost:5173/?tg_debug=1&tg_linked=1`, navigate to a nonexistent batch id → "Партия не найдена". Confirm BackButton visible (non-root route). If real data available: open a real batch, confirm header, dashboard cards, chart, tab switching, and read-only journal cards render with correct values; cross-check a couple of numbers (falling mortality %, water/feed per head) against the desktop `BatchLogPage` for the same batch.

- [ ] **Step 4: Commit**

```bash
git add src/mobile/pages/MobileBatchLogPage.jsx src/mobile/TelegramApp.jsx
git commit -m "feat(mobile): add batch log screen (dashboard, chart, history, read-only journal)"
```

> Reviewer note: this task's `medicines` state is intentionally unused until Task 8 — do not flag as dead code without checking Task 8 lands it.

---

## Task 8: `MobileJournalTab` (journal write path + domain invariant)

**Files:**
- Create: `src/mobile/pages/batchLog/MobileJournalTab.jsx`
- Modify: `src/mobile/pages/MobileBatchLogPage.jsx` (replace the inline read-only `tab === 'journal'` block with `<MobileJournalTab>`)

**Interfaces:**
- Consumes: `supabase`; `compareWithNorm` from `src/utils/normComparison.js`; `getWeekMortalityNorm`, `FEED_BAG_WEIGHT_G` from `src/constants/broilerStandards.js`; `syncSummaryBatchLog` from `src/utils/summaryBatchSync.js`; `Card`, `ListRow`, `FormField`, `NumberStepper`, `BottomSheet`, `EmptyState` (Foundation); `NormBadge`, `ConfirmSheet` (Task 1); `useTelegramMainButton`, `useTelegramHaptics` (Foundation).
- Produces: `MobileJournalTab({ batch, logs, medicines, onReload })` default export — `batch` is the full `broiler_batches` row, `logs` is the array already loaded by `MobileBatchLogPage`, `medicines` is `{id,name}[]`, `onReload` is `MobileBatchLogPage`'s `fetchAll` function (passed down so a successful write refreshes the parent's full data set, matching desktop's `fetchAllBatchData()` call after every journal mutation).
- **Domain invariant — binding on every write branch in this file:**
  - Insert → after a successful `daily_logs` insert, `if (!batch.is_summary) await syncSummaryBatchLog(entry.log_date, user.id)`.
  - Edit → after a successful `daily_logs` update, `if (!batch.is_summary) await syncSummaryBatchLog(editedRow.log_date, user.id)`.
  - Delete → after a successful `daily_logs` delete, `if (!batch.is_summary) await syncSummaryBatchLog(deletedRow.log_date, user.id)` (capture the row's `log_date` from `logs` BEFORE issuing the delete, since it's gone afterward).
  - `mortality` written on insert = `mortality_natural + mortality_halal` of the entered values; on edit = `mortality_natural + mortality_halal` of the edited values (edit is a direct overwrite of one row, not additive — this mirrors desktop `JournalTable.handleUpdate`, unlike the additive semantics of `MobileDailyEntryPage` from the Foundation, which increments a running daily total across multiple workshops).

- [ ] **Step 1: Write `MobileJournalTab.jsx`**

```jsx
// src/mobile/pages/batchLog/MobileJournalTab.jsx
import { useState } from 'react';
import { supabase } from '../../../supabaseClient';
import { compareWithNorm } from '../../../utils/normComparison';
import { getWeekMortalityNorm, FEED_BAG_WEIGHT_G } from '../../../constants/broilerStandards';
import { syncSummaryBatchLog } from '../../../utils/summaryBatchSync';
import Card from '../../components/Card';
import ListRow from '../../components/ListRow';
import FormField from '../../components/FormField';
import NumberStepper from '../../components/NumberStepper';
import NormBadge from '../../components/NormBadge';
import BottomSheet from '../../components/BottomSheet';
import ConfirmSheet from '../../components/ConfirmSheet';
import EmptyState from '../../components/EmptyState';
import { useTelegramMainButton } from '../../telegram/useTelegramMainButton';
import { useTelegramHaptics } from '../../telegram/useTelegramHaptics';

const EMPTY_ENTRY = {
  log_date: new Date().toISOString().slice(0, 10),
  mortality_natural: '', mortality_halal: '', weight: '', water: '', daily_feed: '', medicine_id: '', dosage: '',
};
const fieldClass = 'w-full rounded-xl px-3 bg-tg-secondary text-tg-text';

function ageOf(startDate, dateStr) {
  return Math.ceil(Math.abs(new Date(dateStr) - new Date(startDate)) / 86400000);
}

function toFiniteOrNull(str) {
  const n = parseFloat(str);
  return Number.isFinite(n) ? n : null;
}

function mortalityHint(batch, age, natural, halal) {
  if (!batch || !age || age < 1) return null;
  const week = Math.ceil(age / 7);
  const normPercent = getWeekMortalityNorm(week);
  const allowedDaily = Math.round((batch.initial_quantity * normPercent / 100) / (week * 7));
  const total = (Number(natural) || 0) + (Number(halal) || 0);
  return {
    normLabel: `~${allowedDaily} гол/сут (${normPercent}%/нед)`,
    deviation: null,
    percent: null,
    status: total > allowedDaily * 2 ? 'critical' : total > allowedDaily ? 'warning' : 'ok',
  };
}

export default function MobileJournalTab({ batch, logs, medicines, onReload }) {
  const [entry, setEntry] = useState(EMPTY_ENTRY);
  const [submitting, setSubmitting] = useState(false);
  const [confirmCritical, setConfirmCritical] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const haptics = useTelegramHaptics();

  const currentQuantity = batch.initial_quantity - logs.reduce((s, l) => s + l.mortality, 0);
  const age = ageOf(batch.start_date, entry.log_date);
  const waterPerHead = entry.water && currentQuantity > 0 ? Math.round((parseFloat(entry.water) * 1000) / currentQuantity) : null;
  const feedPerHead = entry.daily_feed && currentQuantity > 0 ? Math.round((parseFloat(entry.daily_feed) * FEED_BAG_WEIGHT_G) / currentQuantity) : null;

  async function doInsert() {
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('daily_logs').insert([{
        batch_id: batch.id,
        log_date: entry.log_date,
        age,
        mortality: (Number(entry.mortality_natural) || 0) + (Number(entry.mortality_halal) || 0),
        mortality_natural: Number(entry.mortality_natural) || 0,
        mortality_halal: Number(entry.mortality_halal) || 0,
        medicine_id: entry.medicine_id || null,
        dosage: entry.dosage || null,
        water_consumption: entry.water ? Number(entry.water) : null,
        weight: toFiniteOrNull(entry.weight),
        daily_feed: toFiniteOrNull(entry.daily_feed),
        user_id: user.id,
      }]);
      if (error) throw error;
      if (!batch.is_summary) await syncSummaryBatchLog(entry.log_date, user.id);
      setEntry(EMPTY_ENTRY);
      haptics.success();
      await onReload();
    } catch (e) {
      window.alert('Ошибка: ' + e.message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleAdd() {
    const mn = Number(entry.mortality_natural) || 0;
    const mh = Number(entry.mortality_halal) || 0;
    if (mn === 0 && mh === 0 && !entry.weight && !entry.water && !entry.daily_feed && !entry.medicine_id) {
      window.alert('Введите хотя бы одно значение');
      return;
    }
    const checks = [
      compareWithNorm(age, 'weight', entry.weight),
      compareWithNorm(age, 'dailyFeed', feedPerHead),
      compareWithNorm(age, 'waterNorm', waterPerHead),
    ];
    if (checks.some((c) => c?.status === 'critical')) { setConfirmCritical(true); return; }
    doInsert();
  }

  async function saveEdit() {
    const l = editRow;
    const mn = Number(l.mortality_natural) || 0;
    const mh = Number(l.mortality_halal) || 0;
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('daily_logs').update({
      log_date: l.log_date,
      age: ageOf(batch.start_date, l.log_date),
      mortality: mn + mh,
      mortality_natural: mn,
      mortality_halal: mh,
      water_consumption: l.water_consumption !== '' && l.water_consumption != null ? Number(l.water_consumption) : null,
      weight: toFiniteOrNull(l.weight),
      daily_feed: toFiniteOrNull(l.daily_feed),
      medicine_id: l.medicine_id || null,
      dosage: l.dosage || null,
    }).eq('id', l.id);
    if (error) { window.alert(error.message); return; }
    if (!batch.is_summary) await syncSummaryBatchLog(l.log_date, user.id);
    setEditRow(null);
    await onReload();
  }

  async function doDelete() {
    const log = logs.find((l) => l.id === deleteId);
    const { error } = await supabase.from('daily_logs').delete().eq('id', deleteId);
    if (error) { window.alert(error.message); setDeleteId(null); return; }
    if (log && !batch.is_summary) {
      const { data: { user } } = await supabase.auth.getUser();
      await syncSummaryBatchLog(log.log_date, user.id);
    }
    setDeleteId(null);
    await onReload();
  }

  useTelegramMainButton({
    text: submitting ? 'Сохраняем…' : 'Добавить',
    onClick: handleAdd,
    visible: batch.is_active && !editRow,
    loading: submitting,
  });

  return (
    <div className="flex flex-col gap-3">
      {batch.is_active && (
        <Card>
          <p className="text-sm font-semibold mb-2">Добавить запись</p>
          <div className="flex flex-col gap-3">
            <FormField label="Дата">
              <input
                type="date" value={entry.log_date}
                onChange={(e) => setEntry((f) => ({ ...f, log_date: e.target.value }))}
                className={fieldClass} style={{ minHeight: 44 }}
              />
            </FormField>
            <FormField label={<>Падёж ест. <NormBadge result={mortalityHint(batch, age, entry.mortality_natural, entry.mortality_halal)} /></>}>
              <NumberStepper value={entry.mortality_natural} onChange={(v) => setEntry((f) => ({ ...f, mortality_natural: v }))} />
            </FormField>
            <FormField label="Падёж хал.">
              <NumberStepper value={entry.mortality_halal} onChange={(v) => setEntry((f) => ({ ...f, mortality_halal: v }))} />
            </FormField>
            <FormField label={<>Живая масса, г/гол <NormBadge result={compareWithNorm(age, 'weight', entry.weight)} /></>}>
              <NumberStepper value={entry.weight} onChange={(v) => setEntry((f) => ({ ...f, weight: v }))} step={10} suffix="г" />
            </FormField>
            <FormField label={<>Вода, л <NormBadge result={compareWithNorm(age, 'waterNorm', waterPerHead)} /></>}>
              <NumberStepper value={entry.water} onChange={(v) => setEntry((f) => ({ ...f, water: v }))} step={1} suffix="л" />
            </FormField>
            <FormField label={<>Корм, мешков <NormBadge result={compareWithNorm(age, 'dailyFeed', feedPerHead)} /></>}>
              <NumberStepper value={entry.daily_feed} onChange={(v) => setEntry((f) => ({ ...f, daily_feed: v }))} step={0.5} suffix="меш." />
            </FormField>
            <FormField label="Лекарство">
              <select value={entry.medicine_id} onChange={(e) => setEntry((f) => ({ ...f, medicine_id: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }}>
                <option value="">-- нет --</option>
                {medicines.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </FormField>
            <FormField label="Доза">
              <input value={entry.dosage} onChange={(e) => setEntry((f) => ({ ...f, dosage: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }} />
            </FormField>
          </div>
        </Card>
      )}

      {logs.length === 0 ? (
        <EmptyState icon="📭" title="Записей журнала пока нет" />
      ) : (
        logs.map((log) => (
          <Card key={log.id}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-semibold">{new Date(log.log_date).toLocaleDateString('ru-RU')}</span>
              <span className="text-xs text-tg-hint">День {log.age}</span>
            </div>
            <ListRow label="Падёж (ест/хал)" value={`${log.mortality} (${log.mortality_natural || 0}/${log.mortality_halal || 0})`} />
            <ListRow label="Масса" value={log.weight ?? '—'} />
            <ListRow label="Вода" value={log.water_consumption ?? '—'} />
            <ListRow label="Корм" value={log.daily_feed ?? '—'} />
            <ListRow label="Лекарство" value={log.medicine?.name || '—'} />
            {batch.is_active && (
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setEditRow({
                    id: log.id, log_date: log.log_date,
                    mortality_natural: log.mortality_natural || 0, mortality_halal: log.mortality_halal || 0,
                    weight: log.weight ?? '', water_consumption: log.water_consumption ?? '',
                    daily_feed: log.daily_feed ?? '', medicine_id: log.medicine_id || '', dosage: log.dosage || '',
                  })}
                  className="flex-1 rounded-lg px-3 py-2 text-xs bg-tg-secondary"
                  style={{ minHeight: 36 }}
                >
                  Изменить
                </button>
                <button
                  type="button" onClick={() => setDeleteId(log.id)}
                  className="flex-1 rounded-lg px-3 py-2 text-xs text-tg-destructive bg-tg-secondary"
                  style={{ minHeight: 36 }}
                >
                  Удалить
                </button>
              </div>
            )}
          </Card>
        ))
      )}

      <BottomSheet open={!!editRow} onClose={() => setEditRow(null)} title="Изменить запись">
        {editRow && (
          <div className="flex flex-col gap-3">
            <FormField label="Дата">
              <input
                type="date" value={editRow.log_date}
                onChange={(e) => setEditRow((f) => ({ ...f, log_date: e.target.value }))}
                className={fieldClass} style={{ minHeight: 44 }}
              />
            </FormField>
            <FormField label="Падёж ест.">
              <NumberStepper value={String(editRow.mortality_natural)} onChange={(v) => setEditRow((f) => ({ ...f, mortality_natural: v }))} />
            </FormField>
            <FormField label="Падёж хал.">
              <NumberStepper value={String(editRow.mortality_halal)} onChange={(v) => setEditRow((f) => ({ ...f, mortality_halal: v }))} />
            </FormField>
            <FormField label="Масса, г/гол">
              <NumberStepper value={String(editRow.weight)} onChange={(v) => setEditRow((f) => ({ ...f, weight: v }))} step={10} suffix="г" />
            </FormField>
            <FormField label="Вода, л">
              <NumberStepper value={String(editRow.water_consumption)} onChange={(v) => setEditRow((f) => ({ ...f, water_consumption: v }))} step={1} suffix="л" />
            </FormField>
            <FormField label="Корм, мешков">
              <NumberStepper value={String(editRow.daily_feed)} onChange={(v) => setEditRow((f) => ({ ...f, daily_feed: v }))} step={0.5} suffix="меш." />
            </FormField>
            <FormField label="Лекарство">
              <select value={editRow.medicine_id} onChange={(e) => setEditRow((f) => ({ ...f, medicine_id: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }}>
                <option value="">-- нет --</option>
                {medicines.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </FormField>
            <button type="button" onClick={saveEdit} className="rounded-xl px-4 py-3 text-base font-semibold bg-tg-button text-tg-button-text" style={{ minHeight: 48 }}>
              Сохранить
            </button>
          </div>
        )}
      </BottomSheet>

      <ConfirmSheet
        open={confirmCritical}
        title="Критические отклонения"
        message="Обнаружены критические отклонения от нормы ROSS-308. Сохранить всё равно?"
        confirmLabel="Сохранить"
        danger={false}
        onConfirm={doInsert}
        onClose={() => setConfirmCritical(false)}
      />
      <ConfirmSheet open={!!deleteId} title="Удалить запись?" onConfirm={doDelete} onClose={() => setDeleteId(null)} />
    </div>
  );
}
```

- [ ] **Step 2: Wire it into `MobileBatchLogPage.jsx`**

Add the import near the other component imports:

```jsx
import MobileJournalTab from './batchLog/MobileJournalTab';
```

Replace the entire `{tab === 'journal' && ( ... )}` block (the read-only version from Task 7) with:

```jsx
      {tab === 'journal' && (
        <MobileJournalTab batch={batch} logs={logs} medicines={medicines} onReload={fetchAll} />
      )}
```

Leave the `expenses`/`sales`/`feed`/`salaries` tab blocks exactly as Task 7 left them.

- [ ] **Step 3: Static self-audit (put in the report)**

Quote the exact lines in `MobileJournalTab.jsx` where:
1. `syncSummaryBatchLog` is called after a successful insert, and show it's reached only when `error` was falsy and skipped when `batch.is_summary` is true.
2. The same for the update path (`saveEdit`) and the delete path (`doDelete`) — including that `doDelete` captures `log.log_date` from the in-memory `logs` array **before** issuing the delete (since the row is gone from the DB afterward, but the client-side `logs` array closure still has it at the time `doDelete` runs — the parent's `logs` prop reference used inside `doDelete` is the one from this render, taken before the delete completes).
3. `mortality` = `mortality_natural + mortality_halal` on both the insert and the edit path.

- [ ] **Step 4: Verify**

Run: `npx eslint src` → back to exactly `20/8/12` (the `medicines` unused-variable concern from Task 7, if it was flagged, is now resolved since `MobileJournalTab` consumes it via props).
Run: `npm run build` → passes.
Run: `npm run dev` + Browser pane. Confirm the MainButton is visible with text "Добавить" when viewing an active batch's journal tab, and hidden when a batch is not active (`javascript_tool`: `window.Telegram.WebApp.MainButton.isVisible`). Trigger the empty-input guard (tap MainButton `_click()` with nothing entered) → `window.alert` fires, no network call (check `read_network_requests` shows no new `daily_logs` POST). If real credentials/data available: add a journal entry on a real active batch, confirm it appears, confirm the desktop `BatchLogPage` for the same batch (or the summary batch's numbers) reflects the change; edit the entry (change the water value), confirm the summary batch's `daily_logs` row for that date updates accordingly; delete the entry, confirm the summary batch's row for that date decreases back down. This is the domain-invariant check equivalent to Foundation's Task 9 verification.

- [ ] **Step 5: Commit**

```bash
git add src/mobile/pages/batchLog/MobileJournalTab.jsx src/mobile/pages/MobileBatchLogPage.jsx
git commit -m "feat(mobile): add journal add/edit/delete with summary batch sync"
```

> Reviewer note: this task writes `daily_logs` on three paths (insert/update/delete). Verify `syncSummaryBatchLog` is reached on all three, guarded correctly by `!batch.is_summary`, and that `mortality` always equals `mortality_natural + mortality_halal`.

---

## Self-Review

**1. Spec coverage**

| Spec section | Task(s) |
|---|---|
| `ConfirmSheet`, `NormBadge`, `Tabs`, `Card` style passthrough | 1 |
| `WeightChart` (recharts) | 2 |
| Отчёт партии — прямой перенос | 3 |
| Цеха — список + CRUD + компактная сводка вместо широкой таблицы | 4 |
| Цеха — детализация как отдельный маршрут `/workshops/:workshopId` (резолюция флага из спеки) | 5 |
| Задачи — счётчики, фильтры в `BottomSheet`, CRUD, цикл статусов | 6 |
| Журнал партии — заголовок, дашборд норма/факт, график, историческое сравнение, вкладки, read-only журнал | 7 |
| Журнал партии — добавление/редактирование/удаление, критические отклонения, домен-инвариант на всех трёх путях | 8 |
| `TelegramApp.jsx` — 4 маршрута меняют компонент + 1 новый | 3, 4, 5, 6, 7 (route changes), 5 (new route) |
| Тестирование — lint/build/`?tg_debug=1`, real-data fallback | все задачи |

**2. Placeholder scan:** no "TBD"/"TODO"/vague instructions. Every step has complete code. The "if your linter flags/doesn't flag X" branch in Task 7 Step 3 is an honest acknowledgment of an ESLint config detail the plan author can't fully predict without running it — it names both outcomes and what to do in each, not a placeholder.

**3. Type consistency:** `MobileJournalTab({batch, logs, medicines, onReload})` — call site in Task 8 Step 2 passes exactly these four props. `ConfirmSheet({open,title,message,confirmLabel,danger,onConfirm,onClose})` used consistently across Tasks 4, 6, 8. `NormBadge({result})` consumes the exact shape `compareWithNorm()` already returns (verified against `src/utils/normComparison.js` usage in the existing `NormIndicator.jsx`/`DashboardNormFact.jsx`). `Tabs({tabs,active,onChange})` used once, in Task 7, matches its Task 1 definition. `Card`'s new `style` prop is additive — Tasks 3, 4, 5, 7 that don't pass `style` are unaffected; Task 6 is the only consumer. RPC field names (`total_feed_cost`, `total_sales`, etc.) verified against `supabase/migrations/20260821150000_fix_summary_report_expense_scope_and_null_summary.sql` and `schema.sql`'s `batch_report` type. `daily_logs`/`tasks`/`workshops` column names verified against `schema.sql`.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-11-telegram-mini-app-b1-daily-cycle.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
