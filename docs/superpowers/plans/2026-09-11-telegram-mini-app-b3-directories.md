# Telegram Mini App — B3: справочники — Implementation Plan

**Goal:** Replace the two remaining `<MobileStub>` routes (`/medicines`,
`/notes`) in the Telegram Mini App with real mobile screens reaching
functional parity with the desktop `MedicinesPage` (incl. the catalog tab)
and `NotesPage` (text notes; voice notes are playback-only — see spec).

**Architecture:** Two new top-level pages under `src/mobile/pages/`, built
from the existing Foundation/B1/B2 primitives (`Card`, `ConfirmSheet`,
`FormField`, `StatGrid`, `Tabs`, `EmptyState`, `Spinner`) — no new shared
components needed. `MobileMedicinesPage` follows `MobileCoalPage`'s
tabs-plus-inline-form structure with an added medicine dimension and a 4th
catalog tab. All data access goes straight through `src/supabaseClient.js`,
reusing the exact same tables/business logic as the desktop pages, including
the `medicine_images` Storage bucket. No new npm dependencies.

**Tech Stack:** React + Vite (rolldown-vite), react-router-dom, Supabase JS
client, Tailwind v4 utility classes plus the `tg-*` custom classes/CSS vars.

**Spec:** [docs/superpowers/specs/2026-09-11-telegram-mini-app-b3-directories-design.md](../specs/2026-09-11-telegram-mini-app-b3-directories-design.md)

## Global Constraints

- All user-facing text is in Russian, matching the desktop pages' wording.
- All Supabase access goes through the singleton `src/supabaseClient.js`.
- No new npm packages.
- Currency is always formatted with `new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'TJS' }).format(value || 0)`.
- Every write path follows the pattern established in B1/B2:
  `const { data: { user } } = await supabase.auth.getUser();` → if `!user`,
  `window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return;`
  → perform the write → on Supabase error, `window.alert('Ошибка: ' + error.message)`
  → on success, reload the page's data. Use `window.alert`, never bare `alert`.
- Reuse shared mobile primitives from `src/mobile/components/` — do not
  re-implement their behavior locally.
- Touch targets: `style={{ minHeight: 44 }}` (secondary/compact controls) or
  `48` (primary buttons, key inputs).
- `tg-*` color classes/vars per the existing set (`bg-tg-section`,
  `bg-tg-secondary`, `text-tg-text`, `text-tg-hint`, `text-tg-destructive`,
  `bg-tg-button`/`text-tg-button-text`); one-off accent colors follow the
  informal palette in `CLAUDE.md` (`#007bff` purchase/blue, `#fd7e14`
  debt/orange, `#28a745` payment/green, `#dc3545` danger/red).
- No `useTelegramMainButton` on either screen — see spec's "Принятые
  решения" (both screens use always-visible in-page forms, not a
  `BottomSheet`).
- Neither screen writes to `daily_logs` — the `syncSummaryBatchLog`
  invariant does not apply here.
- No test suite exists. Verification per task: `npx eslint src` reports no
  new errors, `npm run build` succeeds, manual check via Browser pane with
  `?tg_debug=1&tg_linked=1`.

## File Structure

```
src/mobile/
  pages/
    MobileMedicinesPage.jsx   # NEW — /medicines
    MobileNotesPage.jsx       # NEW — /notes
  TelegramApp.jsx             # MODIFIED — 2 routes + 2 imports
```

---

### Task 1: MobileMedicinesPage

**Files:**
- Create: `src/mobile/pages/MobileMedicinesPage.jsx`
- Modify: `src/mobile/TelegramApp.jsx`

**Data model:** `medicine_transactions` (purchase/debt/payment ledger,
`medicine_id` FK, `batch_id` FK optional), `medicines` (catalog: `name`,
`description`, `image_url`), `broiler_batches` (active, non-summary, for the
batch picker) — see spec's "Данные" section for exact query shapes.

- [ ] **Step 1: Create `MobileMedicinesPage.jsx`**

  Structure (mirrors `MobileCoalPage.jsx`, see that file for the exact
  write-path/fetch/JSX conventions to copy):
  - `fetchData()`: `Promise.all` of the three queries above.
  - `filteredTransactions` (`useMemo`, hides `is_hidden` unless toggled).
  - `summary` (`useMemo`): `total_purchased`, `total_debt`, `total_paid`,
    `current_balance = total_debt - total_paid` — from filtered transactions.
  - `activeTab` state: `'purchase' | 'debt' | 'payment' | 'catalog'`.
  - `txnForm` (purchase/debt): `{ transaction_date, medicine_id, quantity,
    unit, price_per_unit, description, company, batch_id }`.
  - `paymentForm`: `{ transaction_date, medicine_id, amount, description }`.
  - `catalogForm`: `{ name, description, imageFile }`.
  - `submitTxn()` — insert into `medicine_transactions` with
    `transaction_type: activeTab`, `amount = quantity * price_per_unit`,
    reject if `amount <= 0`.
  - `submitPayment()` — insert `transaction_type: 'payment'`, `medicine_id`
    optional (null = "Общая оплата"), `description` default `'Оплата за
    лекарства'`.
  - `toggleHidden(t)` — `update({ is_hidden: !t.is_hidden })`.
  - `submitCatalog()` — if `catalogForm.imageFile`, upload to
    `supabase.storage.from('medicine_images')` with a
    `${Date.now()}_${file.name}` key first, get its `getPublicUrl(...).data.publicUrl`,
    then insert into `medicines` with `{ name, description, image_url, user_id }`.
  - `confirmTarget` state `{ type: 'txn' | 'medicine', id, imageUrl? }` — one
    shared `ConfirmSheet` for both transaction delete and catalog-item
    delete; deleting a medicine with an `image_url` also removes the file
    from the `medicine_images` bucket (mirror `MedicineCatalog.jsx`'s
    `handleDelete`: `imageUrl.substring(imageUrl.lastIndexOf('/') + 1)` as
    the storage key).
  - Render: `StatGrid` (4 cards) → `Tabs` (4 tabs) → if `activeTab ===
    'catalog'`: add-medicine `Card` form + list of medicine `Card`s
    (64×64 thumbnail or 💊 placeholder, name, description, delete button) —
    else: "показать скрытые" checkbox → form `Card` (purchase/debt fields or
    payment fields, branching like `MobileCoalPage`) → transaction history
    `Card` list (badge, date, medicine name, qty/price, description, signed
    amount, 👁️/🙈 + 🗑 buttons) → `ConfirmSheet` at the bottom.

- [ ] **Step 2: Wire the `/medicines` route**

  In `src/mobile/TelegramApp.jsx`: add
  `import MobileMedicinesPage from './pages/MobileMedicinesPage';` and
  replace `<Route path="/medicines" element={<MobileStub title="Лекарства" />} />`
  with `<Route path="/medicines" element={<MobileMedicinesPage />} />`.

- [ ] **Step 3: Verify**

  - `npx eslint src` — no new errors vs. the pre-existing baseline.
  - `npm run build` — succeeds.
  - Browser pane: `http://localhost:5173/?tg_debug=1&tg_linked=1`, navigate
    to `/medicines` (via "Ещё" → "Справочники" → "Лекарства" or direct URL).
    Check: `StatGrid` renders, all 4 tabs switch, purchase/debt/payment
    forms show their fields, catalog tab shows the add-form and (if any)
    existing medicines, empty states render if the connected Supabase
    project has no data yet.

- [ ] **Step 4: Commit**

  ```bash
  git add src/mobile/pages/MobileMedicinesPage.jsx src/mobile/TelegramApp.jsx
  git commit -m "feat(mobile): add MobileMedicinesPage (purchase/debt/payment + catalog)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
  ```

---

### Task 2: MobileNotesPage

**Files:**
- Create: `src/mobile/pages/MobileNotesPage.jsx`
- Modify: `src/mobile/TelegramApp.jsx`

**Data model:** `notes` — `{ id, content, user_id, type: 'text'|'voice',
audio_url, created_at }`. No recording UI on mobile (see spec's "Вне рамок")
— existing voice notes are still playable via `<audio>`.

- [ ] **Step 1: Create `MobileNotesPage.jsx`**

  - `fetchNotes()` — `supabase.from('notes').select('*').order('created_at', { ascending: false })`.
  - `submitNote()` — insert `{ content, user_id, type: 'text' }`, reject if
    `content.trim()` is empty.
  - `confirmDelete()` — if `confirmTarget.audioUrl` starts with `'http'`
    (Storage variant, not base64), remove it from the `voice-notes` bucket
    first (`audioUrl.split('/voice-notes/')[1]` as the key), then delete the
    `notes` row.
  - Render: `Card` form (`<textarea>` + "💾 Сохранить" button, disabled
    while empty/submitting, hint line about voice notes being web-only) →
    mapped `Card` list (newest first): content text (🎤 prefix if
    `type==='voice'`), `<audio controls>` if `audio_url` present, formatted
    `created_at`, 🗑 delete button → `EmptyState` (📝) when empty →
    `ConfirmSheet` at the bottom.

- [ ] **Step 2: Wire the `/notes` route**

  In `src/mobile/TelegramApp.jsx`: add
  `import MobileNotesPage from './pages/MobileNotesPage';` and replace
  `<Route path="/notes" element={<MobileStub title="Заметки" />} />` with
  `<Route path="/notes" element={<MobileNotesPage />} />`.

- [ ] **Step 3: Verify**

  - `npx eslint src` — no new errors.
  - `npm run build` — succeeds.
  - Browser pane: `/notes` route, add a text note, confirm it appears,
    confirm delete flow opens the `ConfirmSheet` and removes it, empty state
    renders correctly when there's no data.

- [ ] **Step 4: Commit**

  ```bash
  git add src/mobile/pages/MobileNotesPage.jsx src/mobile/TelegramApp.jsx
  git commit -m "feat(mobile): add MobileNotesPage (text notes, playback for existing voice notes)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
  ```

---

## Post-plan note

After this plan, every route in `TelegramApp.jsx` renders a real screen —
no `<MobileStub>` remains outside the admin branch. Only **C** (admin panel
under `TelegramAdminApp`) remains from the Foundation roadmap.
