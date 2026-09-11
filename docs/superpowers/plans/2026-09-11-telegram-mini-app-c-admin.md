# Telegram Mini App — C: админ-панель — Implementation Plan

**Goal:** Add role-based branching to `TelegramApp.jsx` and three mobile
admin screens reaching functional parity with `AdminDashboardPage`,
`AdminCreateClientPage`, `AdminClientDetailPage`.

**Architecture:** A new `TelegramAdminLayout` (header + 2-tab bottom nav,
parallel to but independent from the client `TelegramLayout`) wraps three
new pages under `src/mobile/pages/admin/`. `TelegramApp.jsx` gains a small
role-dispatch step after auth succeeds (`session.user.app_metadata.role ===
'admin'`) that picks admin vs. client routes — the existing `run()`/
`LinkingScreen` flow is untouched. `TrendChart.jsx` is reused unmodified
(no Tailwind/desktop dependency). Tables become card lists on mobile (see
spec's "Принятые решения"). No new npm dependencies.

**Tech Stack:** React + Vite (rolldown-vite), react-router-dom, Supabase JS
client, Tailwind v4 utility classes plus `tg-*` custom classes/CSS vars.

**Spec:** [docs/superpowers/specs/2026-09-11-telegram-mini-app-c-admin-design.md](../specs/2026-09-11-telegram-mini-app-c-admin-design.md)

## Global Constraints

- All user-facing text is in Russian, matching the desktop admin pages'
  wording exactly where it's user-facing copy (confirmation prompts, hints).
- All Supabase access goes through the singleton `src/supabaseClient.js`.
- No new npm packages. `TrendChart.jsx` is imported from
  `src/components/admin/TrendChart.jsx` as-is.
- Numbers use `numberFmt = (n) => Number(n || 0).toLocaleString('ru-RU')` —
  no currency symbol for `expenses_total`/`sales_total`, matching the
  desktop admin dashboard/detail pages (unlike the rest of the app's `Intl
  currency` formatter).
- Every write path (RPC call that mutates) follows: perform the call → on
  `error`, show it inline (`actionError`-style banner or inline result,
  matching desktop) → on success, `await load()` to refresh. Destructive
  actions (batch deletion) confirm via `ConfirmSheet`, not `window.confirm`.
- Reuse shared mobile primitives from `src/mobile/components/` — do not
  re-implement their behavior locally.
- Touch targets: `style={{ minHeight: 44 }}` / `48` as established.
- `tg-*` classes/vars per the existing set; `TrendChart`'s own inline
  styles (desktop-agnostic `#hex` colors) are left as-is since it's a
  reused, unmodified component.
- No `useTelegramMainButton` on any of the three screens — all forms are
  always-visible in-page forms, not `BottomSheet`s (matching B3's
  `MobileNotesPage`/`MobileMedicinesPage` decision for the same reason).
- None of this subproject writes to `daily_logs` — the `syncSummaryBatchLog`
  invariant does not apply.
- No test suite exists. Verification per task: `npx eslint src` reports no
  new errors, `npm run build` succeeds, manual check via Browser pane with
  `?tg_debug=1&tg_linked=1` for rendering/regressions (role-gated admin
  content itself needs a real `role: 'admin'` Supabase user to click-through
  live — see spec's "Тестирование" note).

## File Structure

```
src/mobile/
  layouts/
    TelegramAdminLayout.jsx           # NEW
  pages/admin/
    MobileAdminDashboardPage.jsx      # NEW — /
    MobileAdminCreateClientPage.jsx   # NEW — /create-client
    MobileAdminClientDetailPage.jsx   # NEW — /client/:clientId
  telegram/
    useTelegramBackButton.js          # MODIFIED — ROOTS += '/create-client'
  TelegramApp.jsx                     # MODIFIED — role dispatch + admin routes
```

---

### Task 1: Role dispatch + TelegramAdminLayout

**Files:**
- Create: `src/mobile/layouts/TelegramAdminLayout.jsx`
- Modify: `src/mobile/TelegramApp.jsx`, `src/mobile/telegram/useTelegramBackButton.js`

- [ ] **Step 1: `ROOTS` in `useTelegramBackButton.js`**

  Add `'/create-client'` to the `ROOTS` set (alongside `'/'`,
  `'/daily-entry'`, `'/tasks'`) with a one-line comment noting it's shared
  with the admin shell's second top-level tab. `'/'` already covers the
  admin dashboard root — no other change needed here.

- [ ] **Step 2: Create `TelegramAdminLayout.jsx`**

  Mirrors `TelegramLayout.jsx`'s shape but simpler (no `MoreSheet`, no
  3-tab `BottomTabBar` — only 2 destinations, so the nav is inlined here
  rather than a separate component):
  - `TITLES` map: `{ '/': 'Клиенты', '/create-client': 'Новый клиент' }`,
    fallback `pathname.startsWith('/client/') ? 'Клиент' : 'Админ'`.
  - `useTelegramBackButton()` call (same hook, now correctly hides on both
    admin root tabs per Step 1).
  - Header: title left, «Выйти» button right — `onClick={async () => {
    await telegramUnlink(); window.location.reload(); }}`, `text-tg-destructive`.
  - `<Outlet/>` body with the same `paddingBottom` pattern as
    `TelegramLayout.jsx` (room for the fixed bottom nav).
  - Fixed bottom nav, 2 `NavLink`s: `/` "📊 Клиенты" (end), `/create-client`
    "➕ Клиент" — same `fixed bottom-0` / `tg-*` color pattern as
    `BottomTabBar.jsx`.

- [ ] **Step 3: Role dispatch in `TelegramApp.jsx`**

  Add `import { supabase } from '../supabaseClient';` (not currently
  imported here). Rename the existing `AuthedRoutes` function (the
  `<Routes>`/`<Route>` tree for client users) to `ClientRoutes`. Add a new
  `AuthedRoutes` that role-dispatches:
  ```jsx
  function AuthedRoutes() {
    const [isAdmin, setIsAdmin] = useState(null); // null = checking
    useEffect(() => {
      let mounted = true;
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (mounted) setIsAdmin(session?.user?.app_metadata?.role === 'admin');
      });
      return () => { mounted = false; };
    }, []);
    if (isAdmin === null) return <SplashScreen message="Загрузка…" />;
    return isAdmin ? <AdminRoutes /> : <ClientRoutes />;
  }
  ```
  Add `AdminRoutes`:
  ```jsx
  function AdminRoutes() {
    return (
      <Routes>
        <Route element={<TelegramAdminLayout />}>
          <Route path="/" element={<MobileAdminDashboardPage />} />
          <Route path="/create-client" element={<MobileAdminCreateClientPage />} />
          <Route path="/client/:clientId" element={<MobileAdminClientDetailPage />} />
          <Route path="*" element={<MobileAdminDashboardPage />} />
        </Route>
      </Routes>
    );
  }
  ```
  Import `TelegramAdminLayout` and the three new admin pages (Task 2/3
  create the pages — this step's imports will be dangling until then;
  create all files in the same working session before verifying, per the
  usual practice here — no need for a literal per-step build gate).

- [ ] **Step 4: Verify**

  - `npx eslint src` — no new errors (admin page imports will exist by the
    time this step runs, per the note above).
  - `npm run build` — succeeds.
  - Browser pane, `?tg_debug=1&tg_linked=1`: confirm the **client** branch
    (`/`, `/tasks`, etc.) still renders exactly as before — this task must
    not regress the non-admin path. Admin-branch rendering is verified in
    Task 4 once real admin pages exist.

- [ ] **Step 5: Commit** (bundled with Tasks 2–3 — see Task 4's commit step;
  this task alone isn't independently useful since `AdminRoutes` references
  not-yet-created components)

---

### Task 2: MobileAdminDashboardPage + MobileAdminCreateClientPage

**Files:**
- Create: `src/mobile/pages/admin/MobileAdminDashboardPage.jsx`,
  `src/mobile/pages/admin/MobileAdminCreateClientPage.jsx`

- [ ] **Step 1: Create `MobileAdminDashboardPage.jsx`**

  - `load()`: `Promise.all([supabase.rpc('admin_client_summary'),
    supabase.rpc('admin_platform_trend')])`, same error-handling shape as
    desktop (`error`/`trendError` separate so one failing doesn't blank the
    other).
  - `filteredSorted` (`useMemo`): filter by `search` (case-insensitive
    email substring), sort by `email` ascending (fixed — no interactive
    column sort on mobile, see spec).
  - `totals` (`reduce`, same 5 fields as desktop: workshops, activeBatches,
    flock, expenses, sales).
  - Render: `StatGrid` (6 cards: Клиентов, Цехов всего, Активных партий,
    Текущее поголовье, Расходы всего, Продажи всего) → `SectionHeader` +
    3 stacked `TrendChart` (mortality/expenses/sales, `xKey="week_start"`,
    `formatX` = short `day.month` formatter like desktop's
    `shortDateFmt`) → search `<input>` → mapped client `Card`s (`onClick`
    → `navigate('/client/' + c.client_user_id)`) → `EmptyState` when
    `filteredSorted.length === 0`.

- [ ] **Step 2: Create `MobileAdminCreateClientPage.jsx`**

  - `handleSubmit()`: `supabase.rpc('admin_create_client', { client_email:
    email.trim(), client_password: password })`; on success, result banner
    `Клиент создан: ${email} (id: ${data})`, clear fields; on error, red
    banner with `error.message`.
  - Render: `Card` form (email `FormField`, password `FormField`
    `minLength={6}`, submit button) → result banner (green/red) → hint
    paragraph (same copy as desktop: account is active immediately, hand
    credentials to the client manually).

- [ ] **Step 3: Verify**

  - `npx eslint src` — no new errors for these two files specifically (full
    build-wide check happens in Task 4 once `TelegramApp.jsx` wiring is
    complete and importable).

---

### Task 3: MobileAdminClientDetailPage

**Files:**
- Create: `src/mobile/pages/admin/MobileAdminClientDetailPage.jsx`

- [ ] **Step 1: Create `MobileAdminClientDetailPage.jsx`**

  - `load()` (`useCallback`, keyed on `clientId` from `useParams()`):
    `Promise.all([supabase.rpc('admin_client_detail', { target_user_id:
    clientId }), supabase.rpc('admin_client_trend', { target_user_id:
    clientId })])`; reset `selectedBatchIds` on reload.
  - `handleToggleBan(currentlyBanned)` → `admin_set_client_banned` →
    `load()`.
  - `handleResetPassword()` → validates `newPassword.length >= 6` locally
    first (same as desktop) → `admin_reset_client_password` → result
    banner, closes the inline form on success.
  - `handleDeleteAccount()` → guarded by `deleteConfirmText.trim() ===
    detail.profile.email` (button `disabled` otherwise, no separate
    confirm dialog) → `admin_delete_client_account` → `navigate('/')`.
  - `toggleBatch(id)` / `handleDeleteBatches()` → `selectedBatchIds` state,
    delete opens a `ConfirmSheet` (message text = the same detailed
    warning desktop's `window.confirm` uses) → on confirm,
    `admin_delete_batches({ batch_ids: selectedBatchIds })` → `load()`.
  - Render, top to bottom:
    1. Back-to-list is implicit via the Telegram `BackButton` (Task 1) —
       no in-page "← Назад" link needed (unlike desktop, which has no
       native back button to rely on).
    2. `actionError` banner if set.
    3. Profile `Card`: email (large), status badge, registration/last-login
       (`toLocaleString`/`toLocaleDateString('ru-RU')`).
    4. Action buttons: ban/unban, "Сбросить пароль" (toggles inline
       `FormField` + save button), result line.
    5. Danger-zone `Card`: warning copy, confirm-email `<input>`, delete
       button (disabled until match).
    6. `SectionHeader` "Динамика (90 дней)" + 3 stacked `TrendChart`
       (mortality/feed/avg_weight, `xKey="log_date"`).
    7. `SectionHeader` "Цеха (N)" + workshop `Card`s (name, capacity,
       status) or `EmptyState`.
    8. `SectionHeader` "Партии (N)" + "Удалить выбранные (N)" button (own
       row) + batch `Card`s (checkbox, name + summary badge, workshop,
       initial_quantity, dates, status, current_flock, mortality colored,
       last_log_date) or `EmptyState`.
    9. `ConfirmSheet` for batch deletion, mounted once at the bottom.

- [ ] **Step 2: Verify**

  - `npx eslint src` — no new errors for this file specifically.

---

### Task 4: Wire admin routes, full verification, commit

**Files:** none new — wires Tasks 1–3 together (the imports added in Task
1 Step 3 now resolve).

- [ ] **Step 1: Confirm imports in `TelegramApp.jsx`**

  `import TelegramAdminLayout from './layouts/TelegramAdminLayout';`,
  `import MobileAdminDashboardPage from './pages/admin/MobileAdminDashboardPage';`,
  `import MobileAdminCreateClientPage from './pages/admin/MobileAdminCreateClientPage';`,
  `import MobileAdminClientDetailPage from './pages/admin/MobileAdminClientDetailPage';`.

- [ ] **Step 2: Verify**

  - `npx eslint src` — no new errors across the whole repo.
  - `npm run build` — succeeds.
  - Browser pane, `?tg_debug=1&tg_linked=1`:
    - Client branch unaffected: `/`, `/tasks`, `/medicines`, `/notes` still
      render their existing client screens (regression check for Task 1's
      role dispatch).
    - Admin branch renders by code inspection / component mount (a live
      click-through as an actual `role: 'admin'` Supabase user is out of
      reach in this environment per the spec's testing note — note this
      explicitly rather than claiming a full live verification).

- [ ] **Step 3: Commit**

  ```bash
  git add src/mobile/TelegramApp.jsx src/mobile/telegram/useTelegramBackButton.js src/mobile/layouts/TelegramAdminLayout.jsx src/mobile/pages/admin/
  git commit -m "feat(mobile): add Telegram admin panel (C — role dispatch, dashboard, create client, client detail)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
  ```

---

## Post-plan note

After this subproject, every item in the Foundation roadmap (B1/B2/B3/C) is
implemented — the Telegram Mini App reaches full functional parity with the
desktop app for both client and admin roles.
