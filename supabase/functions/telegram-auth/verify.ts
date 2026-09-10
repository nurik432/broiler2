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

async function hmacSha256(
  keyBytes: Uint8Array<ArrayBuffer>,
  msg: string,
): Promise<Uint8Array<ArrayBuffer>> {
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
