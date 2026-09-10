// src/mobile/telegram/useTelegramMainButton.js
import { useEffect, useRef } from 'react';
import { getWebApp } from './context';

export function useTelegramMainButton({
  text, onClick, visible = true, loading = false, enabled = true,
}) {
  const cb = useRef(onClick);
  cb.current = onClick;

  useEffect(() => {
    const mb = getWebApp()?.MainButton;
    if (!mb) return;
    const handler = () => cb.current?.();
    mb.setParams?.({ text });
    mb.setText?.(text);
    mb.onClick?.(handler);
    if (visible) mb.show?.(); else mb.hide?.();
    if (enabled && !loading) mb.enable?.(); else mb.disable?.();
    if (loading) mb.showProgress?.(); else mb.hideProgress?.();
    return () => {
      mb.offClick?.(handler);
      mb.hide?.();
      mb.hideProgress?.();
    };
  }, [text, visible, loading, enabled]);
}
