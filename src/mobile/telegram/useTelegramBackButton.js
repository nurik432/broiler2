// src/mobile/telegram/useTelegramBackButton.js
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getWebApp } from './context';

// '/create-client' is the admin shell's second top-level tab (TelegramAdminLayout) —
// harmless to include here since that path doesn't exist in the client route table.
const ROOTS = new Set(['/', '/daily-entry', '/tasks', '/create-client']);

export function useTelegramBackButton() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const bb = getWebApp()?.BackButton;
    if (!bb) return;
    const onClick = () => navigate(-1);
    if (ROOTS.has(location.pathname)) {
      bb.hide?.();
    } else {
      bb.onClick?.(onClick);
      bb.show?.();
    }
    return () => {
      bb.offClick?.(onClick);
      bb.hide?.();
    };
  }, [location.pathname, navigate]);
}
