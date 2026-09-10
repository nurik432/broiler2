// src/mobile/telegram/useTelegramHaptics.js
import { getWebApp } from './context';

export function useTelegramHaptics() {
  const hf = getWebApp()?.HapticFeedback;
  return {
    success() { try { hf?.notificationOccurred?.('success'); } catch { /* noop */ } },
    impact() { try { hf?.impactOccurred?.('light'); } catch { /* noop */ } },
  };
}
