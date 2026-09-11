// src/mobile/pages/admin/MobileAdminDashboardPage.jsx
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../supabaseClient';
import TrendChart from '../../../components/admin/TrendChart';
import Card from '../../components/Card';
import StatGrid from '../../components/StatGrid';
import SectionHeader from '../../components/SectionHeader';
import EmptyState from '../../components/EmptyState';
import Spinner from '../../components/Spinner';

const fieldClass = 'w-full rounded-xl px-3 bg-tg-secondary text-tg-text';
const numberFmt = (n) => Number(n || 0).toLocaleString('ru-RU');
const shortDateFmt = (v) => (v ? new Date(v).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) : '');

export default function MobileAdminDashboardPage() {
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [platformTrend, setPlatformTrend] = useState([]);
  const [trendError, setTrendError] = useState(null);

  const [search, setSearch] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setError(null);
    const [summaryRes, trendRes] = await Promise.all([
      supabase.rpc('admin_client_summary'),
      supabase.rpc('admin_platform_trend'),
    ]);
    if (summaryRes.error) setError(summaryRes.error.message);
    setClients(summaryRes.data || []);
    if (trendRes.error) setTrendError(trendRes.error.message);
    else setPlatformTrend(trendRes.data || []);
    setLoading(false);
  }

  const filteredSorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? clients.filter((c) => c.email?.toLowerCase().includes(q)) : clients;
    return [...list].sort((a, b) => String(a.email || '').localeCompare(String(b.email || '')));
  }, [clients, search]);

  const totals = useMemo(() => clients.reduce((acc, c) => ({
    workshops: acc.workshops + c.workshops_count,
    activeBatches: acc.activeBatches + c.active_batches,
    flock: acc.flock + c.current_flock,
    expenses: acc.expenses + Number(c.expenses_total),
    sales: acc.sales + Number(c.sales_total),
  }), { workshops: 0, activeBatches: 0, flock: 0, expenses: 0, sales: 0 }), [clients]);

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;
  if (error) return <p className="text-tg-destructive py-6">Ошибка: {error}</p>;

  const mortalitySeries = [{ key: 'mortality', label: 'Падёж (голов)', color: '#dc3545' }];
  const expensesSeries = [{ key: 'expenses', label: 'Расходы', color: '#dc3545' }];
  const salesSeries = [{ key: 'sales', label: 'Продажи', color: '#007bff' }];

  return (
    <div className="flex flex-col gap-3 py-3">
      <StatGrid items={[
        { label: 'Клиентов', value: clients.length, color: '#4f46e5' },
        { label: 'Цехов всего', value: totals.workshops, color: '#6f42c1' },
        { label: 'Активных партий', value: totals.activeBatches, color: '#28a745' },
        { label: 'Текущее поголовье', value: numberFmt(totals.flock), color: '#fd7e14' },
        { label: 'Расходы всего', value: numberFmt(totals.expenses), color: '#dc3545' },
        { label: 'Продажи всего', value: numberFmt(totals.sales), color: '#007bff' },
      ]} />

      <SectionHeader>Динамика по платформе (по неделям)</SectionHeader>
      {trendError ? (
        <p className="text-sm text-tg-destructive">Ошибка загрузки тренда: {trendError}</p>
      ) : (
        <div className="flex flex-col gap-4">
          <Card>
            <p className="text-xs text-tg-hint mb-2">Падёж, голов/неделя</p>
            <TrendChart data={platformTrend} xKey="week_start" series={mortalitySeries} formatX={shortDateFmt} height={130} />
          </Card>
          <Card>
            <p className="text-xs text-tg-hint mb-2">Расходы/неделя</p>
            <TrendChart data={platformTrend} xKey="week_start" series={expensesSeries} formatX={shortDateFmt} height={130} />
          </Card>
          <Card>
            <p className="text-xs text-tg-hint mb-2">Продажи/неделя</p>
            <TrendChart data={platformTrend} xKey="week_start" series={salesSeries} formatX={shortDateFmt} height={130} />
          </Card>
        </div>
      )}

      <SectionHeader>Клиенты</SectionHeader>
      <input
        type="text"
        placeholder="Поиск по email..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className={fieldClass}
        style={{ minHeight: 44 }}
      />

      {filteredSorted.length === 0 ? (
        <EmptyState icon="👥" title={search ? 'Ничего не найдено' : 'Клиентов пока нет'} />
      ) : (
        filteredSorted.map((c) => (
          <Card key={c.client_user_id} onClick={() => navigate(`/client/${c.client_user_id}`)}>
            <p className="text-base font-semibold" style={{ color: 'var(--tg-link, #4f46e5)' }}>{c.email}</p>
            <p className="text-xs text-tg-hint mt-1">
              {c.workshops_count} цех(ов) · {c.active_batches} активных партий · {numberFmt(c.current_flock)} гол.
            </p>
            <div className="flex items-center justify-between mt-1">
              <p className="text-xs" style={{ color: c.mortality_total > 0 ? '#dc3545' : 'var(--tg-hint)' }}>
                Падёж: {numberFmt(c.mortality_total)}
              </p>
              <p className="text-xs text-tg-hint">Расходы: {numberFmt(c.expenses_total)} · Продажи: {numberFmt(c.sales_total)}</p>
            </div>
            <p className="text-xs text-tg-hint mt-1">
              Последний вход: {c.last_sign_in_at ? new Date(c.last_sign_in_at).toLocaleString('ru-RU') : '—'}
            </p>
          </Card>
        ))
      )}
    </div>
  );
}
