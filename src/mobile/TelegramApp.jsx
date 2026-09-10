// src/mobile/TelegramApp.jsx
import { useCallback, useEffect, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { initTelegram } from './telegram/sdk';
import { applyThemeParams, subscribeTheme } from './telegram/theme';
import { telegramSignIn } from './telegram/auth';
import SplashScreen from './screens/SplashScreen';
import LinkingScreen from './screens/LinkingScreen';
import AuthErrorScreen from './screens/AuthErrorScreen';
import TelegramLayout from './layouts/TelegramLayout';
import MobileStub from './screens/MobileStub';

export default function TelegramApp() {
  const [phase, setPhase] = useState('boot'); // boot | linking | error | ready
  const [errMsg, setErrMsg] = useState('');

  useEffect(() => {
    applyThemeParams();
    initTelegram();
    const unsub = subscribeTheme();
    return unsub;
  }, []);

  const run = useCallback(async () => {
    setPhase('boot');
    const { status, message } = await telegramSignIn();
    if (status === 'ok') setPhase('ready');
    else if (status === 'need-link') setPhase('linking');
    else { setErrMsg(message || ''); setPhase('error'); }
  }, []);

  useEffect(() => { run(); }, [run]);

  if (phase === 'boot') return <SplashScreen message="Входим через Telegram…" />;
  if (phase === 'error') return <AuthErrorScreen message={errMsg} onRetry={run} />;
  if (phase === 'linking') return <LinkingScreen onLinked={() => setPhase('ready')} />;

  return <AuthedRoutes />;
}

function AuthedRoutes() {
  return (
    <Routes>
      <Route element={<TelegramLayout />}>
        <Route path="/" element={<MobileStub title="Партии бройлеров" />} />
        <Route path="/daily-entry" element={<MobileStub title="Дневной ввод" />} />
        <Route path="/tasks" element={<MobileStub title="Задачи" />} />
        <Route path="/workshops" element={<MobileStub title="Учёт по цехам" />} />
        <Route path="/medicines" element={<MobileStub title="Лекарства" />} />
        <Route path="/expenses" element={<MobileStub title="Расходы" />} />
        <Route path="/salaries" element={<MobileStub title="Сотрудники и ЗП" />} />
        <Route path="/debts" element={<MobileStub title="Долги" />} />
        <Route path="/notes" element={<MobileStub title="Заметки" />} />
        <Route path="/sales" element={<MobileStub title="Продажи" />} />
        <Route path="/feed" element={<MobileStub title="Корм" />} />
        <Route path="/coal" element={<MobileStub title="Уголь" />} />
        <Route path="/batch/:batchId" element={<MobileStub title="Партия" />} />
        <Route path="/batch/:batchId/report" element={<MobileStub title="Отчёт партии" />} />
        <Route path="*" element={<MobileStub title="Раздел" />} />
      </Route>
    </Routes>
  );
}
