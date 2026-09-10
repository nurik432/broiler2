// src/mobile/telegram/theme.js
import { getWebApp } from './context';

const FALLBACK_LIGHT = {
  bg_color: '#ffffff', text_color: '#000000', hint_color: '#707579',
  link_color: '#2481cc', button_color: '#2481cc', button_text_color: '#ffffff',
  secondary_bg_color: '#efeff4', section_bg_color: '#ffffff',
  destructive_text_color: '#df3f40',
};
const FALLBACK_DARK = {
  bg_color: '#17212b', text_color: '#f5f5f5', hint_color: '#708499',
  link_color: '#6ab7ff', button_color: '#5288c1', button_text_color: '#ffffff',
  secondary_bg_color: '#232e3c', section_bg_color: '#17212b',
  destructive_text_color: '#ec3942',
};

const VAR_MAP = {
  bg_color: '--tg-bg',
  text_color: '--tg-text',
  hint_color: '--tg-hint',
  link_color: '--tg-link',
  button_color: '--tg-button',
  button_text_color: '--tg-button-text',
  secondary_bg_color: '--tg-secondary-bg',
  section_bg_color: '--tg-section-bg',
  destructive_text_color: '--tg-destructive',
};

export function applyThemeParams() {
  const wa = getWebApp();
  const scheme = wa?.colorScheme === 'dark' ? 'dark' : 'light';
  const base = scheme === 'dark' ? FALLBACK_DARK : FALLBACK_LIGHT;
  const params = { ...base, ...(wa?.themeParams || {}) };
  const root = document.documentElement;
  for (const [key, cssVar] of Object.entries(VAR_MAP)) {
    if (params[key]) root.style.setProperty(cssVar, params[key]);
  }
  root.setAttribute('data-theme', scheme);
  root.style.setProperty('color-scheme', scheme);
}

export function subscribeTheme(cb) {
  const wa = getWebApp();
  if (!wa?.onEvent) return () => {};
  const handler = () => { applyThemeParams(); cb?.(); };
  wa.onEvent('themeChanged', handler);
  return () => wa.offEvent?.('themeChanged', handler);
}
