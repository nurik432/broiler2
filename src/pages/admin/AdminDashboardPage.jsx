// src/pages/admin/AdminDashboardPage.jsx

import { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';

const numberFmt = (n) => Number(n || 0).toLocaleString('ru-RU');

export default function AdminDashboardPage() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.rpc('admin_client_summary');
    if (error) setError(error.message);
    setClients(data || []);
    setLoading(false);
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

      <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #dee2e6', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f8f9fa' }}>
                {['Клиент', 'Цехов', 'Активных партий', 'Поголовье сейчас', 'Падёж всего', 'Расходы', 'Продажи', 'Последний вход'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', borderBottom: '2px solid #dee2e6', textAlign: 'left', fontWeight: 'bold' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {clients.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: 20, textAlign: 'center', color: '#999' }}>Клиентов пока нет</td></tr>
              ) : clients.map(c => (
                <tr key={c.client_user_id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 'bold' }}>{c.email}</td>
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
