// src/mobile/layouts/TelegramAdminLayout.jsx
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { telegramUnlink } from '../telegram/auth';
import { useTelegramBackButton } from '../telegram/useTelegramBackButton';

const TITLES = {
  '/': 'Клиенты',
  '/create-client': 'Новый клиент',
};

export default function TelegramAdminLayout() {
  const { pathname } = useLocation();
  useTelegramBackButton();

  const title = TITLES[pathname] || (pathname.startsWith('/client/') ? 'Клиент' : 'Админ');

  return (
    <div className="min-h-screen bg-tg-bg text-tg-text flex flex-col">
      <header className="px-4 py-3 flex items-center justify-between bg-tg-bg">
        <span className="text-lg font-semibold">🛡️ {title}</span>
        <button
          type="button"
          onClick={async () => { await telegramUnlink(); window.location.reload(); }}
          className="text-sm text-tg-destructive"
          style={{ minHeight: 44 }}
        >
          Выйти
        </button>
      </header>
      <main className="flex-1 overflow-y-auto px-4" style={{ paddingBottom: 'calc(56px + env(safe-area-inset-bottom) + 8px)' }}>
        <Outlet />
      </main>
      <nav
        className="fixed bottom-0 inset-x-0 z-40 flex bg-tg-bg border-t"
        style={{ borderColor: 'var(--tg-secondary-bg)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <NavLink
          to="/" end
          className="flex-1 flex flex-col items-center justify-center py-2 text-xs"
          style={({ isActive }) => ({ color: isActive ? 'var(--tg-link)' : 'var(--tg-hint)', minHeight: 56 })}
        >
          <span className="text-lg leading-none mb-0.5">📊</span>
          Клиенты
        </NavLink>
        <NavLink
          to="/create-client"
          className="flex-1 flex flex-col items-center justify-center py-2 text-xs"
          style={({ isActive }) => ({ color: isActive ? 'var(--tg-link)' : 'var(--tg-hint)', minHeight: 56 })}
        >
          <span className="text-lg leading-none mb-0.5">➕</span>
          Клиент
        </NavLink>
      </nav>
    </div>
  );
}
