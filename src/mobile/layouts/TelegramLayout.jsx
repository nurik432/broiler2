// src/mobile/layouts/TelegramLayout.jsx
import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import BottomTabBar from './BottomTabBar';
import MoreSheet from './MoreSheet';
import { useTelegramBackButton } from '../telegram/useTelegramBackButton';

const TITLES = {
  '/': 'Партии бройлеров',
  '/daily-entry': 'Дневной ввод',
  '/tasks': 'Задачи',
  '/workshops': 'Учёт по цехам',
  '/medicines': 'Лекарства',
  '/expenses': 'Расходы',
  '/salaries': 'Сотрудники и ЗП',
  '/debts': 'Долги',
  '/notes': 'Заметки',
  '/sales': 'Продажи',
  '/feed': 'Корм',
  '/coal': 'Уголь',
};

export default function TelegramLayout() {
  const [moreOpen, setMoreOpen] = useState(false);
  const { pathname } = useLocation();
  useTelegramBackButton();

  const title = TITLES[pathname]
    || (pathname.startsWith('/batch/') && pathname.endsWith('/report') ? 'Отчёт партии' : '')
    || (pathname.startsWith('/batch/') ? 'Партия' : 'Ферма');

  return (
    <div className="min-h-screen bg-tg-bg text-tg-text flex flex-col">
      <header className="px-4 py-3 text-lg font-semibold bg-tg-bg">{title}</header>
      <main className="flex-1 overflow-y-auto px-4" style={{ paddingBottom: 'calc(56px + env(safe-area-inset-bottom) + 8px)' }}>
        <Outlet />
      </main>
      <BottomTabBar onMore={() => setMoreOpen(true)} />
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </div>
  );
}
