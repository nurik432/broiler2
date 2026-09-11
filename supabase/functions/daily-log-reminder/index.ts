// supabase/functions/daily-log-reminder/index.ts
//
// Triggered once a day by a pg_cron + pg_net job (see
// supabase/migrations/20260911200100_schedule_daily_log_reminder.sql) — not
// meant to be called from the client. Checks which active workshops (with an
// active, non-summary batch) have no daily_logs row for "yesterday" in the
// farm's local timezone, and sends one Telegram message per affected owner
// listing their missed workshops.
import { createClient } from "npm:@supabase/supabase-js@2";
import { json, preflight } from "../_shared/cors.ts";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET")!;

// The farm's local timezone as a fixed UTC offset (no DST in Tajikistan).
// Adjust if the deployment is used elsewhere.
const TZ_OFFSET_HOURS = 5;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function yesterdayInLocalTz(): string {
  const localNow = new Date(Date.now() + TZ_OFFSET_HOURS * 60 * 60 * 1000);
  localNow.setUTCDate(localNow.getUTCDate() - 1);
  return localNow.toISOString().slice(0, 10);
}

async function sendTelegramMessage(chatId: number, text: string) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (!res.ok) {
    console.error("Telegram sendMessage failed for", chatId, await res.text());
  }
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  // Only the scheduled cron job may trigger this — never a public caller.
  if (req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return json({ error: "unauthorized" }, 401);
  }

  const targetDate = yesterdayInLocalTz();

  const { data: missing, error } = await admin.rpc("get_workshops_missing_log", {
    target_date: targetDate,
  });
  if (error) return json({ error: error.message }, 500);
  if (!missing || missing.length === 0) {
    return json({ ok: true, date: targetDate, notified: 0, missing_workshops: 0 });
  }

  const byUser = new Map<string, { workshop_name: string; batch_name: string }[]>();
  for (const row of missing) {
    const list = byUser.get(row.user_id) ?? [];
    list.push({ workshop_name: row.workshop_name, batch_name: row.batch_name });
    byUser.set(row.user_id, list);
  }

  const { data: links, error: linksError } = await admin
    .from("telegram_links")
    .select("user_id, tg_id")
    .in("user_id", Array.from(byUser.keys()));
  if (linksError) return json({ error: linksError.message }, 500);

  const dateLabel = new Date(targetDate).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  let notified = 0;
  for (const link of links ?? []) {
    const workshops = byUser.get(link.user_id);
    if (!workshops || workshops.length === 0) continue;
    const lines = workshops.map((w) => `• ${w.workshop_name} (${w.batch_name})`).join("\n");
    const text = `⚠️ За ${dateLabel} не внесён журнал по цехам:\n${lines}\n\nЗаполните в разделе «Дневной ввод».`;
    await sendTelegramMessage(link.tg_id, text);
    notified++;
  }

  return json({ ok: true, date: targetDate, notified, missing_workshops: missing.length });
});
