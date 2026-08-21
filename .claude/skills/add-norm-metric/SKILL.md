---
name: add-norm-metric
description: Use when adding a new daily-log field that should be compared against the ROSS-308 broiler standard (e.g. a new measured value that needs an ok/warning/critical deviation badge), or when extending broilerStandards.js / normComparison.js in this repo.
---

# Add a ROSS-308 norm-comparison metric

## Overview
This app's core domain logic is comparing real farm data to the ROSS-308 breed
standard. All such comparisons route through `src/utils/normComparison.js` —
never hardcode ±% thresholds or standard values in a page component.

## When to use
- Adding a new column to `daily_logs` that has a "normal range" (like weight,
  daily feed, water, temp, humidity already do).
- Adding a new derived stat (like mortality or weight forecast) that should
  render with the same ok/warning/critical status styling used elsewhere.

Not for: metrics with no ROSS-308 reference value — those don't need this module.

## Steps

1. **Add the norm data** to `src/constants/broilerStandards.js`.
   - Per-day numeric/range values go on the `ROSS308_STANDARDS` array (one
     object per day, keyed like `weight`, `dailyFeed`, `waterNorm`, or a
     `xMin`/`xMax` pair for range fields like `tempMin`/`tempMax`).
   - Per-week cumulative values (like mortality) get their own lookup object,
     following the `MORTALITY_NORMS_BY_WEEK` pattern, plus a `getWeekXNorm()`
     helper next to `getWeekMortalityNorm`.

2. **Add the comparison** in `src/utils/normComparison.js`.
   - Single-value-vs-day-norm metrics: extend `compareWithNorm(day, field, value)`.
     - Numeric fields (weight/dailyFeed/waterNorm-style) fall through to the
       generic branch that computes `percent` deviation against
       `DEVIATION_THRESHOLDS` (±5% ok, ±15% warning, worse = critical) — just
       add the field's display unit to the `units` map.
     - Range fields (temp/humidity-style) need their own `if (field === '...')`
       branch with an ok range and a wider warn range, same shape as the
       existing `temp`/`humidity` branches.
   - Cumulative-vs-week metrics (mortality-style): write a dedicated function
     following `calcMortality(logs, initialBirds)` — sum the raw logs, look up
     the week norm, classify `ok`/`warning`/`critical`.
   - Series-for-a-chart metrics (weight-forecast-style): follow
     `buildWeightSeries(logs, targetDay)` — one point per day with `actual`,
     `standard`, and (optionally) a linear `forecast`.

3. **Wire it into the UI.**
   - Entry form: `src/pages/DailyEntryPage.jsx` — add the input field, call
     `compareWithNorm` (or your new function) on change/blur, render the
     status badge the same way existing fields do.
   - Report/chart page: `src/pages/BatchReportPage.jsx` if it needs a chart
     (see the existing weight-vs-standard-vs-forecast chart built from
     `buildWeightSeries`).

4. **Don't forget `daily_logs` write side effects** — if this field lives on
   `daily_logs`, any write path must still call
   `syncSummaryBatchLog(logDate, userId)` afterward (see
   `src/utils/summaryBatchSync.js`) or the `is_summary` aggregate batch will
   drift for this field.

## Common mistakes
- Reimplementing a ±% threshold check inline in a page component instead of
  extending `normComparison.js` — breaks the "one source of truth for
  thresholds" invariant and gives this metric different rounding/threshold
  behavior than every other metric.
- Adding the column to `daily_logs` writes without updating
  `summaryBatchSync.js`, so the summary batch silently shows stale/zero data
  for the new field.
