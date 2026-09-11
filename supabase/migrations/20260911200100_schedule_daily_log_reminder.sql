-- supabase/migrations/20260911200100_schedule_daily_log_reminder.sql
-- Schedules the daily-log-reminder Edge Function via pg_cron + pg_net.
--
-- REQUIRES three Vault secrets to exist before this job can actually fire
-- (the schedule is created either way, but each run will error until they're
-- set — see docs/telegram-mini-app.md for the exact commands):
--   project_url  — e.g. https://<ref>.supabase.co
--   anon_key     — the project's anon/publishable API key
--   cron_secret  — a random string, must match the CRON_SECRET function secret
--                  (`supabase secrets set CRON_SECRET=...`)

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT cron.schedule(
    'daily-log-reminder',
    '0 4 * * *', -- 04:00 UTC = 09:00 Asia/Dushanbe (UTC+5, no DST)
    $$
    SELECT net.http_post(
        url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url')
            || '/functions/v1/daily-log-reminder',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'apikey', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'anon_key'),
            'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
        ),
        body := '{}'::jsonb
    );
    $$
);
