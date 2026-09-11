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

## 4. Daily-log reminder (optional)

Sends a Telegram message to a farm's owner if any of their active workshops
(with an active batch) has no `daily_logs` entry for "yesterday" — runs once
a day via `pg_cron` + `pg_net` calling the `daily-log-reminder` Edge
Function. Skip this section if you don't want the reminder.

1. Apply the two new migrations (RPC + cron schedule) the same way as step 2
   above (`supabase db push`, or run them via the SQL editor):
   `20260911200000_create_get_workshops_missing_log.sql` and
   `20260911200100_schedule_daily_log_reminder.sql`.

2. Deploy the function and set its secret:
   ```bash
   npx supabase functions deploy daily-log-reminder --project-ref <ref>
   npx supabase secrets set CRON_SECRET=<a-random-string> --project-ref <ref>
   ```
   `verify_jwt = false` is already set in `supabase/config.toml` — the
   function checks the `x-cron-secret` header itself instead, since the cron
   job has no user session to present.

3. In the SQL editor, store the three secrets the cron job reads at every run
   (Vault, not plaintext in the migration, since the project URL/keys aren't
   known at migration-authoring time):
   ```sql
   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
   select vault.create_secret('<anon-key-from-Settings-API>', 'anon_key');
   select vault.create_secret('<the-same-random-string-as-CRON_SECRET>', 'cron_secret');
   ```

4. Verify: `select * from cron.job;` shows the `daily-log-reminder` job;
   `select * from cron.job_run_details order by start_time desc limit 5;`
   shows run history after it's fired once. To trigger it manually for
   testing without waiting for the schedule:
   ```bash
   curl -X POST https://<ref>.supabase.co/functions/v1/daily-log-reminder \
     -H "apikey: <anon-key>" -H "x-cron-secret: <the-random-string>"
   ```

**Notes:**
- The schedule (`0 4 * * *`, i.e. 04:00 UTC) and the "yesterday" calculation
  both assume Asia/Dushanbe (UTC+5, no DST) — see `TZ_OFFSET_HOURS` in
  `supabase/functions/daily-log-reminder/index.ts`. Change both together if
  the farm is elsewhere.
- To change the schedule later: `select cron.alter_job(job_id, schedule =>
  '<new cron expression>')` (find `job_id` via `select * from cron.job;`), or
  `select cron.unschedule('daily-log-reminder');` then re-run the
  `cron.schedule(...)` block from the migration with a new expression.
- A workshop only gets reminded about the specific missed date once — the
  job always checks yesterday relative to when it runs, so it never repeats
  a reminder for the same day twice.

## 5. Local dev without Telegram

`npm run dev` then open `http://localhost:5173/?tg_debug=1`

- `&tg_linked=1` to skip the linking screen
- `&tg_dark=1` for dark theme

The Edge Function is not called in mock mode; `telegramLink` still runs a real `signInWithPassword`, so use real credentials to reach the screens.
