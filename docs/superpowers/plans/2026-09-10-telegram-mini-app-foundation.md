# Telegram Mini App — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the mobile Telegram Mini App shell — platform switch, `initData` auto-login, native theme, bottom-tab navigation — with two working screens (Batches, Daily Entry), leaving the other routes as stubs.

**Architecture:** `src/App.jsx` becomes a one-line platform switch: inside Telegram it renders a new `src/mobile/` tree (own `<Routes>` mirroring desktop paths, own layout, own auth gate); outside Telegram the current app moves verbatim into `src/DesktopApp.jsx`. Auth is a Supabase Edge Function that verifies Telegram `initData` HMAC and mints a real session via `admin.generateLink` → client `verifyOtp`. Domain logic (`src/hooks`, `src/utils`, `src/constants`, `src/supabaseClient.js`) is shared unchanged.

**Tech Stack:** Vite (rolldown-vite) + React 19, react-router-dom 7, Tailwind CSS v4 (`@tailwindcss/vite`, config-free), Supabase JS v2, Supabase Edge Functions (Deno), Telegram `telegram-web-app.js` SDK.

**Spec:** `docs/superpowers/specs/2026-09-10-telegram-mini-app-foundation-design.md`

## Global Constraints

- **UI language:** Russian. All user-facing strings in Russian.
- **Do not modify:** `src/pages/**`, `src/hooks/**`, `src/utils/**`, `src/constants/**`, `src/components/**`, `src/layouts/MainLayout.jsx`, `src/layouts/AdminLayout.jsx`, `vercel.json`. The desktop path must be byte-for-byte equivalent after Task 4.
- **Vite is `npm:rolldown-vite@7.1.14`** via `package.json` `overrides` — do not run `npm install vite` or change the override.
- **No JS test runner in this repo** and none is being added. Client-side tasks are verified by `npm run lint`, `npm run build`, and scripted manual checks in the Browser pane using the `?tg_debug=1` harness. The Edge Function (Deno) is verified with `deno test`.
- **Tailwind v4:** utilities only, no `tailwind.config.js`. Theme tokens are declared with `@theme` in `src/index.css`.
- **Supabase client is a singleton** from `src/supabaseClient.js` (`import { supabase }`). Never call `createClient` in client code.
- **Domain invariant:** any code that writes `daily_logs` MUST call `syncSummaryBatchLog(logDate, userId)` from `src/utils/summaryBatchSync.js` afterward (Task 10).
- **Telegram HMAC:** `secret_key = HMAC_SHA256(key="WebAppData", msg=<bot_token>)`, then valid iff `hex(HMAC_SHA256(key=secret_key, msg=data_check_string)) === hash`. Reject if `now - auth_date > 86400` seconds.
- **Dev server:** `npm run dev` on port 5173 (`.claude/launch.json` name `broiler-dev`).
- **Commit after every task.** Conventional Commit messages, present tense.

---

## File Structure

**New — Supabase backend:**
| File | Responsibility |
|---|---|
| `supabase/migrations/20260910120000_create_telegram_links.sql` | `telegram_links` table + unique indexes + RLS (read-own only) |
| `supabase/functions/_shared/cors.ts` | CORS headers + OPTIONS preflight helper |
| `supabase/functions/telegram-auth/verify.ts` | Pure `initData` parse + HMAC verify + `auth_date` freshness |
| `supabase/functions/telegram-auth/verify.test.ts` | `deno test` for `verify.ts` (valid / tampered / stale / bad shape) |
| `supabase/functions/telegram-auth/index.ts` | HTTP handler: `action: "login"` and `action: "link"` |

**New — client shell (`src/mobile/`):**
| File | Responsibility |
|---|---|
| `src/DesktopApp.jsx` | The current `App.jsx` body, moved verbatim |
| `src/mobile/telegram/context.js` | `isTelegram()`, `getWebApp()`, `getInitDataRaw()`, `isDevMock()` |
| `src/mobile/telegram/mockTelegram.js` | `installTelegramMock()` — fake `window.Telegram.WebApp` for `?tg_debug=1` |
| `src/mobile/telegram/sdk.js` | `initTelegram()` — `ready`/`expand`/header colors |
| `src/mobile/telegram/theme.js` | `applyThemeParams()`, `subscribeTheme()` |
| `src/mobile/telegram/auth.js` | `telegramSignIn()`, `telegramLink(email, password)` |
| `src/mobile/telegram/useTelegramBackButton.js` | Show native BackButton on non-tab routes → `navigate(-1)` |
| `src/mobile/telegram/useTelegramMainButton.js` | Drive native MainButton from a screen |
| `src/mobile/telegram/useTelegramHaptics.js` | `notifySuccess()` / `impactLight()` (no-op if unavailable) |
| `src/mobile/TelegramApp.jsx` | Theme provider + `TelegramAuthGate` + `<Routes>` under `TelegramLayout` |
| `src/mobile/screens/SplashScreen.jsx` | Full-screen logo + spinner |
| `src/mobile/screens/LinkingScreen.jsx` | One-time email/password link form |
| `src/mobile/screens/AuthErrorScreen.jsx` | Auth failure + retry |
| `src/mobile/screens/MobileStub.jsx` | Placeholder for not-yet-built routes |
| `src/mobile/layouts/TelegramLayout.jsx` | Header + scroll `<main>` + `BottomTabBar` |
| `src/mobile/layouts/BottomTabBar.jsx` | 4 tabs + «Ещё» |
| `src/mobile/layouts/MoreSheet.jsx` | Grouped sheet of remaining sections + «Выйти» |
| `src/mobile/pages/MobileBatchesPage.jsx` | Root screen — batches as cards |
| `src/mobile/pages/MobileDailyEntryPage.jsx` | Daily-entry form, MainButton save, summary sync |
| `src/mobile/components/Card.jsx` | Rounded section container (`--tg-section-bg`) |
| `src/mobile/components/ListRow.jsx` | label / value / optional chevron row |
| `src/mobile/components/SectionHeader.jsx` | Uppercase group header |
| `src/mobile/components/StatusPill.jsx` | Colored ok/warning/critical/neutral pill |
| `src/mobile/components/EmptyState.jsx` | Centered icon + message |
| `src/mobile/components/Spinner.jsx` | CSS spinner on `--tg-hint` |
| `src/mobile/components/FormField.jsx` | Label + large input (≥44px) |
| `src/mobile/components/NumberStepper.jsx` | `− [value] +` numeric control |
| `src/mobile/components/SegmentedControl.jsx` | Single-select segmented buttons |
| `src/mobile/components/BottomSheet.jsx` | Portal + backdrop + slide-up panel |
| `docs/telegram-mini-app.md` | BotFather setup, secrets, deploy steps |

**Modified:**
| File | Change |
|---|---|
| `src/App.jsx` | Reduced to the platform switch |
| `src/main.jsx` | Call `installTelegramMock()` before render (dev-only, guarded) |
| `index.html` | Add Telegram SDK `<script>` in `<head>` |
| `src/index.css` | `@theme` block mapping `--color-tg-*` → `var(--tg-*)` + base `body` rule |
| `CLAUDE.md` | Paragraph describing `src/mobile/` and the platform switch |

---

## Task 1: `telegram_links` migration

**Files:**
- Create: `supabase/migrations/20260910120000_create_telegram_links.sql`

**Interfaces:**
- Produces: table `public.telegram_links(tg_id bigint pk, user_id uuid, email text, tg_username text, created_at timestamptz, updated_at timestamptz)`; RLS policy `read own telegram link` (SELECT, `user_id = auth.uid()`); no write policies (service_role only).

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/20260910120000_create_telegram_links.sql
-- Maps a Telegram user id to a Supabase auth user. Written only by the
-- telegram-auth Edge Function (service_role); an authenticated user may
-- read their own row (for a future "unlink" screen).

create table if not exists public.telegram_links (
    tg_id       bigint primary key,
    user_id     uuid not null references auth.users (id) on delete cascade,
    email       text not null,
    tg_username text,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create unique index if not exists telegram_links_user_id_key
    on public.telegram_links (user_id);

alter table public.telegram_links enable row level security;

drop policy if exists "read own telegram link" on public.telegram_links;
create policy "read own telegram link" on public.telegram_links
    for select to authenticated
    using (user_id = auth.uid());

grant select on public.telegram_links to authenticated;
```

- [ ] **Step 2: Verify SQL parses**

Run: `npx supabase migrations list` (lists local migration files; confirms the timestamp/name are well-formed)
Expected: the new file appears in the list with no parse error. If the Supabase CLI is not installed or not linked, instead run `node -e "require('fs').readFileSync('supabase/migrations/20260910120000_create_telegram_links.sql','utf8')"` and manually re-read the SQL against the spec §"Таблица telegram_links".

Note: the two `Broiler app` Supabase projects are currently `INACTIVE`. This migration is applied at deploy time (documented in Task 11), not now.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260910120000_create_telegram_links.sql
git commit -m "feat(db): add telegram_links table for Mini App auth"
```

---

## Task 2: Telegram `initData` verification (Deno, TDD)

**Files:**
- Create: `supabase/functions/telegram-auth/verify.ts`
- Test: `supabase/functions/telegram-auth/verify.test.ts`

**Interfaces:**
- Produces:
  - `export interface TelegramUser { id: number; username?: string; first_name?: string; last_name?: string }`
  - `export interface VerifyResult { ok: true; user: TelegramUser; authDate: number } | { ok: false; reason: "bad_format" | "bad_hash" | "stale" }`
  - `export async function verifyInitData(initData: string, botToken: string, maxAgeSeconds?: number): Promise<VerifyResult>` — default `maxAgeSeconds = 86400`.
  - `export async function signInitData(params: Record<string,string>, botToken: string): Promise<string>` — test helper that builds a correctly-signed `initData` query string (used by the test and by `docs`).

- [ ] **Step 1: Write the failing tests**

```ts
// supabase/functions/telegram-auth/verify.test.ts
import { assertEquals } from "jsr:@std/assert@1";
import { signInitData, verifyInitData } from "./verify.ts";

const BOT_TOKEN = "123456:TEST-abcdefghijklmnopqrstuvwxyz";

function baseParams(authDateSec: number) {
  return {
    auth_date: String(authDateSec),
    query_id: "AAABBBCCC",
    user: JSON.stringify({ id: 42, username: "farmer", first_name: "Иван" }),
  };
}

Deno.test("accepts a correctly signed, fresh initData", async () => {
  const now = Math.floor(Date.now() / 1000);
  const initData = await signInitData(baseParams(now), BOT_TOKEN);
  const res = await verifyInitData(initData, BOT_TOKEN);
  assertEquals(res.ok, true);
  if (res.ok) {
    assertEquals(res.user.id, 42);
    assertEquals(res.user.username, "farmer");
  }
});

Deno.test("rejects a tampered hash", async () => {
  const now = Math.floor(Date.now() / 1000);
  const initData = await signInitData(baseParams(now), BOT_TOKEN);
  const broken = initData.replace(/hash=[0-9a-f]+/, "hash=deadbeef");
  const res = await verifyInitData(broken, BOT_TOKEN);
  assertEquals(res, { ok: false, reason: "bad_hash" });
});

Deno.test("rejects a stale auth_date", async () => {
  const old = Math.floor(Date.now() / 1000) - 90_000; // > 86400
  const initData = await signInitData(baseParams(old), BOT_TOKEN);
  const res = await verifyInitData(initData, BOT_TOKEN);
  assertEquals(res, { ok: false, reason: "stale" });
});

Deno.test("rejects wrong bot token", async () => {
  const now = Math.floor(Date.now() / 1000);
  const initData = await signInitData(baseParams(now), BOT_TOKEN);
  const res = await verifyInitData(initData, "999:OTHER");
  assertEquals(res, { ok: false, reason: "bad_hash" });
});

Deno.test("rejects missing hash / bad format", async () => {
  const res = await verifyInitData("user=%7B%7D&auth_date=1", BOT_TOKEN);
  assertEquals(res, { ok: false, reason: "bad_format" });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `deno test supabase/functions/telegram-auth/verify.test.ts --allow-none`
Expected: FAIL — `Module not found "./verify.ts"` / `signInitData is not a function`.

- [ ] **Step 3: Implement `verify.ts`**

```ts
// supabase/functions/telegram-auth/verify.ts
export interface TelegramUser {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export type VerifyResult =
  | { ok: true; user: TelegramUser; authDate: number }
  | { ok: false; reason: "bad_format" | "bad_hash" | "stale" };

const enc = new TextEncoder();

async function hmacSha256(keyBytes: Uint8Array, msg: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return new Uint8Array(sig);
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function dataCheckString(params: URLSearchParams): string {
  const pairs: string[] = [];
  for (const [k, v] of params) {
    if (k === "hash") continue;
    pairs.push(`${k}=${v}`);
  }
  pairs.sort();
  return pairs.join("\n");
}

export async function verifyInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds = 86_400,
): Promise<VerifyResult> {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return { ok: false, reason: "bad_format" };
  }
  const hash = params.get("hash");
  const authDateRaw = params.get("auth_date");
  if (!hash || !authDateRaw) return { ok: false, reason: "bad_format" };

  const secretKey = await hmacSha256(enc.encode("WebAppData"), botToken);
  const expected = toHex(await hmacSha256(secretKey, dataCheckString(params)));
  if (expected !== hash) return { ok: false, reason: "bad_hash" };

  const authDate = Number(authDateRaw);
  if (!Number.isFinite(authDate)) return { ok: false, reason: "bad_format" };
  if (Math.floor(Date.now() / 1000) - authDate > maxAgeSeconds) {
    return { ok: false, reason: "stale" };
  }

  let user: TelegramUser;
  try {
    user = JSON.parse(params.get("user") ?? "null");
    if (!user || typeof user.id !== "number") {
      return { ok: false, reason: "bad_format" };
    }
  } catch {
    return { ok: false, reason: "bad_format" };
  }
  return { ok: true, user, authDate };
}

// Test/documentation helper: build a correctly signed initData string.
export async function signInitData(
  params: Record<string, string>,
  botToken: string,
): Promise<string> {
  const sp = new URLSearchParams(params);
  const secretKey = await hmacSha256(enc.encode("WebAppData"), botToken);
  const hash = toHex(await hmacSha256(secretKey, dataCheckString(sp)));
  sp.set("hash", hash);
  return sp.toString();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `deno test supabase/functions/telegram-auth/verify.test.ts --allow-none`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/telegram-auth/verify.ts supabase/functions/telegram-auth/verify.test.ts
git commit -m "feat(edge): add Telegram initData HMAC verification with tests"
```

---

## Task 3: `telegram-auth` Edge Function handler

**Files:**
- Create: `supabase/functions/_shared/cors.ts`
- Create: `supabase/functions/telegram-auth/index.ts`

**Interfaces:**
- Consumes: `verifyInitData`, `TelegramUser` from `./verify.ts` (Task 2).
- Produces — HTTP endpoint `POST /functions/v1/telegram-auth`, JSON body:
  - `{ action: "login", initData: string }` → `200 { linked: true, token_hash: string, email: string }` or `200 { linked: false }` or `401 { error: string }`.
  - `{ action: "link", initData: string }` with header `Authorization: Bearer <supabase access_token>` → `200 { ok: true }` or `401 { error }`.
  - `OPTIONS` → `204` with CORS headers.
- Env: `TELEGRAM_BOT_TOKEN` (secret), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (auto-injected), `ALLOWED_ORIGIN` (secret, e.g. the Vercel domain; `*` acceptable for first bring-up).

- [ ] **Step 1: Write `_shared/cors.ts`**

```ts
// supabase/functions/_shared/cors.ts
const ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "*";

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function preflight(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  return null;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
```

- [ ] **Step 2: Write `telegram-auth/index.ts`**

```ts
// supabase/functions/telegram-auth/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyInitData } from "./verify.ts";
import { corsHeaders, json, preflight } from "../_shared/cors.ts";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: { action?: string; initData?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_body" }, 400);
  }
  const { action, initData } = body;
  if (!initData || (action !== "login" && action !== "link")) {
    return json({ error: "bad_request" }, 400);
  }

  const v = await verifyInitData(initData, BOT_TOKEN);
  if (!v.ok) return json({ error: `initdata_${v.reason}` }, 401);
  const tgId = v.user.id;

  if (action === "login") {
    const { data: link, error } = await admin
      .from("telegram_links")
      .select("user_id, email")
      .eq("tg_id", tgId)
      .maybeSingle();
    if (error) return json({ error: "db_error" }, 500);
    if (!link) return json({ linked: false });

    const { data: gen, error: genErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: link.email,
    });
    if (genErr || !gen?.properties?.hashed_token) {
      return json({ error: "link_gen_failed" }, 500);
    }
    return json({
      linked: true,
      token_hash: gen.properties.hashed_token,
      email: link.email,
    });
  }

  // action === "link": caller already signed in with email/password.
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "missing_token" }, 401);

  const { data: userRes, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userRes?.user) return json({ error: "bad_token" }, 401);
  const user = userRes.user;

  const { error: upsertErr } = await admin.from("telegram_links").upsert(
    {
      tg_id: tgId,
      user_id: user.id,
      email: user.email,
      tg_username: v.user.username ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tg_id" },
  );
  if (upsertErr) return json({ error: "db_error" }, 500);
  return json({ ok: true });
}, { onListen: undefined });

// keep corsHeaders referenced for tooling that tree-shakes unused imports
void corsHeaders;
```

- [ ] **Step 3: Type-check the function**

Run: `deno check supabase/functions/telegram-auth/index.ts`
Expected: no type errors. (Network import of `esm.sh/@supabase/supabase-js@2` will be fetched; allow it.)

- [ ] **Step 4: Smoke-test locally (optional, only if Docker + Supabase CLI available)**

Run:
```bash
TELEGRAM_BOT_TOKEN=123456:TEST npx supabase functions serve telegram-auth --no-verify-jwt
```
In another shell, build a signed `initData` with the `signInitData` helper and `curl` the `login` action; expect `{ "linked": false }` (no row yet).
If Docker is unavailable, skip — Task 11 covers real deployment and the handler logic is exercised by Task 2's verification plus manual matrix later.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/cors.ts supabase/functions/telegram-auth/index.ts
git commit -m "feat(edge): add telegram-auth function (login + link actions)"
```

---

## Task 4: Platform switch + Telegram context detection

**Files:**
- Create: `src/DesktopApp.jsx`
- Create: `src/mobile/telegram/context.js`
- Create: `src/mobile/telegram/mockTelegram.js`
- Create: `src/mobile/TelegramApp.jsx` (minimal placeholder in this task)
- Modify: `src/App.jsx`
- Modify: `src/main.jsx`

**Interfaces:**
- Produces:
  - `context.js`: `isTelegram(): boolean`, `getWebApp(): TelegramWebApp | null`, `getInitDataRaw(): string`, `isDevMock(): boolean`.
  - `mockTelegram.js`: `installTelegramMock(): void` — when `import.meta.env.DEV` and `location.search` contains `tg_debug=1`, sets `window.Telegram.WebApp` to a fake with `initData`, `initDataUnsafe`, `themeParams`, `colorScheme`, `ready()`, `expand()`, `onEvent()`, `offEvent()`, `BackButton`, `MainButton`, `HapticFeedback` stubs, and `__mock = true`.
  - `TelegramApp.jsx`: default export React component (placeholder text `TG shell` in this task).

- [ ] **Step 1: Move current `App.jsx` body into `DesktopApp.jsx`**

Copy `src/App.jsx` verbatim to `src/DesktopApp.jsx`, then rename the component and default export from `App` to `DesktopApp`. No other changes.

```jsx
// src/DesktopApp.jsx
import { useState, useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { supabase } from './supabaseClient';

import Auth from './components/Auth';
import MainLayout from './layouts/MainLayout';
import AdminLayout from './layouts/AdminLayout';
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import AdminCreateClientPage from './pages/admin/AdminCreateClientPage';
import AdminClientDetailPage from './pages/admin/AdminClientDetailPage';
import BatchesPage from './pages/BatchesPage';
import MedicinesPage from './pages/MedicinesPage';
import BatchLogPage from './pages/BatchLogPage';
import ExpensesPage from './pages/ExpensesPage';
import SalariesPage from './pages/SalariesPage';
import NotesPage from './pages/NotesPage';
import SalesPage from './pages/SalesPage';
import FeedPage from './pages/FeedPage';
import BatchReportPage from './pages/BatchReportPage';
import CoalPage from './pages/CoalPage';
import WorkshopsPage from './pages/WorkshopsPage';
import TasksPage from './pages/TasksPage';
import DailyEntryPage from './pages/DailyEntryPage';
import DebtsPage from './pages/DebtsPage';

function DesktopApp() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      setLoading(false);
    };
    fetchSession();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Загрузка...</div>;
  }
  if (!session) {
    return <Auth />;
  }

  const isAdmin = session.user?.app_metadata?.role === 'admin';

  if (isAdmin) {
    return (
      <Routes>
        <Route element={<AdminLayout />}>
          <Route path="/" element={<AdminDashboardPage />} />
          <Route path="/create-client" element={<AdminCreateClientPage />} />
          <Route path="/client/:clientId" element={<AdminClientDetailPage />} />
          <Route path="*" element={<AdminDashboardPage />} />
        </Route>
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<BatchesPage />} />
        <Route path="/medicines" element={<MedicinesPage />} />
        <Route path="/expenses" element={<ExpensesPage />} />
        <Route path="/salaries" element={<SalariesPage />} />
        <Route path="/batch/:batchId" element={<BatchLogPage />} />
        <Route path="/notes" element={<NotesPage />} />
        <Route path="/sales" element={<SalesPage />} />
        <Route path="/feed" element={<FeedPage />} />
        <Route path="/batch/:batchId/report" element={<BatchReportPage />} />
        <Route path="/coal" element={<CoalPage />} />
        <Route path="/workshops" element={<WorkshopsPage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/daily-entry" element={<DailyEntryPage />} />
        <Route path="/debts" element={<DebtsPage />} />
      </Route>
    </Routes>
  );
}

export default DesktopApp;
```

- [ ] **Step 2: Write `context.js`**

```js
// src/mobile/telegram/context.js
export function getWebApp() {
  return (typeof window !== 'undefined' && window.Telegram && window.Telegram.WebApp) || null;
}

export function getInitDataRaw() {
  const wa = getWebApp();
  return (wa && typeof wa.initData === 'string') ? wa.initData : '';
}

export function isDevMock() {
  const wa = getWebApp();
  return !!(wa && wa.__mock);
}

export function isTelegram() {
  return getInitDataRaw().length > 0;
}
```

- [ ] **Step 3: Write `mockTelegram.js`**

```js
// src/mobile/telegram/mockTelegram.js
// Dev-only fake Telegram WebApp so the mobile shell can run in a plain browser.
// Activate with ?tg_debug=1  (optionally &tg_linked=1 and &tg_dark=1).

function makeButton() {
  const handlers = new Set();
  return {
    isVisible: false, text: '', isActive: true, isProgressVisible: false,
    show() { this.isVisible = true; }, hide() { this.isVisible = false; },
    setText(t) { this.text = t; }, enable() { this.isActive = true; },
    disable() { this.isActive = false; },
    showProgress() { this.isProgressVisible = true; },
    hideProgress() { this.isProgressVisible = false; },
    onClick(fn) { handlers.add(fn); }, offClick(fn) { handlers.delete(fn); },
    setParams(p) { if (p.text != null) this.text = p.text; },
    _click() { handlers.forEach((h) => h()); },
  };
}

export function installTelegramMock() {
  if (!import.meta.env.DEV) return;
  const params = new URLSearchParams(window.location.search);
  if (params.get('tg_debug') !== '1') return;
  if (window.Telegram && window.Telegram.WebApp) return;

  const dark = params.get('tg_dark') === '1';
  const eventHandlers = {};
  const user = { id: 42, username: 'farmer', first_name: 'Иван' };
  const initDataUnsafe = { user, auth_date: Math.floor(Date.now() / 1000), query_id: 'MOCK' };

  window.Telegram = {
    WebApp: {
      __mock: true,
      // The signature is bogus; auth.js short-circuits the network call in mock mode.
      initData: 'user=' + encodeURIComponent(JSON.stringify(user)) +
        '&auth_date=' + initDataUnsafe.auth_date + '&hash=mock',
      initDataUnsafe,
      colorScheme: dark ? 'dark' : 'light',
      themeParams: dark
        ? { bg_color: '#18222d', text_color: '#ffffff', hint_color: '#7d8b99',
            link_color: '#6ab3f3', button_color: '#5288c1', button_text_color: '#ffffff',
            secondary_bg_color: '#131c26', section_bg_color: '#212d3b',
            destructive_text_color: '#ec3942' }
        : { bg_color: '#ffffff', text_color: '#000000', hint_color: '#999999',
            link_color: '#2481cc', button_color: '#2481cc', button_text_color: '#ffffff',
            secondary_bg_color: '#f1f1f1', section_bg_color: '#ffffff',
            destructive_text_color: '#df3f40' },
      isExpanded: true,
      ready() {}, expand() {}, close() {},
      disableVerticalSwipes() {},
      setHeaderColor() {}, setBackgroundColor() {},
      onEvent(name, fn) { (eventHandlers[name] ||= new Set()).add(fn); },
      offEvent(name, fn) { eventHandlers[name]?.delete(fn); },
      BackButton: makeButton(),
      MainButton: makeButton(),
      HapticFeedback: { impactOccurred() {}, notificationOccurred() {}, selectionChanged() {} },
      _mockLinked: params.get('tg_linked') === '1',
    },
  };
}
```

- [ ] **Step 4: Write minimal `TelegramApp.jsx`**

```jsx
// src/mobile/TelegramApp.jsx
export default function TelegramApp() {
  return (
    <div style={{ padding: 24, fontFamily: 'system-ui' }}>
      TG shell (placeholder — filled in later tasks)
    </div>
  );
}
```

- [ ] **Step 5: Rewrite `App.jsx`**

```jsx
// src/App.jsx
import { isTelegram } from './mobile/telegram/context';
import DesktopApp from './DesktopApp';
import TelegramApp from './mobile/TelegramApp';

export default function App() {
  return isTelegram() ? <TelegramApp /> : <DesktopApp />;
}
```

- [ ] **Step 6: Wire the mock into `main.jsx`**

Add the import and call `installTelegramMock()` **before** `createRoot(...).render(...)`:

```jsx
// src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { installTelegramMock } from './mobile/telegram/mockTelegram';

installTelegramMock();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
```

- [ ] **Step 7: Verify lint + build**

Run: `npm run lint && npm run build`
Expected: both pass, no new warnings.

- [ ] **Step 8: Verify desktop unchanged and mock switch works**

Run: `npm run dev`, then in the Browser pane:
- Open `http://localhost:5173/` → the normal desktop app (login or app) renders exactly as before.
- Open `http://localhost:5173/?tg_debug=1` → page shows `TG shell (placeholder …)`.
Use `read_page` to confirm each. Expected: desktop identical; `?tg_debug=1` shows the placeholder.

- [ ] **Step 9: Commit**

```bash
git add src/App.jsx src/DesktopApp.jsx src/main.jsx src/mobile/telegram/context.js src/mobile/telegram/mockTelegram.js src/mobile/TelegramApp.jsx
git commit -m "feat(mobile): add platform switch and Telegram context detection"
```

> Reviewer note: this task modifies `src/App.jsx` and `src/main.jsx`. Confirm the desktop tree in `DesktopApp.jsx` is character-identical to the previous `App.jsx` body (only the component name changed).

---

## Task 5: Telegram SDK init + theme bridge

**Files:**
- Create: `src/mobile/telegram/sdk.js`
- Create: `src/mobile/telegram/theme.js`
- Modify: `index.html`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: `getWebApp` from `context.js`.
- Produces:
  - `sdk.js`: `initTelegram(): void` — calls `ready()`, `expand()`, `disableVerticalSwipes?.()`, and pushes current theme bg into `setHeaderColor`/`setBackgroundColor` when available.
  - `theme.js`: `applyThemeParams(): void` (reads `getWebApp().themeParams` + `colorScheme`, writes CSS vars + `data-theme` on `<html>`), `subscribeTheme(cb: () => void): () => void` (binds `themeChanged`, returns an unsubscribe).
- CSS tokens available after this task: `--tg-bg`, `--tg-text`, `--tg-hint`, `--tg-link`, `--tg-button`, `--tg-button-text`, `--tg-secondary-bg`, `--tg-section-bg`, `--tg-destructive`, and Tailwind utilities `bg-tg-bg`, `text-tg-text`, `text-tg-hint`, `bg-tg-section`, `bg-tg-secondary`, `text-tg-link`, `bg-tg-button`, `text-tg-button`, `text-tg-destructive`.

- [ ] **Step 1: Add the Telegram SDK script to `index.html`**

Insert as the first line inside `<head>` (before the `<title>`):

```html
    <script src="https://telegram.org/js/telegram-web-app.js"></script>
```

- [ ] **Step 2: Write `theme.js`**

```js
// src/mobile/telegram/theme.js
import { getWebApp } from './context';

const FALLBACK_LIGHT = {
  bg_color: '#ffffff', text_color: '#000000', hint_color: '#707579',
  link_color: '#2481cc', button_color: '#2481cc', button_text_color: '#ffffff',
  secondary_bg_color: '#efeff4', section_bg_color: '#ffffff',
  destructive_text_color: '#df3f40',
};
const FALLBACK_DARK = {
  bg_color: '#17212b', text_color: '#f5f5f5', hint_color: '#708499',
  link_color: '#6ab7ff', button_color: '#5288c1', button_text_color: '#ffffff',
  secondary_bg_color: '#232e3c', section_bg_color: '#17212b',
  destructive_text_color: '#ec3942',
};

const VAR_MAP = {
  bg_color: '--tg-bg',
  text_color: '--tg-text',
  hint_color: '--tg-hint',
  link_color: '--tg-link',
  button_color: '--tg-button',
  button_text_color: '--tg-button-text',
  secondary_bg_color: '--tg-secondary-bg',
  section_bg_color: '--tg-section-bg',
  destructive_text_color: '--tg-destructive',
};

export function applyThemeParams() {
  const wa = getWebApp();
  const scheme = wa?.colorScheme === 'dark' ? 'dark' : 'light';
  const base = scheme === 'dark' ? FALLBACK_DARK : FALLBACK_LIGHT;
  const params = { ...base, ...(wa?.themeParams || {}) };
  const root = document.documentElement;
  for (const [key, cssVar] of Object.entries(VAR_MAP)) {
    if (params[key]) root.style.setProperty(cssVar, params[key]);
  }
  root.setAttribute('data-theme', scheme);
  root.style.setProperty('color-scheme', scheme);
}

export function subscribeTheme(cb) {
  const wa = getWebApp();
  if (!wa?.onEvent) return () => {};
  const handler = () => { applyThemeParams(); cb?.(); };
  wa.onEvent('themeChanged', handler);
  return () => wa.offEvent?.('themeChanged', handler);
}
```

- [ ] **Step 3: Write `sdk.js`**

```js
// src/mobile/telegram/sdk.js
import { getWebApp } from './context';

let done = false;

export function initTelegram() {
  if (done) return;
  const wa = getWebApp();
  if (!wa) return;
  done = true;
  try {
    wa.ready();
    wa.expand?.();
    wa.disableVerticalSwipes?.();
    const bg = getComputedStyle(document.documentElement)
      .getPropertyValue('--tg-bg').trim();
    if (bg) {
      wa.setHeaderColor?.(bg);
      wa.setBackgroundColor?.(bg);
    }
  } catch (e) {
    console.warn('initTelegram failed', e);
  }
}
```

- [ ] **Step 4: Add theme tokens to `src/index.css`**

```css
/* src/index.css */
@import "tailwindcss";

@theme {
  --color-tg-bg: var(--tg-bg, #ffffff);
  --color-tg-text: var(--tg-text, #000000);
  --color-tg-hint: var(--tg-hint, #707579);
  --color-tg-link: var(--tg-link, #2481cc);
  --color-tg-button: var(--tg-button, #2481cc);
  --color-tg-button-text: var(--tg-button-text, #ffffff);
  --color-tg-secondary: var(--tg-secondary-bg, #efeff4);
  --color-tg-section: var(--tg-section-bg, #ffffff);
  --color-tg-destructive: var(--tg-destructive, #df3f40);
}
```

- [ ] **Step 5: Verify lint + build**

Run: `npm run lint && npm run build`
Expected: pass. The generated CSS contains `--color-tg-bg` (spot-check: `grep -r "tg-bg" dist/assets/*.css` returns a match).

- [ ] **Step 6: Verify theme applies in the mock**

Add a temporary check: in `TelegramApp.jsx` placeholder, before returning, call `applyThemeParams()` from an effect and set `className="min-h-screen bg-tg-bg text-tg-text"` on the wrapper. Run `npm run dev`:
- `http://localhost:5173/?tg_debug=1` → white background, black text.
- `http://localhost:5173/?tg_debug=1&tg_dark=1` → dark background (`#18222d`), light text. Confirm with `read_page` / a screenshot.
Revert the temporary wiring at the end of the task (the real wiring lands in Task 6).

- [ ] **Step 7: Commit**

```bash
git add index.html src/index.css src/mobile/telegram/sdk.js src/mobile/telegram/theme.js
git commit -m "feat(mobile): add Telegram SDK init and theme-param CSS bridge"
```

---

## Task 6: Auth orchestrator + auth gate + auth screens

**Files:**
- Create: `src/mobile/telegram/auth.js`
- Create: `src/mobile/screens/SplashScreen.jsx`
- Create: `src/mobile/screens/LinkingScreen.jsx`
- Create: `src/mobile/screens/AuthErrorScreen.jsx`
- Create: `src/mobile/components/Spinner.jsx`
- Modify: `src/mobile/TelegramApp.jsx`

**Interfaces:**
- Consumes: `supabase` from `src/supabaseClient.js`; `getInitDataRaw`, `isDevMock`, `getWebApp` from `context.js`; `applyThemeParams`, `subscribeTheme` from `theme.js`; `initTelegram` from `sdk.js`.
- Env: `import.meta.env.VITE_SUPABASE_URL` — used to build the function URL `${VITE_SUPABASE_URL}/functions/v1/telegram-auth`. The `apikey` header uses `import.meta.env.VITE_SUPABASE_KEY`.
- Produces:
  - `auth.js`:
    - `async telegramSignIn(): Promise<{ status: 'ok' | 'need-link' | 'error', message?: string }>`
    - `async telegramLink(email: string, password: string): Promise<{ ok: boolean, message?: string }>`
  - `SplashScreen({ message })`, `AuthErrorScreen({ message, onRetry })`, `LinkingScreen({ onLinked })` — default-exported components.
  - `Spinner({ size })` — default export.
  - `TelegramApp.jsx` now renders `SplashScreen` / `LinkingScreen` / `AuthErrorScreen` / a placeholder `Authed` block based on the flow.

- [ ] **Step 1: Write `Spinner.jsx`**

```jsx
// src/mobile/components/Spinner.jsx
export default function Spinner({ size = 28 }) {
  return (
    <span
      aria-label="Загрузка"
      style={{
        width: size, height: size, display: 'inline-block',
        border: '3px solid var(--tg-hint, #999)', borderTopColor: 'transparent',
        borderRadius: '50%', animation: 'tg-spin 0.8s linear infinite',
      }}
    />
  );
}
```

Add the keyframes once, at the end of `src/mobile/components/Spinner.jsx`, via a module-level style injection:

```jsx
if (typeof document !== 'undefined' && !document.getElementById('tg-spin-kf')) {
  const s = document.createElement('style');
  s.id = 'tg-spin-kf';
  s.textContent = '@keyframes tg-spin{to{transform:rotate(360deg)}}';
  document.head.appendChild(s);
}
```

- [ ] **Step 2: Write `auth.js`**

```js
// src/mobile/telegram/auth.js
import { supabase } from '../../supabaseClient';
import { getInitDataRaw, isDevMock, getWebApp } from './context';

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/telegram-auth`;
const ANON = import.meta.env.VITE_SUPABASE_KEY;

async function callFn(payload, accessToken) {
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: ANON,
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

export async function telegramSignIn() {
  // 1. Existing Supabase session? Trust it (supabase-js refreshes on its own).
  const { data: { session } } = await supabase.auth.getSession();
  if (session) return { status: 'ok' };

  // 2. Dev mock: no valid signature, so skip the Edge Function entirely.
  if (isDevMock()) {
    const linked = !!getWebApp()?._mockLinked;
    return linked ? { status: 'ok' } : { status: 'need-link' };
  }

  // 3. Ask the Edge Function to log us in from initData.
  try {
    const { status, data } = await callFn({ action: 'login', initData: getInitDataRaw() });
    if (status !== 200) {
      return { status: 'error', message: data.error || `HTTP ${status}` };
    }
    if (data.linked === false) return { status: 'need-link' };
    const { error } = await supabase.auth.verifyOtp({
      token_hash: data.token_hash,
      type: 'magiclink',
    });
    if (error) return { status: 'error', message: error.message };
    return { status: 'ok' };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
}

export async function telegramLink(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, message: error.message };

  if (isDevMock()) return { ok: true }; // linked "conceptually" for the dev shell

  const accessToken = data.session?.access_token;
  const { status, data: res } = await callFn(
    { action: 'link', initData: getInitDataRaw() },
    accessToken,
  );
  if (status !== 200 || !res.ok) {
    return { ok: false, message: res.error || `HTTP ${status}` };
  }
  return { ok: true };
}
```

- [ ] **Step 3: Write `SplashScreen.jsx`**

```jsx
// src/mobile/screens/SplashScreen.jsx
import Spinner from '../components/Spinner';

export default function SplashScreen({ message = 'Загрузка…' }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-tg-bg text-tg-hint">
      <Spinner size={32} />
      <p className="text-sm">{message}</p>
    </div>
  );
}
```

- [ ] **Step 4: Write `AuthErrorScreen.jsx`**

```jsx
// src/mobile/screens/AuthErrorScreen.jsx
export default function AuthErrorScreen({ message, onRetry }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-8 text-center bg-tg-bg text-tg-text">
      <div className="text-4xl">⚠️</div>
      <p className="text-base font-medium">Не удалось авторизоваться через Telegram</p>
      {message && <p className="text-xs text-tg-hint break-words">{message}</p>}
      <button
        onClick={onRetry}
        className="mt-2 px-5 py-3 rounded-xl bg-tg-button text-tg-button-text text-sm font-semibold"
      >
        Повторить
      </button>
      <p className="text-xs text-tg-hint">Если не помогает — закройте и откройте приложение заново.</p>
    </div>
  );
}
```

- [ ] **Step 5: Write `LinkingScreen.jsx`**

```jsx
// src/mobile/screens/LinkingScreen.jsx
import { useState } from 'react';
import { telegramLink } from '../telegram/auth';

export default function LinkingScreen({ onLinked }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    const { ok, message } = await telegramLink(email.trim(), password);
    setBusy(false);
    if (ok) onLinked();
    else setErr(message || 'Не удалось войти');
  }

  return (
    <div className="min-h-screen flex flex-col justify-center px-6 bg-tg-bg text-tg-text">
      <h1 className="text-xl font-bold mb-1">Привязка аккаунта</h1>
      <p className="text-sm text-tg-hint mb-6">
        Введите логин от веб-версии один раз — дальше вход будет автоматическим.
      </p>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input
          type="email" inputMode="email" autoComplete="email" required
          placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-xl px-4 py-3 text-base bg-tg-secondary text-tg-text outline-none"
          style={{ minHeight: 48 }}
        />
        <input
          type="password" autoComplete="current-password" required
          placeholder="Пароль" value={password} onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl px-4 py-3 text-base bg-tg-secondary text-tg-text outline-none"
          style={{ minHeight: 48 }}
        />
        {err && <p className="text-sm text-tg-destructive">{err}</p>}
        <button
          type="submit" disabled={busy}
          className="mt-2 rounded-xl px-4 py-3 text-base font-semibold bg-tg-button text-tg-button-text disabled:opacity-60"
          style={{ minHeight: 48 }}
        >
          {busy ? 'Привязываем…' : 'Привязать аккаунт'}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 6: Wire the gate in `TelegramApp.jsx`**

```jsx
// src/mobile/TelegramApp.jsx
import { useCallback, useEffect, useState } from 'react';
import { initTelegram } from './telegram/sdk';
import { applyThemeParams, subscribeTheme } from './telegram/theme';
import { telegramSignIn } from './telegram/auth';
import SplashScreen from './screens/SplashScreen';
import LinkingScreen from './screens/LinkingScreen';
import AuthErrorScreen from './screens/AuthErrorScreen';

export default function TelegramApp() {
  const [phase, setPhase] = useState('boot'); // boot | linking | error | ready
  const [errMsg, setErrMsg] = useState('');

  useEffect(() => {
    applyThemeParams();
    initTelegram();
    const unsub = subscribeTheme();
    return unsub;
  }, []);

  const run = useCallback(async () => {
    setPhase('boot');
    const { status, message } = await telegramSignIn();
    if (status === 'ok') setPhase('ready');
    else if (status === 'need-link') setPhase('linking');
    else { setErrMsg(message || ''); setPhase('error'); }
  }, []);

  useEffect(() => { run(); }, [run]);

  if (phase === 'boot') return <SplashScreen message="Входим через Telegram…" />;
  if (phase === 'error') return <AuthErrorScreen message={errMsg} onRetry={run} />;
  if (phase === 'linking') return <LinkingScreen onLinked={() => setPhase('ready')} />;

  return (
    <div className="min-h-screen bg-tg-bg text-tg-text p-6">
      Авторизовано (навигация появится в следующей задаче)
    </div>
  );
}
```

- [ ] **Step 7: Verify lint + build**

Run: `npm run lint && npm run build`
Expected: pass.

- [ ] **Step 8: Verify the three auth states in the mock**

Run `npm run dev`, Browser pane:
- `http://localhost:5173/?tg_debug=1` → briefly Splash, then **LinkingScreen** (mock is "not linked").
- Fill any email/password, submit → `signInWithPassword` will fail against real Supabase → inline red error shown, stays on the screen. (This proves the error path; a real linked account would proceed.)
- `http://localhost:5173/?tg_debug=1&tg_linked=1` → Splash, then **"Авторизовано …"** block.
- `http://localhost:5173/?tg_debug=1&tg_dark=1&tg_linked=1` → same, dark theme.
Confirm each with `read_page`.

- [ ] **Step 9: Commit**

```bash
git add src/mobile/telegram/auth.js src/mobile/screens/ src/mobile/components/Spinner.jsx src/mobile/TelegramApp.jsx
git commit -m "feat(mobile): add Telegram initData sign-in flow and auth screens"
```

---

## Task 7: TelegramLayout + bottom-tab navigation + route stubs

**Files:**
- Create: `src/mobile/layouts/TelegramLayout.jsx`
- Create: `src/mobile/layouts/BottomTabBar.jsx`
- Create: `src/mobile/layouts/MoreSheet.jsx`
- Create: `src/mobile/screens/MobileStub.jsx`
- Create: `src/mobile/components/BottomSheet.jsx`
- Create: `src/mobile/telegram/useTelegramBackButton.js`
- Create: `src/mobile/telegram/useTelegramMainButton.js`
- Create: `src/mobile/telegram/useTelegramHaptics.js`
- Modify: `src/mobile/TelegramApp.jsx` (add `<Routes>`)

**Interfaces:**
- Consumes: `getWebApp` from `context.js`; react-router `useNavigate`, `useLocation`, `NavLink`, `Outlet`, `Routes`, `Route`; `supabase` for logout.
- Produces:
  - `useTelegramBackButton()` — no args; shows native BackButton on any route not in the tab set, wires `onClick → navigate(-1)`, hides + unbinds on cleanup.
  - `useTelegramMainButton({ text, onClick, visible = true, loading = false, enabled = true })` — imperative bridge to `WebApp.MainButton`; re-syncs on every arg change; hides + `offClick` on unmount.
  - `useTelegramHaptics()` → `{ success(): void, impact(): void }` (no-ops if `HapticFeedback` absent).
  - `BottomSheet({ open, onClose, title, children })` — portal into `document.body`, backdrop click closes, `Esc` closes.
  - `MobileStub({ title })` — centered "«{title}» — скоро" text.
  - `TelegramLayout` — renders header (section title from route), `<main>` with `<Outlet/>`, `<BottomTabBar/>`; adds `padding-bottom` for the bar + `env(safe-area-inset-bottom)`.
  - Route table under `TelegramLayout` (paths mirror `DesktopApp`): `/`, `/daily-entry`, `/tasks`, `/workshops`, `/medicines`, `/expenses`, `/salaries`, `/debts`, `/notes`, `/sales`, `/feed`, `/coal`, `/batch/:batchId`, `/batch/:batchId/report`, `*`.
- Tab set (roots that hide BackButton): `/`, `/daily-entry`, `/tasks`.

- [ ] **Step 1: Write `useTelegramHaptics.js`**

```js
// src/mobile/telegram/useTelegramHaptics.js
import { getWebApp } from './context';

export function useTelegramHaptics() {
  const hf = getWebApp()?.HapticFeedback;
  return {
    success() { try { hf?.notificationOccurred?.('success'); } catch { /* noop */ } },
    impact() { try { hf?.impactOccurred?.('light'); } catch { /* noop */ } },
  };
}
```

- [ ] **Step 2: Write `useTelegramBackButton.js`**

```js
// src/mobile/telegram/useTelegramBackButton.js
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getWebApp } from './context';

const ROOTS = new Set(['/', '/daily-entry', '/tasks']);

export function useTelegramBackButton() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const bb = getWebApp()?.BackButton;
    if (!bb) return;
    const onClick = () => navigate(-1);
    if (ROOTS.has(location.pathname)) {
      bb.hide();
    } else {
      bb.onClick(onClick);
      bb.show();
    }
    return () => {
      bb.offClick?.(onClick);
      bb.hide?.();
    };
  }, [location.pathname, navigate]);
}
```

- [ ] **Step 3: Write `useTelegramMainButton.js`**

```js
// src/mobile/telegram/useTelegramMainButton.js
import { useEffect, useRef } from 'react';
import { getWebApp } from './context';

export function useTelegramMainButton({
  text, onClick, visible = true, loading = false, enabled = true,
}) {
  const cb = useRef(onClick);
  cb.current = onClick;

  useEffect(() => {
    const mb = getWebApp()?.MainButton;
    if (!mb) return;
    const handler = () => cb.current?.();
    mb.setParams?.({ text });
    mb.setText?.(text);
    mb.onClick(handler);
    if (visible) mb.show(); else mb.hide();
    if (enabled && !loading) mb.enable?.(); else mb.disable?.();
    if (loading) mb.showProgress?.(); else mb.hideProgress?.();
    return () => {
      mb.offClick(handler);
      mb.hide();
      mb.hideProgress?.();
    };
  }, [text, visible, loading, enabled]);
}
```

- [ ] **Step 4: Write `BottomSheet.jsx`**

```jsx
// src/mobile/components/BottomSheet.jsx
import { useEffect } from 'react';
import { createPortal } from 'react-dom';

export default function BottomSheet({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={onClose}
    >
      <div
        className="w-full rounded-t-2xl bg-tg-bg text-tg-text p-4"
        style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))', maxHeight: '80vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full" style={{ background: 'var(--tg-hint)' }} />
        {title && <h2 className="text-base font-semibold mb-3">{title}</h2>}
        {children}
      </div>
    </div>,
    document.body,
  );
}
```

- [ ] **Step 5: Write `MobileStub.jsx`**

```jsx
// src/mobile/screens/MobileStub.jsx
export default function MobileStub({ title }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-8 text-center text-tg-hint">
      <div className="text-4xl mb-3">🚧</div>
      <p className="text-base font-medium text-tg-text">«{title}»</p>
      <p className="text-sm mt-1">Экран появится в следующем обновлении.</p>
    </div>
  );
}
```

- [ ] **Step 6: Write `MoreSheet.jsx`**

```jsx
// src/mobile/layouts/MoreSheet.jsx
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import BottomSheet from '../components/BottomSheet';

const GROUPS = [
  { title: 'Финансы', items: [
    ['/expenses', 'Расходы'], ['/sales', 'Продажи'],
    ['/salaries', 'Сотрудники и ЗП'], ['/debts', 'Долги'],
  ]},
  { title: 'Учёт', items: [
    ['/workshops', 'Учёт по цехам'], ['/feed', 'Корм'], ['/coal', 'Уголь'],
  ]},
  { title: 'Справочники', items: [
    ['/medicines', 'Лекарства'], ['/notes', 'Заметки'],
  ]},
];

export default function MoreSheet({ open, onClose }) {
  const navigate = useNavigate();
  const go = (path) => { onClose(); navigate(path); };

  return (
    <BottomSheet open={open} onClose={onClose} title="Ещё">
      <div className="flex flex-col gap-4">
        {GROUPS.map((g) => (
          <div key={g.title}>
            <p className="text-xs uppercase tracking-wide text-tg-hint mb-1">{g.title}</p>
            <div className="rounded-xl overflow-hidden bg-tg-section">
              {g.items.map(([path, label]) => (
                <button
                  key={path}
                  onClick={() => go(path)}
                  className="w-full text-left px-4 py-3 text-base border-b last:border-b-0"
                  style={{ borderColor: 'var(--tg-secondary-bg)', minHeight: 48 }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        ))}
        <button
          onClick={async () => { await supabase.auth.signOut(); onClose(); window.location.reload(); }}
          className="mt-2 w-full rounded-xl px-4 py-3 text-base font-semibold text-tg-destructive bg-tg-section"
          style={{ minHeight: 48 }}
        >
          Выйти
        </button>
      </div>
    </BottomSheet>
  );
}
```

- [ ] **Step 7: Write `BottomTabBar.jsx`**

```jsx
// src/mobile/layouts/BottomTabBar.jsx
import { NavLink } from 'react-router-dom';

const TABS = [
  ['/', 'Партии', '🐔'],
  ['/daily-entry', 'Ввод', '📝'],
  ['/tasks', 'Задачи', '✅'],
];

export default function BottomTabBar({ onMore }) {
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 flex bg-tg-bg border-t"
      style={{ borderColor: 'var(--tg-secondary-bg)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {TABS.map(([to, label, icon]) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className="flex-1 flex flex-col items-center justify-center py-2 text-xs"
          style={({ isActive }) => ({
            color: isActive ? 'var(--tg-link)' : 'var(--tg-hint)',
            minHeight: 56,
          })}
        >
          <span className="text-lg leading-none mb-0.5">{icon}</span>
          {label}
        </NavLink>
      ))}
      <button
        onClick={onMore}
        className="flex-1 flex flex-col items-center justify-center py-2 text-xs"
        style={{ color: 'var(--tg-hint)', minHeight: 56 }}
      >
        <span className="text-lg leading-none mb-0.5">☰</span>
        Ещё
      </button>
    </nav>
  );
}
```

- [ ] **Step 8: Write `TelegramLayout.jsx`**

```jsx
// src/mobile/layouts/TelegramLayout.jsx
import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import BottomTabBar from './BottomTabBar';
import MoreSheet from './MoreSheet';
import { useTelegramBackButton } from '../telegram/useTelegramBackButton';

const TITLES = {
  '/': 'Партии бройлеров',
  '/daily-entry': 'Дневной ввод',
  '/tasks': 'Задачи',
  '/workshops': 'Учёт по цехам',
  '/medicines': 'Лекарства',
  '/expenses': 'Расходы',
  '/salaries': 'Сотрудники и ЗП',
  '/debts': 'Долги',
  '/notes': 'Заметки',
  '/sales': 'Продажи',
  '/feed': 'Корм',
  '/coal': 'Уголь',
};

export default function TelegramLayout() {
  const [moreOpen, setMoreOpen] = useState(false);
  const { pathname } = useLocation();
  useTelegramBackButton();

  const title = TITLES[pathname]
    || (pathname.startsWith('/batch/') && pathname.endsWith('/report') ? 'Отчёт партии' : '')
    || (pathname.startsWith('/batch/') ? 'Партия' : 'Ферма');

  return (
    <div className="min-h-screen bg-tg-bg text-tg-text flex flex-col">
      <header className="px-4 py-3 text-lg font-semibold bg-tg-bg">{title}</header>
      <main className="flex-1 overflow-y-auto px-4" style={{ paddingBottom: 'calc(56px + env(safe-area-inset-bottom) + 8px)' }}>
        <Outlet />
      </main>
      <BottomTabBar onMore={() => setMoreOpen(true)} />
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </div>
  );
}
```

- [ ] **Step 9: Add `<Routes>` to `TelegramApp.jsx`**

Replace the `phase === 'ready'` return with:

```jsx
  return <AuthedRoutes />;
}

import { Routes, Route } from 'react-router-dom';
import TelegramLayout from './layouts/TelegramLayout';
import MobileStub from './screens/MobileStub';

function AuthedRoutes() {
  return (
    <Routes>
      <Route element={<TelegramLayout />}>
        <Route path="/" element={<MobileStub title="Партии бройлеров" />} />
        <Route path="/daily-entry" element={<MobileStub title="Дневной ввод" />} />
        <Route path="/tasks" element={<MobileStub title="Задачи" />} />
        <Route path="/workshops" element={<MobileStub title="Учёт по цехам" />} />
        <Route path="/medicines" element={<MobileStub title="Лекарства" />} />
        <Route path="/expenses" element={<MobileStub title="Расходы" />} />
        <Route path="/salaries" element={<MobileStub title="Сотрудники и ЗП" />} />
        <Route path="/debts" element={<MobileStub title="Долги" />} />
        <Route path="/notes" element={<MobileStub title="Заметки" />} />
        <Route path="/sales" element={<MobileStub title="Продажи" />} />
        <Route path="/feed" element={<MobileStub title="Корм" />} />
        <Route path="/coal" element={<MobileStub title="Уголь" />} />
        <Route path="/batch/:batchId" element={<MobileStub title="Партия" />} />
        <Route path="/batch/:batchId/report" element={<MobileStub title="Отчёт партии" />} />
        <Route path="*" element={<MobileStub title="Раздел" />} />
      </Route>
    </Routes>
  );
}
```

Keep imports at the top of the file per lint rules — move the added `import` lines up with the others rather than mid-file (shown inline here only for locality).

- [ ] **Step 10: Verify lint + build**

Run: `npm run lint && npm run build`
Expected: pass.

- [ ] **Step 11: Verify navigation in the mock**

`npm run dev`, Browser pane at `http://localhost:5173/?tg_debug=1&tg_linked=1`:
- Bottom bar shows 4 items; header reads "Партии бройлеров"; body shows the stub.
- Tap "Ввод" → URL `/daily-entry`, header + stub update, no BackButton.
- Tap "Ещё" → sheet opens with 3 groups + "Выйти".
- Tap "Расходы" in the sheet → `/expenses` stub; because `/expenses` is not a root, the mock `BackButton.isVisible` is now `true` (check via `javascript_tool`: `window.Telegram.WebApp.BackButton.isVisible`).
- Tap "Выйти" → `signOut` + reload → back to Splash → LinkingScreen.
Confirm with `read_page` + one `javascript_tool` check for `BackButton.isVisible`.

- [ ] **Step 12: Commit**

```bash
git add src/mobile/layouts/ src/mobile/screens/MobileStub.jsx src/mobile/components/BottomSheet.jsx src/mobile/telegram/useTelegram*.js src/mobile/TelegramApp.jsx
git commit -m "feat(mobile): add Telegram layout, bottom-tab nav and route stubs"
```

---

## Task 8: MobileBatchesPage (root screen) + list primitives

**Files:**
- Create: `src/mobile/components/Card.jsx`
- Create: `src/mobile/components/ListRow.jsx`
- Create: `src/mobile/components/SectionHeader.jsx`
- Create: `src/mobile/components/StatusPill.jsx`
- Create: `src/mobile/components/EmptyState.jsx`
- Create: `src/mobile/pages/MobileBatchesPage.jsx`
- Modify: `src/mobile/TelegramApp.jsx` (route `/` → `MobileBatchesPage`)

**Interfaces:**
- Consumes: `supabase` from `src/supabaseClient.js`; RPC `get_batches_with_stats()` returning rows `{ id: uuid, batch_name: string, initial_quantity: number, start_date: string, is_active: boolean, user_id: uuid, total_mortality: number, current_quantity: number, is_summary: boolean }`; `Spinner` (Task 6).
- Produces:
  - `Card({ children, className, onClick })` — `bg-tg-section` rounded container.
  - `ListRow({ label, value, hint, onClick })` — flex row, optional chevron when `onClick`.
  - `SectionHeader({ children })` — small uppercase `text-tg-hint`.
  - `StatusPill({ status, children })` — `status ∈ 'ok' | 'warning' | 'critical' | 'neutral'`; colors: ok `#28a745`, warning `#fd7e14`, critical `var(--tg-destructive)`, neutral `var(--tg-hint)` (pill background is the color at 15% via `color-mix`).
  - `EmptyState({ icon, title, hint })`.
  - `MobileBatchesPage` — default export; loads batches, renders one `Card` per batch (summary batch pinned first), each row navigates to `/batch/:id`.
- Age is computed client-side: `Math.max(1, Math.ceil((Date.now() - Date.parse(start_date)) / 86400000))` (mirrors `DailyEntryPage.getAge`).

- [ ] **Step 1: Write `Card.jsx`, `ListRow.jsx`, `SectionHeader.jsx`, `EmptyState.jsx`**

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

```jsx
// src/mobile/components/ListRow.jsx
export default function ListRow({ label, value, hint, onClick }) {
  return (
    <div
      onClick={onClick}
      className="flex items-center justify-between gap-3 py-2"
      style={{ minHeight: onClick ? 44 : undefined }}
    >
      <div className="min-w-0">
        <div className="text-sm text-tg-text truncate">{label}</div>
        {hint && <div className="text-xs text-tg-hint truncate">{hint}</div>}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {value != null && <span className="text-sm font-medium text-tg-text">{value}</span>}
        {onClick && <span className="text-tg-hint">›</span>}
      </div>
    </div>
  );
}
```

```jsx
// src/mobile/components/SectionHeader.jsx
export default function SectionHeader({ children }) {
  return (
    <p className="text-xs uppercase tracking-wide text-tg-hint mt-4 mb-1 px-1">{children}</p>
  );
}
```

```jsx
// src/mobile/components/EmptyState.jsx
export default function EmptyState({ icon = '📭', title, hint }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-8 text-center">
      <div className="text-4xl mb-3">{icon}</div>
      <p className="text-base font-medium text-tg-text">{title}</p>
      {hint && <p className="text-sm text-tg-hint mt-1">{hint}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Write `StatusPill.jsx`**

```jsx
// src/mobile/components/StatusPill.jsx
const COLOR = {
  ok: '#28a745',
  warning: '#fd7e14',
  critical: 'var(--tg-destructive, #df3f40)',
  neutral: 'var(--tg-hint, #999)',
};

export default function StatusPill({ status = 'neutral', children }) {
  const c = COLOR[status] || COLOR.neutral;
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ color: c, background: `color-mix(in srgb, ${c} 15%, transparent)` }}
    >
      {children}
    </span>
  );
}
```

- [ ] **Step 3: Write `MobileBatchesPage.jsx`**

```jsx
// src/mobile/pages/MobileBatchesPage.jsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import Card from '../components/Card';
import ListRow from '../components/ListRow';
import StatusPill from '../components/StatusPill';
import EmptyState from '../components/EmptyState';
import Spinner from '../components/Spinner';

function ageOf(startDate) {
  return Math.max(1, Math.ceil((Date.now() - Date.parse(startDate)) / 86400000));
}

function mortalityStatus(pct) {
  if (pct >= 8) return 'critical';
  if (pct >= 5) return 'warning';
  return 'ok';
}

export default function MobileBatchesPage() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc('get_batches_with_stats');
      if (error) { setErr(error.message); setRows([]); return; }
      const sorted = [...(data || [])].sort((a, b) => (b.is_summary ? 1 : 0) - (a.is_summary ? 1 : 0));
      setRows(sorted);
    })();
  }, []);

  if (rows === null) {
    return <div className="flex justify-center py-20"><Spinner size={28} /></div>;
  }
  if (err) {
    return <EmptyState icon="⚠️" title="Не удалось загрузить партии" hint={err} />;
  }
  if (rows.length === 0) {
    return <EmptyState icon="🐔" title="Активных партий нет" hint="Создайте партию в веб-версии" />;
  }

  return (
    <div className="flex flex-col gap-3 py-3">
      {rows.map((b) => {
        const age = ageOf(b.start_date);
        const initial = b.initial_quantity || 0;
        const pct = initial > 0 ? (b.total_mortality / initial) * 100 : 0;
        return (
          <Card key={b.id} onClick={() => navigate(`/batch/${b.id}`)}>
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-base font-semibold truncate">{b.batch_name}</span>
              {!b.is_summary && (
                <StatusPill status={mortalityStatus(pct)}>падёж {pct.toFixed(1)}%</StatusPill>
              )}
            </div>
            <ListRow label="День выращивания" value={age} />
            <ListRow label="Начальное поголовье" value={initial.toLocaleString('ru-RU')} />
            <ListRow label="Осталось" value={Number(b.current_quantity).toLocaleString('ru-RU')} />
            <ListRow label="Падёж всего" value={Number(b.total_mortality).toLocaleString('ru-RU')} />
          </Card>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Route `/` to the real page**

In `src/mobile/TelegramApp.jsx` `AuthedRoutes`, replace the `/` route:

```jsx
import MobileBatchesPage from './pages/MobileBatchesPage';
// ...
<Route path="/" element={<MobileBatchesPage />} />
```

- [ ] **Step 5: Verify lint + build**

Run: `npm run lint && npm run build`
Expected: pass.

- [ ] **Step 6: Verify against real data**

Requires `.env.local` with `VITE_SUPABASE_URL` / `VITE_SUPABASE_KEY` pointing at a project with data, and a real logged-in session. Since the mock's `signInWithPassword` can reach real Supabase: run `npm run dev`, open `http://localhost:5173/?tg_debug=1`, on the LinkingScreen enter **real** web-app credentials → `telegramLink` mock path returns `{ok:true}` → app opens on the Batches screen with real cards. Tap a card → `/batch/:id` stub with BackButton.
If no test credentials are available, instead verify the three non-data states: loading spinner, error `EmptyState` (temporarily point the RPC name at a bogus string), and empty `EmptyState`. Revert any temporary change.

- [ ] **Step 7: Commit**

```bash
git add src/mobile/components/ src/mobile/pages/MobileBatchesPage.jsx src/mobile/TelegramApp.jsx
git commit -m "feat(mobile): add Batches list screen with card primitives"
```

---

## Task 9: MobileDailyEntryPage + form primitives + summary sync

**Files:**
- Create: `src/mobile/components/FormField.jsx`
- Create: `src/mobile/components/NumberStepper.jsx`
- Create: `src/mobile/components/SegmentedControl.jsx`
- Create: `src/mobile/pages/MobileDailyEntryPage.jsx`
- Modify: `src/mobile/TelegramApp.jsx` (route `/daily-entry` → `MobileDailyEntryPage`)

**Interfaces:**
- Consumes: `supabase`; `syncSummaryBatchLog(logDate: string, userId: string)` from `src/utils/summaryBatchSync.js`; `useTelegramMainButton` (Task 7); `useTelegramHaptics` (Task 7); `Card`, `SegmentedControl`, `NumberStepper`, `FormField`, `EmptyState`, `Spinner`.
- Data load (mirrors `src/pages/DailyEntryPage.jsx` `loadAll`): active workshops with an active batch, today's `daily_logs` row per batch.
- Write (mirrors `DailyEntryPage.handleSubmit`, additive semantics): if a row exists for `(batch_id, log_date)` → `update` summing `mortality_natural`, `mortality_halal`, `mortality` (= natural+halal), `daily_feed`, `water_consumption`; overwrite `weight` when provided. Else `insert` a new row with `batch_id`, `workshop_id`, `log_date`, `age`, the entered values, `user_id`. **After a successful write, call `syncSummaryBatchLog(logDate, user.id)`** — non-negotiable (Global Constraints).
- Produces:
  - `FormField({ label, children })`.
  - `NumberStepper({ value, onChange, step = 1, min = 0, suffix })` — `value` is a string; `−`/`+` adjust numerically; direct typing allowed; `inputMode="decimal"`.
  - `SegmentedControl({ options: {value,label}[], value, onChange })`.
  - `MobileDailyEntryPage` — default export; workshop picker (SegmentedControl if ≤3, else a native `<select>` styled as `FormField`), fields падёж ест./халяль/корм/вода/масса, `MainButton` "Сохранить" that submits the selected workshop, success haptic + inline "Сохранено" confirmation, then reloads that workshop's row.

- [ ] **Step 1: Write `FormField.jsx`, `NumberStepper.jsx`, `SegmentedControl.jsx`**

```jsx
// src/mobile/components/FormField.jsx
export default function FormField({ label, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm text-tg-hint">{label}</span>
      {children}
    </label>
  );
}
```

```jsx
// src/mobile/components/NumberStepper.jsx
export default function NumberStepper({ value, onChange, step = 1, min = 0, suffix }) {
  const num = () => {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : 0;
  };
  const set = (n) => onChange(String(Math.max(min, Math.round(n * 100) / 100)));
  return (
    <div className="flex items-stretch gap-2">
      <button type="button" onClick={() => set(num() - step)}
        className="w-12 rounded-xl bg-tg-secondary text-xl font-bold" style={{ minHeight: 48 }}>−</button>
      <div className="flex-1 relative">
        <input
          type="text" inputMode="decimal" value={value}
          onChange={(e) => onChange(e.target.value.replace(',', '.'))}
          placeholder="0"
          className="w-full h-full rounded-xl px-3 text-center text-lg bg-tg-secondary text-tg-text outline-none"
          style={{ minHeight: 48 }}
        />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-tg-hint">{suffix}</span>}
      </div>
      <button type="button" onClick={() => set(num() + step)}
        className="w-12 rounded-xl bg-tg-secondary text-xl font-bold" style={{ minHeight: 48 }}>+</button>
    </div>
  );
}
```

```jsx
// src/mobile/components/SegmentedControl.jsx
export default function SegmentedControl({ options, value, onChange }) {
  return (
    <div className="flex gap-1 p-1 rounded-xl bg-tg-secondary">
      {options.map((o) => (
        <button
          key={o.value} type="button" onClick={() => onChange(o.value)}
          className="flex-1 rounded-lg px-2 py-2 text-sm font-medium"
          style={{
            minHeight: 40,
            background: o.value === value ? 'var(--tg-bg)' : 'transparent',
            color: o.value === value ? 'var(--tg-text)' : 'var(--tg-hint)',
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Write `MobileDailyEntryPage.jsx`**

```jsx
// src/mobile/pages/MobileDailyEntryPage.jsx
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabaseClient';
import { syncSummaryBatchLog } from '../../utils/summaryBatchSync';
import { useTelegramMainButton } from '../telegram/useTelegramMainButton';
import { useTelegramHaptics } from '../telegram/useTelegramHaptics';
import Card from '../components/Card';
import FormField from '../components/FormField';
import NumberStepper from '../components/NumberStepper';
import SegmentedControl from '../components/SegmentedControl';
import EmptyState from '../components/EmptyState';
import Spinner from '../components/Spinner';

const EMPTY = { mortality_natural: '', mortality_halal: '', feed: '', water: '', weight: '' };
const today = () => new Date().toISOString().slice(0, 10);

function ageOf(startDate, dateStr) {
  return Math.max(1, Math.ceil((Date.parse(dateStr) - Date.parse(startDate)) / 86400000));
}

export default function MobileDailyEntryPage() {
  const [loading, setLoading] = useState(true);
  const [workshops, setWorkshops] = useState([]);
  const [logs, setLogs] = useState({});          // workshopId -> today's daily_logs row | null
  const [selected, setSelected] = useState('');  // workshop id
  const [entry, setEntry] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const haptics = useTelegramHaptics();
  const logDate = today();

  async function load() {
    setLoading(true);
    const { data: wsData } = await supabase
      .from('workshops')
      .select('*, batches:broiler_batches (id, batch_name, initial_quantity, start_date, is_active)')
      .eq('is_active', true)
      .order('name');
    const active = (wsData || [])
      .map((w) => ({ ...w, activeBatch: w.batches?.find((b) => b.is_active) || null }))
      .filter((w) => w.activeBatch);
    setWorkshops(active);
    setSelected((prev) => prev || active[0]?.id || '');

    const byWs = {};
    const batchIds = active.map((w) => w.activeBatch.id);
    if (batchIds.length) {
      const { data: logRows } = await supabase
        .from('daily_logs').select('*').in('batch_id', batchIds).eq('log_date', logDate);
      const byBatch = {};
      (logRows || []).forEach((l) => { byBatch[l.batch_id] = l; });
      active.forEach((w) => { byWs[w.id] = byBatch[w.activeBatch.id] || null; });
    }
    setLogs(byWs);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const ws = useMemo(() => workshops.find((w) => w.id === selected), [workshops, selected]);
  const todayLog = ws ? logs[ws.id] : null;

  async function save() {
    if (!ws) return;
    const mn = Number(entry.mortality_natural) || 0;
    const mh = Number(entry.mortality_halal) || 0;
    const feed = Number(entry.feed) || 0;
    const water = Number(entry.water) || 0;
    const weight = entry.weight ? parseFloat(entry.weight) : null;
    if (mn === 0 && mh === 0 && feed === 0 && water === 0 && weight === null) {
      setSaved(false);
      window.alert('Введите хотя бы одно значение');
      return;
    }
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const batch = ws.activeBatch;
      if (todayLog) {
        const upd = {
          mortality_natural: (todayLog.mortality_natural || 0) + mn,
          mortality_halal: (todayLog.mortality_halal || 0) + mh,
          daily_feed: (todayLog.daily_feed || 0) + feed,
          water_consumption: (todayLog.water_consumption || 0) + water,
        };
        upd.mortality = upd.mortality_natural + upd.mortality_halal;
        if (weight !== null) upd.weight = weight;
        const { error } = await supabase.from('daily_logs').update(upd).eq('id', todayLog.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('daily_logs').insert([{
          batch_id: batch.id,
          workshop_id: ws.id,
          log_date: logDate,
          age: ageOf(batch.start_date, logDate),
          mortality: mn + mh,
          mortality_natural: mn,
          mortality_halal: mh,
          daily_feed: feed,
          water_consumption: water,
          weight,
          user_id: user.id,
        }]);
        if (error) throw error;
      }
      await syncSummaryBatchLog(logDate, user.id); // domain invariant
      setEntry(EMPTY);
      setSaved(true);
      haptics.success();
      await load();
    } catch (e) {
      window.alert('Ошибка: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  useTelegramMainButton({
    text: busy ? 'Сохраняем…' : 'Сохранить',
    onClick: save,
    visible: !loading && !!ws,
    loading: busy,
  });

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;
  if (!workshops.length) {
    return <EmptyState icon="🏭" title="Нет цехов с активной партией" hint="Заведите цех и партию в веб-версии" />;
  }

  const set = (k) => (v) => { setEntry((e) => ({ ...e, [k]: v })); setSaved(false); };

  return (
    <div className="flex flex-col gap-4 py-3">
      {workshops.length <= 3 ? (
        <SegmentedControl
          options={workshops.map((w) => ({ value: w.id, label: w.name }))}
          value={selected}
          onChange={(v) => { setSelected(v); setEntry(EMPTY); setSaved(false); }}
        />
      ) : (
        <FormField label="Цех">
          <select
            value={selected}
            onChange={(e) => { setSelected(e.target.value); setEntry(EMPTY); setSaved(false); }}
            className="w-full rounded-xl px-3 bg-tg-secondary text-tg-text" style={{ minHeight: 48 }}
          >
            {workshops.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </FormField>
      )}

      {ws && (
        <Card>
          <p className="text-sm text-tg-hint mb-3">
            {ws.activeBatch.batch_name} · день {ageOf(ws.activeBatch.start_date, logDate)}
            {todayLog && ' · за сегодня уже есть запись, значения добавятся'}
          </p>
          <div className="flex flex-col gap-3">
            <FormField label="Падёж естественный (гол.)">
              <NumberStepper value={entry.mortality_natural} onChange={set('mortality_natural')} />
            </FormField>
            <FormField label="Падёж халяль (гол.)">
              <NumberStepper value={entry.mortality_halal} onChange={set('mortality_halal')} />
            </FormField>
            <FormField label="Корм (мешков)">
              <NumberStepper value={entry.feed} onChange={set('feed')} step={0.5} suffix="меш." />
            </FormField>
            <FormField label="Вода (литров)">
              <NumberStepper value={entry.water} onChange={set('water')} step={1} suffix="л" />
            </FormField>
            <FormField label="Масса (г/гол, перезаписывает)">
              <NumberStepper value={entry.weight} onChange={set('weight')} step={10} suffix="г" />
            </FormField>
          </div>
          {saved && <p className="text-sm mt-3" style={{ color: '#28a745' }}>Сохранено ✓</p>}
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Route `/daily-entry` to the real page**

In `src/mobile/TelegramApp.jsx`:

```jsx
import MobileDailyEntryPage from './pages/MobileDailyEntryPage';
// ...
<Route path="/daily-entry" element={<MobileDailyEntryPage />} />
```

- [ ] **Step 4: Verify lint + build**

Run: `npm run lint && npm run build`
Expected: pass.

- [ ] **Step 5: Verify the write path + summary sync against real data**

With real credentials (as in Task 8 Step 6): open `http://localhost:5173/?tg_debug=1`, link with real creds, go to "Ввод".
1. Pick a workshop, enter падёж ест. `1`, tap the native MainButton (in the mock: `javascript_tool` → `window.Telegram.WebApp.MainButton._click()`).
2. Expect "Сохранено ✓", fields cleared.
3. In the Browser pane open a second tab to the desktop app `/daily-entry` (no `tg_debug`) for that date — the workshop shows the incremented mortality.
4. Open the desktop `/` batches list — the "⭐ Общая партия (Сводка)" batch's mortality reflects the new entry (proves `syncSummaryBatchLog` ran).
If no real credentials: verify lint/build only and the non-data states (empty workshops `EmptyState`, loading spinner); note in the task PR that the write path needs a manual data check before deploy.

- [ ] **Step 6: Commit**

```bash
git add src/mobile/components/FormField.jsx src/mobile/components/NumberStepper.jsx src/mobile/components/SegmentedControl.jsx src/mobile/pages/MobileDailyEntryPage.jsx src/mobile/TelegramApp.jsx
git commit -m "feat(mobile): add daily-entry screen with MainButton save and summary sync"
```

> Reviewer note: this task writes `daily_logs`. Verify `syncSummaryBatchLog(logDate, user.id)` is called on **every** successful insert and update path, and that `mortality` always equals `mortality_natural + mortality_halal`.

---

## Task 10: Deployment docs + CLAUDE.md

**Files:**
- Create: `docs/telegram-mini-app.md`
- Modify: `CLAUDE.md`

**Interfaces:** none (documentation only).

- [ ] **Step 1: Write `docs/telegram-mini-app.md`**

Include, as concrete steps:

```markdown
# Telegram Mini App — setup & deploy

## 1. Bot (BotFather, one-time)
1. Talk to @BotFather → `/newbot` → get the **bot token**.
2. `/newapp` (or `/mybots` → the bot → **Bot Settings → Menu Button** /
   **Configure Mini App**) → set the Web App URL to the deployed site
   (e.g. `https://<project>.vercel.app`).
3. Optionally set the Menu Button text (e.g. "Открыть").

## 2. Supabase (per environment)
The two "Broiler app" projects were INACTIVE at authoring time — restore the
one that `VITE_SUPABASE_URL` in `.env.local` points at, then:

1. Apply the migration:
   `npx supabase link --project-ref <ref>` then `npx supabase db push`
   (or run `supabase/migrations/20260910120000_create_telegram_links.sql`
   via the SQL editor).
2. Deploy the function:
   `npx supabase functions deploy telegram-auth --project-ref <ref>`
3. Set secrets:
   `npx supabase secrets set TELEGRAM_BOT_TOKEN=<token> ALLOWED_ORIGIN=https://<project>.vercel.app --project-ref <ref>`
   (`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.)

## 3. Verify (manual matrix)
Run each in the real bot:
1. New user → LinkingScreen → real web creds → app opens; re-open bot → no form.
2. Returning linked user → straight to Batches.
3. `daily_logs` write on "Ввод" → summary batch updates on desktop.
4. Tamper check: any non-Telegram browser hitting the site → desktop UI, unaffected.
5. Toggle Telegram light/dark → theme follows.
6. BackButton on `/batch/:id`; MainButton "Сохранить" on "Ввод".

## 4. Local dev without Telegram
`npm run dev` then open `http://localhost:5173/?tg_debug=1`
(`&tg_linked=1` to skip linking, `&tg_dark=1` for dark theme).
The Edge Function is not called in mock mode; `telegramLink` still runs a
real `signInWithPassword`, so use real credentials to reach the screens.
```

- [ ] **Step 2: Add a section to `CLAUDE.md`**

Under `## Architecture`, add:

```markdown
### Mobile / Telegram Mini App shell

`src/App.jsx` is a platform switch: outside Telegram it renders
`src/DesktopApp.jsx` (the original app, unchanged); inside a Telegram Mini
App (`window.Telegram.WebApp.initData` present) it renders
`src/mobile/TelegramApp.jsx` — a separate `<Routes>` tree mirroring the
desktop paths, under `src/mobile/layouts/TelegramLayout.jsx` (bottom-tab
nav). Auth is automatic via Telegram `initData`, verified by the
`supabase/functions/telegram-auth` Edge Function against `telegram_links`;
first launch asks for web credentials once to create the link. Mobile
screens live in `src/mobile/pages/` and reuse `src/hooks`, `src/utils`,
`src/constants` unchanged. Not-yet-ported routes render `<MobileStub>`.
See `docs/telegram-mini-app.md`. Dev without Telegram: `?tg_debug=1`.
```

- [ ] **Step 3: Verify build still clean**

Run: `npm run lint && npm run build`
Expected: pass (docs-only change, sanity check).

- [ ] **Step 4: Commit**

```bash
git add docs/telegram-mini-app.md CLAUDE.md
git commit -m "docs: add Telegram Mini App setup and architecture notes"
```

---

## Self-Review

**1. Spec coverage**

| Spec section | Task(s) |
|---|---|
| Платформенный свитч (`App.jsx` → `DesktopApp.jsx`) | 4 |
| `src/mobile/` дерево | 4–9 |
| Детект контекста, `isTelegram()`, SDK `<script>` | 4, 5 |
| Мост темы (`themeParams` → CSS vars, `@theme`, `themeChanged`) | 5 |
| Таблица `telegram_links` + RLS | 1 |
| Edge Function `telegram-auth` (`login` / `link`, HMAC, 24h, magiclink) | 2, 3 |
| `_shared/cors.ts` | 3 |
| Клиентский оркестратор `auth.js` (session-first, dev-mock, verifyOtp) | 6 |
| `SplashScreen` / `LinkingScreen` / `AuthErrorScreen` | 6 |
| `TelegramApp` (ThemeProvider + AuthGate + Routes) | 6, 7 |
| `TelegramLayout` + `BottomTabBar` + `MoreSheet` | 7 |
| `useTelegramBackButton` / `useTelegramMainButton` / `useTelegramHaptics` | 7 |
| `MobileStub` на всех неготовых маршрутах | 7 |
| Примитивы `components/*` | 6 (Spinner), 7 (BottomSheet), 8 (Card/ListRow/SectionHeader/StatusPill/EmptyState), 9 (FormField/NumberStepper/SegmentedControl) |
| `MobileBatchesPage` | 8 |
| `MobileDailyEntryPage` + `syncSummaryBatchLog` | 9 |
| `?tg_debug=1` dev-харнесс | 4 (mock), used 5–9 |
| `deno test` на HMAC | 2 |
| Ручная матрица, bot setup, deploy | 10 |
| `index.html`, `src/index.css`, `CLAUDE.md` правки | 5, 10 |
| Admin — `TelegramAdminApp` стаб | Deferred: the `*` route renders `<MobileStub>`; a dedicated admin stub is folded into sub-project C. Noted here as a conscious deferral — the spec lists admin screens under roadmap C, and an admin user opening the Mini App still gets a functioning (stubbed) shell via the catch-all route. |

**2. Placeholder scan:** No "TBD"/"TODO"/"handle edge cases" left. Every code step has full code. The two "if no real credentials" fallbacks in Tasks 8–9 are explicit alternative verification procedures, not deferrals of work.

**3. Type consistency:** `verifyInitData`/`signInitData`/`VerifyResult`/`TelegramUser` consistent across Tasks 2–3. `telegramSignIn()` returns `{status: 'ok'|'need-link'|'error', message?}` — consumed with those exact literals in `TelegramApp` (Task 6). `telegramLink()` returns `{ok, message?}` — consumed in `LinkingScreen` (Task 6). `useTelegramMainButton` param object `{text,onClick,visible,loading,enabled}` — call site in Task 9 passes `{text,onClick,visible,loading}` (enabled defaults true). RPC row fields used in Task 8 match `get_batches_with_stats` `RETURNS TABLE` exactly. `syncSummaryBatchLog(logDate, userId)` signature matches `src/utils/summaryBatchSync.js`.

**Deviation from spec's "not touched" list:** `src/main.jsx` gets a 2-line dev-only `installTelegramMock()` call (Task 4). Justified: the mock must install before `isTelegram()` runs; the call is guarded by `import.meta.env.DEV` and the `tg_debug` param, so production behavior is unchanged.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-10-telegram-mini-app-foundation.md`. Two execution options:

1. **Subagent-Driven (recommended)** — a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
