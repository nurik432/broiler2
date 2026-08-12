// src/pages/admin/AdminDashboardPage.jsx

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import TrendChart from '../../components/admin/TrendChart';

const numberFmt = (n) => Number(n || 0).toLocaleString('ru-RU');
const shortDateFmt = (v) => (v ? new Date(v).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) : '');

const COLUMNS = [
  { key: 'email', label: 'Клиент', align: 'left' },
  { key: 'workshops_count', label: 'Цехов', align: 'center' },
  { key: 'active_batches', label: 'Активных партий', align: 'center' },
  { key: 'current_flock', label: 'Поголовье сейчас', align: 'center' },
  { key: 'mortality_total', label: 'Падёж всего', align: 'center' },
  { key: 'expenses_total', label: 'Расходы', align: 'right' },
  { key: 'sales_total', label: 'Продажи', align: 'right' },
  { key: 'last_sign_in_at', label: 'Последний вход', align: 'left' },
];

export default function AdminDashboardPage() {
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [platformTrend, setPlatformTrend] = useState([]);
  const [trendError, setTrendError] = useState(null);

  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('email');
  const [sortDir, setSortDir] = useState('asc');

  useEffect(() => {
    load();
  }, []);

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
    let list = q ? clients.filter((c) => c.email?.toLowerCase().includes(q)) : clients;
    list = [...list].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      let cmp;
      if (typeof av === 'string' || typeof bv === 'string') {
        cmp = String(av || '').localeCompare(String(bv || ''));
      } else {
        cmp = Number(av || 0) - Number(bv || 0);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [clients, search, sortKey, sortDir]);

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>Загрузка...</div>;
  if (error) return <div style={{ padding: 20, color: '#dc3545' }}>Ошибка: {error}</div>;

  const totals = clients.reduce((acc, c) => ({
    workshops: acc.workshops + c.workshops_count,
    activeBatches: acc.activeBatches + c.active_batches,
    flock: acc.flock + c.current_flock,
    expenses: acc.expenses + Number(c.expenses_total),
    sales: acc.sales + Number(c.sales_total),
  }), { workshops: 0, activeBatches: 0, flock: 0, expenses: 0, sales: 0 });

  const mortalitySeries = [{ key: 'mortality', label: 'Падёж (голов)', color: '#dc3545' }];
  const expensesSeries = [{ key: 'expenses', label: 'Расходы', color: '#dc3545' }];
  const salesSeries = [{ key: 'sales', label: 'Продажи', color: '#007bff' }];

  return (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 'bold', color: '#1f2937', marginBottom: 20 }}>
        📊 Сводка по клиентам
      </h2>

      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          { label: 'Клиентов', value: clients.length, color: '#4f46e5' },
          { label: 'Цехов всего', value: totals.workshops, color: '#6f42c1' },
          { label: 'Активных партий', value: totals.activeBatches, color: '#28a745' },
          { label: 'Текущее поголовье', value: numberFmt(totals.flock), color: '#fd7e14' },
          { label: 'Расходы всего', value: numberFmt(totals.expenses), color: '#dc3545' },
          { label: 'Продажи всего', value: numberFmt(totals.sales), color: '#007bff' },
        ].map(s => (
          <div key={s.label} style={{
            padding: '10px 18px', borderRadius: 8, background: s.color + '15',
            border: `1px solid ${s.color}30`, minWidth: 130,
          }}>
            <div style={{ fontSize: 20, fontWeight: 'bold', color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: '#555' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* --- Платформенный тренд (по неделям, все клиенты) --- */}
      <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #dee2e6', padding: 20, marginBottom: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 'bold', color: '#1f2937', margin: '0 0 4px' }}>📈 Динамика по платформе (по неделям)</h3>
        {trendError ? (
          <p style={{ color: '#dc3545', fontSize: 13 }}>Ошибка загрузки тренда: {trendError}</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20, marginTop: 14 }}>
            <div>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>Падёж, голов/неделя</div>
              <TrendChart data={platformTrend} xKey="week_start" series={mortalitySeries} formatX={shortDateFmt} height={130} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>Расходы/неделя</div>
              <TrendChart data={platformTrend} xKey="week_start" series={expensesSeries} formatX={shortDateFmt} height={130} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>Продажи/неделя</div>
              <TrendChart data={platformTrend} xKey="week_start" series={salesSeries} formatX={shortDateFmt} height={130} />
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <input
          type="text"
          placeholder="Поиск по email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid #dee2e6', borderRadius: 6, fontSize: 14, minWidth: 240 }}
        />
        {search && (
          <span style={{ fontSize: 13, color: '#888' }}>Найдено: {filteredSorted.length}</span>
        )}
      </div>

      <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #dee2e6', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f8f9fa' }}>
                {COLUMNS.map(col => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    style={{ padding: '10px 12px', borderBottom: '2px solid #dee2e6', textAlign: col.align, fontWeight: 'bold', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                    title="Сортировать"
                  >
                    {col.label}{sortKey === col.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredSorted.length === 0 ? (
                <tr><td colSpan={COLUMNS.length} style={{ padding: 20, textAlign: 'center', color: '#999' }}>
                  {search ? 'Ничего не найдено' : 'Клиентов пока нет'}
                </td></tr>
              ) : filteredSorted.map(c => (
                <tr
                  key={c.client_user_id}
                  onClick={() => navigate(`/client/${c.client_user_id}`)}
                  style={{ borderBottom: '1px solid #eee', cursor: 'pointer' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#f8f9fa'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <td style={{ padding: '10px 12px', fontWeight: 'bold', color: '#4f46e5' }}>{c.email}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>{c.workshops_count}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>{c.active_batches}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>{numberFmt(c.current_flock)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', color: c.mortality_total > 0 ? '#dc3545' : 'inherit' }}>{numberFmt(c.mortality_total)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>{numberFmt(c.expenses_total)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>{numberFmt(c.sales_total)}</td>
                  <td style={{ padding: '10px 12px', color: '#888', fontSize: 12 }}>
                    {c.last_sign_in_at ? new Date(c.last_sign_in_at).toLocaleString('ru-RU') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
