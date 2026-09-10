// src/mobile/telegram/mockTelegram.js
// Dev-only fake Telegram WebApp so the mobile shell can run in a plain browser.
// Activate with ?tg_debug=1  (optionally &tg_linked=1 and &tg_dark=1).

function makeButton() {
  const handlers = new Set();
  return {
    isVisible: false, text: '', isActive: true, isProgressVisible: false,
    show() { this.isVisible = true; }, hide() { this.isVisible = false; },
    setText(t) { this.text = t; }, enable() { this.isActive = true; },
    disable() { this.isActive = false; },
    showProgress() { this.isProgressVisible = true; },
    hideProgress() { this.isProgressVisible = false; },
    onClick(fn) { handlers.add(fn); }, offClick(fn) { handlers.delete(fn); },
    setParams(p) { if (p.text != null) this.text = p.text; },
    _click() { handlers.forEach((h) => h()); },
  };
}

export function installTelegramMock() {
  if (!import.meta.env.DEV) return;
  const params = new URLSearchParams(window.location.search);
  if (params.get('tg_debug') !== '1') return;
  const wa = window.Telegram && window.Telegram.WebApp;
  if (wa && wa.__mock) return;                                                 // already mocked
  if (wa && typeof wa.initData === 'string' && wa.initData.length > 0) return; // real Telegram

  const dark = params.get('tg_dark') === '1';
  const eventHandlers = {};
  const user = { id: 42, username: 'farmer', first_name: 'Иван' };
  const initDataUnsafe = { user, auth_date: Math.floor(Date.now() / 1000), query_id: 'MOCK' };

  window.Telegram = {
    WebApp: {
      __mock: true,
      // The signature is bogus; auth.js short-circuits the network call in mock mode.
      initData: 'user=' + encodeURIComponent(JSON.stringify(user)) +
        '&auth_date=' + initDataUnsafe.auth_date + '&hash=mock',
      initDataUnsafe,
      colorScheme: dark ? 'dark' : 'light',
      themeParams: dark
        ? { bg_color: '#18222d', text_color: '#ffffff', hint_color: '#7d8b99',
            link_color: '#6ab3f3', button_color: '#5288c1', button_text_color: '#ffffff',
            secondary_bg_color: '#131c26', section_bg_color: '#212d3b',
            destructive_text_color: '#ec3942' }
        : { bg_color: '#ffffff', text_color: '#000000', hint_color: '#999999',
            link_color: '#2481cc', button_color: '#2481cc', button_text_color: '#ffffff',
            secondary_bg_color: '#f1f1f1', section_bg_color: '#ffffff',
            destructive_text_color: '#df3f40' },
      isExpanded: true,
      ready() {}, expand() {}, close() {},
      disableVerticalSwipes() {},
      setHeaderColor() {}, setBackgroundColor() {},
      onEvent(name, fn) { (eventHandlers[name] ||= new Set()).add(fn); },
      offEvent(name, fn) { eventHandlers[name]?.delete(fn); },
      BackButton: makeButton(),
      MainButton: makeButton(),
      HapticFeedback: { impactOccurred() {}, notificationOccurred() {}, selectionChanged() {} },
      _mockLinked: params.get('tg_linked') === '1',
    },
  };
}
