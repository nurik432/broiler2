# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # start Vite dev server
npm run build     # production build
npm run lint      # eslint over the whole repo
npm run preview   # preview a production build locally
```

There is no test suite configured in this repo.

Note: `vite` is aliased to `npm:rolldown-vite@7.1.14` via `package.json` `overrides` — the Rolldown-based build of Vite, not stock Vite.

## Environment

The app is a Vite + React SPA that talks directly to Supabase from the client (no backend server). It requires two env vars (e.g. in `.env.local`, not committed):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_KEY`

See `src/supabaseClient.js`. All data access — auth, reads, writes — goes through this one Supabase client; there is no API layer to intermediate.

Deployed on Vercel; `vercel.json` rewrites all paths to `/index.html` for client-side routing (`react-router-dom`, `BrowserRouter`).

## Architecture

This is a farm-management app for a broiler (meat chicken) operation, UI text in Russian. Domain-driven, not generic CRUD — most logic exists to compare real farm data against the ROSS-308 broiler breed standard.

### Auth & routing flow

`src/main.jsx` wraps `App` in `BrowserRouter`. `App.jsx` owns the Supabase session (`supabase.auth.getSession` / `onAuthStateChange`) and gates all routes: unauthenticated users see `Auth.jsx`; authenticated users get the full `<Routes>` tree, all nested under `MainLayout` (`src/layouts/MainLayout.jsx`), which renders `Sidebar` + a header with logout, and an `<Outlet />` for the active page. New pages must be added both as a `<Route>` in `App.jsx` and a `<NavLink>` in `src/components/Sidebar.jsx`.

### Domain model (Supabase tables referenced from the client)

- **workshops** — physical growing units ("цеха"). Soft-deleted via `is_active` flag, not hard-deleted (`useWorkshops` in `src/hooks/useBatchData.js`).
- **broiler_batches** — a flock raised in a workshop (`workshop_id`), with `initial_quantity`, `start_date`, `is_active`. One special batch per account has `is_summary = true` — an auto-maintained aggregate across all other active batches (see below).
- **daily_logs** — one row per `(batch_id, log_date)` with `age` (day of growth), `mortality` (+ split into `mortality_natural` / `mortality_halal`), `daily_feed`, `water_consumption`, `weight`, and optional `medicine_id`/`dosage`.
- **employees**, **tasks** — staffing and task tracking, each optionally linked to a `workshop` and/or `batch`.
- **medicines**, plus coal/feed/expenses/sales tables backing their respective pages.

### ROSS-308 norm comparison (the core domain logic)

`src/constants/broilerStandards.js` holds the day-by-day ROSS-308 standard table (`ROSS308_STANDARDS`: expected `weight`, `dailyFeed`, `waterNorm`, temp/humidity ranges per day) and weekly cumulative mortality allowances (`MORTALITY_NORMS_BY_WEEK`). `src/utils/normComparison.js` builds on this:
- `compareWithNorm(day, field, value)` — deviation/status (`ok`/`warning`/`critical`) for a single metric on a single day, using `DEVIATION_THRESHOLDS` (±5% ok, ±15% warning, worse = critical).
- `calcMortality(logs, initialBirds)` — cumulative mortality vs. the weekly norm.
- `forecastWeight(logs, targetDay)` — linear projection of live weight to a target slaughter day from the last 5 weighed logs.
- `calcHistoricalMortality(...)` — same-day mortality comparison across past batches in a workshop.

Any feature comparing a daily log value to "what it should be" should route through this module rather than reimplementing thresholds.

### Summary batch sync

`src/utils/summaryBatchSync.js` (`syncSummaryBatchLog(logDate, userId)`) recomputes the `is_summary` batch's `daily_logs` row for a given date by summing that date's logs across all other active batches. It is called after every write in the daily-entry flow (`src/pages/DailyEntryPage.jsx`) so the summary batch always reflects the latest per-workshop entries — if you add another place that writes `daily_logs`, call this afterward too or the summary will drift.

### Data-fetching pattern

Pages don't call Supabase directly for list/detail data where a hook already exists — reuse or extend the hooks in `src/hooks/`:
- `useBatchData(batchId)` / `useWorkshops()` (`src/hooks/useBatchData.js`)
- `useTasks(filters)` / `useEmployees()` (`src/hooks/useTasks.js`)

Each hook follows the same shape: internal `load()` on mount/dependency change, exposed CRUD functions that mutate then re-`load()`, and a `reload` escape hatch. Follow this shape for new hooks rather than ad hoc `useEffect` + `supabase.from(...)` in components.

### Salary calculation

`src/utils/calculateSalary.js` (`calculateSalary(employee, batch)`) computes pay across arbitrary tiered rate periods (`employee.salary_tiers: [{days, rate}]`), falling back to legacy `first_days_n` + `fixed_sum` fields when tiers aren't set. Effective days = calendar days from `start_date` to `min(end_date, batch.batch_end ?? today)`, minus `absent_days`. Preserve this tier/legacy-fallback behavior when touching payroll logic — existing employee records may only have the legacy fields.

### Styling

Tailwind CSS v4 via `@tailwindcss/vite` (config-free, imported with `@import "tailwindcss"` in `src/index.css`). Newer pages (e.g. `Sidebar.jsx`, `MainLayout.jsx`) use Tailwind utility classes; several data-heavy pages (e.g. `DailyEntryPage.jsx`, `WorkshopsPage.jsx`) instead use inline `style={{...}}` objects with a shared informal palette (indigo `#4f46e5` primary, red `#dc3545` danger/mortality, orange `#fd7e14` feed, blue `#007bff` water, green `#28a745` weight/ok). Match whichever convention the surrounding file already uses.

### Excel export

`xlsx` is used for spreadsheet export/import (see `src/pages/BatchesPage.jsx` for the existing pattern) — reuse it rather than adding another spreadsheet library.
