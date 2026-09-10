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
    if (!data.token_hash) return { status: 'error', message: 'Сервер не вернул token_hash' };
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
  if (!accessToken) return { ok: false, message: 'Не удалось получить сессию' };

  try {
    const { status, data: res } = await callFn(
      { action: 'link', initData: getInitDataRaw() },
      accessToken,
    );
    if (status !== 200 || !res.ok) {
      return { ok: false, message: res.error || `HTTP ${status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}
