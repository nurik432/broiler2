// src/mobile/TelegramApp.jsx
import { useCallback, useEffect, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { initTelegram } from './telegram/sdk';
import { applyThemeParams, subscribeTheme } from './telegram/theme';
import { telegramSignIn } from './telegram/auth';
import SplashScreen from './screens/SplashScreen';
import LinkingScreen from './screens/LinkingScreen';
import AuthErrorScreen from './screens/AuthErrorScreen';
import TelegramLayout from './layouts/TelegramLayout';
import TelegramAdminLayout from './layouts/TelegramAdminLayout';
import MobileStub from './screens/MobileStub';
import MobileBatchesPage from './pages/MobileBatchesPage';
import MobileDailyEntryPage from './pages/MobileDailyEntryPage';
import MobileBatchReportPage from './pages/MobileBatchReportPage';
import MobileWorkshopsPage from './pages/MobileWorkshopsPage';
import MobileWorkshopDetailPage from './pages/workshops/MobileWorkshopDetailPage';
import MobileTasksPage from './pages/MobileTasksPage';
import MobileBatchLogPage from './pages/MobileBatchLogPage';
import MobileExpensesPage from './pages/MobileExpensesPage';
import MobileSalesPage from './pages/MobileSalesPage';
import MobileDebtsPage from './pages/MobileDebtsPage';
import MobileFeedPage from './pages/MobileFeedPage';
import MobileCoalPage from './pages/MobileCoalPage';
import MobileGasPage from './pages/MobileGasPage';
import MobileSalariesPage from './pages/MobileSalariesPage';
import MobileMedicinesPage from './pages/MobileMedicinesPage';
import MobileNotesPage from './pages/MobileNotesPage';
import MobileAdminDashboardPage from './pages/admin/MobileAdminDashboardPage';
import MobileAdminCreateClientPage from './pages/admin/MobileAdminCreateClientPage';
import MobileAdminClientDetailPage from './pages/admin/MobileAdminClientDetailPage';

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
  const [isAdmin, setIsAdmin] = useState(null); // null = checking

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (mounted) setIsAdmin(session?.user?.app_metadata?.role === 'admin');
    });
    return () => { mounted = false; };
  }, []);

  if (isAdmin === null) return <SplashScreen message="Загрузка…" />;
  return isAdmin ? <AdminRoutes /> : <ClientRoutes />;
}

function AdminRoutes() {
  return (
    <Routes>
      <Route element={<TelegramAdminLayout />}>
        <Route path="/" element={<MobileAdminDashboardPage />} />
        <Route path="/create-client" element={<MobileAdminCreateClientPage />} />
        <Route path="/client/:clientId" element={<MobileAdminClientDetailPage />} />
        <Route path="*" element={<MobileAdminDashboardPage />} />
      </Route>
    </Routes>
  );
}

function ClientRoutes() {
  return (
    <Routes>
      <Route element={<TelegramLayout />}>
        <Route path="/" element={<MobileBatchesPage />} />
        <Route path="/daily-entry" element={<MobileDailyEntryPage />} />
        <Route path="/tasks" element={<MobileTasksPage />} />
        <Route path="/workshops" element={<MobileWorkshopsPage />} />
        <Route path="/workshops/:workshopId" element={<MobileWorkshopDetailPage />} />
        <Route path="/medicines" element={<MobileMedicinesPage />} />
        <Route path="/expenses" element={<MobileExpensesPage />} />
        <Route path="/salaries" element={<MobileSalariesPage />} />
        <Route path="/debts" element={<MobileDebtsPage />} />
        <Route path="/notes" element={<MobileNotesPage />} />
        <Route path="/sales" element={<MobileSalesPage />} />
        <Route path="/feed" element={<MobileFeedPage />} />
        <Route path="/coal" element={<MobileCoalPage />} />
        <Route path="/gas" element={<MobileGasPage />} />
        <Route path="/batch/:batchId" element={<MobileBatchLogPage />} />
        <Route path="/batch/:batchId/report" element={<MobileBatchReportPage />} />
        <Route path="*" element={<MobileStub title="Раздел" />} />
      </Route>
    </Routes>
  );
}
