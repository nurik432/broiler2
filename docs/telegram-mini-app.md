# Telegram Mini App — setup & deploy

## 1. Bot (BotFather, one-time)

1. Talk to @BotFather → `/newbot` → get the **bot token**.
2. `/newapp` (or `/mybots` → the bot → **Bot Settings → Menu Button** / **Configure Mini App**) → set the Web App URL to the deployed site (e.g. `https://<project>.vercel.app`).
3. Optionally set the Menu Button text (e.g. "Открыть").

## 2. Supabase (per environment)

The two "Broiler app" projects were INACTIVE at authoring time — restore the one that `VITE_SUPABASE_URL` in `.env.local` points at, then:

1. Apply the migration:
   ```bash
   npx supabase link --project-ref <ref>
   npx supabase db push
   ```
   Or run `supabase/migrations/20260910120000_create_telegram_links.sql` via the SQL editor.

2. Deploy the function:
   ```bash
   npx supabase functions deploy telegram-auth --project-ref <ref>
   ```
   `supabase/config.toml` carries `[functions.telegram-auth] verify_jwt = false`,
   which `supabase functions deploy` reads — so the function deploys with the
   gateway's JWT check **off**. This is required: the function does its own auth
   (HMAC over the Telegram `initData`, plus `admin.auth.getUser(jwt)` for
   `link`/`unlink`), and the anon `login` path carries only the anon key, which
   the gateway would otherwise 401 before the function body runs. If deploying
   from an older CLI that ignores `config.toml`, pass `--no-verify-jwt`
   explicitly.

3. Set secrets:
   ```bash
   npx supabase secrets set TELEGRAM_BOT_TOKEN=<token> ALLOWED_ORIGIN=https://<project>.vercel.app --project-ref <ref>
   ```
   (`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.)

**Note:** If the Supabase edge runtime fails to boot the function with the JSR specifier (`jsr:@supabase/supabase-js`), switch `supabase/functions/telegram-auth/index.ts`'s import to `npm:@supabase/supabase-js@2` (or `https://esm.sh/@supabase/supabase-js@2`) and redeploy.

## 3. Verify (manual matrix)

Run each in the real bot:

1. **New user flow** → LinkingScreen → real web credentials → app opens; re-open bot → no form (linked).
2. **Returning linked user** → straight to Batches.
3. **Summary batch sync** → `daily_logs` write on "Ввод" (daily entry) → summary batch updates on desktop.
4. **Tamper check** → any non-Telegram browser hitting the site → desktop UI, unaffected.
5. **Theme toggle** → Telegram light/dark → theme follows in mini app.
6. **Navigation buttons** → BackButton on `/batch/:id`; MainButton "Сохранить" on "Ввод".

## 4. Local dev without Telegram

`npm run dev` then open `http://localhost:5173/?tg_debug=1`

- `&tg_linked=1` to skip the linking screen
- `&tg_dark=1` for dark theme

The Edge Function is not called in mock mode; `telegramLink` still runs a real `signInWithPassword`, so use real credentials to reach the screens.
