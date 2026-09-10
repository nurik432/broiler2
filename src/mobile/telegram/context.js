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
