// src/mobile/layouts/BottomTabBar.jsx
import { NavLink } from 'react-router-dom';

const TABS = [
  ['/', 'Партии', '🐔'],
  ['/daily-entry', 'Ввод', '📝'],
  ['/expenses', 'Расходы', '💸'],
];

export default function BottomTabBar({ onMore }) {
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 flex bg-tg-bg border-t"
      style={{ borderColor: 'var(--tg-secondary-bg)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {TABS.map(([to, label, icon]) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className="flex-1 flex flex-col items-center justify-center py-2 text-xs"
          style={({ isActive }) => ({
            color: isActive ? 'var(--tg-link)' : 'var(--tg-hint)',
            minHeight: 56,
          })}
        >
          <span className="text-lg leading-none mb-0.5">{icon}</span>
          {label}
        </NavLink>
      ))}
      <button
        onClick={onMore}
        className="flex-1 flex flex-col items-center justify-center py-2 text-xs"
        style={{ color: 'var(--tg-hint)', minHeight: 56 }}
      >
        <span className="text-lg leading-none mb-0.5">☰</span>
        Ещё
      </button>
    </nav>
  );
}
