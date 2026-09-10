// supabase/functions/telegram-auth/index.ts
import { createClient } from "npm:@supabase/supabase-js@2";
import { verifyInitData } from "./verify.ts";
import { json, preflight } from "../_shared/cors.ts";

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
  if (
    !initData ||
    (action !== "login" && action !== "link" && action !== "unlink")
  ) {
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

  // action === "link" | "unlink": caller already signed in with email/password.
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "missing_token" }, 401);

  const { data: userRes, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userRes?.user) return json({ error: "bad_token" }, 401);
  const user = userRes.user;

  if (action === "unlink") {
    const { error: delErr } = await admin
      .from("telegram_links")
      .delete()
      .eq("tg_id", tgId);
    if (delErr) return json({ error: "db_error" }, 500);
    return json({ ok: true });
  }

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
  if (upsertErr) {
    if (upsertErr.code === "23505") {
      return json({ error: "account_already_linked" }, 409);
    }
    return json({ error: "db_error" }, 500);
  }
  return json({ ok: true });
});
