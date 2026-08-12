// src/App.jsx

import { useState, useEffect } from 'react';
// УДАЛЕН useNavigate отсюда
import { Routes, Route } from 'react-router-dom';
import { supabase } from './supabaseClient';

import Auth from './components/Auth';
import MainLayout from './layouts/MainLayout';
import AdminLayout from './layouts/AdminLayout';
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import AdminCreateClientPage from './pages/admin/AdminCreateClientPage';
import AdminClientDetailPage from './pages/admin/AdminClientDetailPage';
import BatchesPage from './pages/BatchesPage';
import MedicinesPage from './pages/MedicinesPage';
import BatchLogPage from './pages/BatchLogPage';
import ExpensesPage from './pages/ExpensesPage';
import SalariesPage from './pages/SalariesPage';
import NotesPage from './pages/NotesPage';
import SalesPage from './pages/SalesPage';
import FeedPage from './pages/FeedPage';
import BatchReportPage from './pages/BatchReportPage';
import CoalPage from './pages/CoalPage';
import WorkshopsPage from './pages/WorkshopsPage';
import TasksPage from './pages/TasksPage';
import DailyEntryPage from './pages/DailyEntryPage';
import DebtsPage from './pages/DebtsPage';

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      setLoading(false);
    };

    fetchSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Загрузка...</div>;
  }

  if (!session) {
    return <Auth />;
  }

  const isAdmin = session.user?.app_metadata?.role === 'admin';

  if (isAdmin) {
    return (
      <Routes>
        <Route element={<AdminLayout />}>
          <Route path="/" element={<AdminDashboardPage />} />
          <Route path="/create-client" element={<AdminCreateClientPage />} />
          <Route path="/client/:clientId" element={<AdminClientDetailPage />} />
          <Route path="*" element={<AdminDashboardPage />} />
        </Route>
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<BatchesPage />} />
        <Route path="/medicines" element={<MedicinesPage />} />
        <Route path="/expenses" element={<ExpensesPage />} />
        <Route path="/salaries" element={<SalariesPage />} />
        {/* Страница журнала партии теперь тоже внутри MainLayout, чтобы у нее была навигация */}
        <Route path="/batch/:batchId" element={<BatchLogPage />} />
        <Route path="/notes" element={<NotesPage />} />
        <Route path="/sales" element={<SalesPage />} />
        <Route path="/feed" element={<FeedPage />} />
        <Route path="/batch/:batchId/report" element={<BatchReportPage />} />
        <Route path="/coal" element={<CoalPage />} />
        <Route path="/workshops" element={<WorkshopsPage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/daily-entry" element={<DailyEntryPage />} />
        <Route path="/debts" element={<DebtsPage />} />
      </Route>
    </Routes>
  );
}

export default App;