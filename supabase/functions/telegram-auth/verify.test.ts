// supabase/functions/telegram-auth/verify.test.ts
import { assertEquals } from "@std/assert";
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

Deno.test("rejects an auth_date far in the future", async () => {
  const future = Math.floor(Date.now() / 1000) + 90_000; // well beyond the 300s skew
  const initData = await signInitData(baseParams(future), BOT_TOKEN);
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
