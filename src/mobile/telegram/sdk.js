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
