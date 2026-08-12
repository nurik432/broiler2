// src/pages/admin/AdminClientDetailPage.jsx

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import TrendChart from '../../components/admin/TrendChart';

const numberFmt = (n) => Number(n || 0).toLocaleString('ru-RU');
const dateFmt = (v) => (v ? new Date(v).toLocaleDateString('ru-RU') : '—');
const dateTimeFmt = (v) => (v ? new Date(v).toLocaleString('ru-RU') : '—');
const shortDateFmt = (v) => (v ? new Date(v).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) : '');

export default function AdminClientDetailPage() {
  const { clientId } = useParams();
  const navigate = useNavigate();

  const [detail, setDetail] = useState(null);
  const [trend, setTrend] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [actionError, setActionError] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);

  const [selectedBatchIds, setSelectedBatchIds] = useState([]);

  const [showResetForm, setShowResetForm] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [resetResult, setResetResult] = useState(null);

  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [detailRes, trendRes] = await Promise.all([
      supabase.rpc('admin_client_detail', { target_user_id: clientId }),
      supabase.rpc('admin_client_trend', { target_user_id: clientId }),
    ]);
    if (detailRes.error) setError(detailRes.error.message);
    else setDetail(detailRes.data);
    if (trendRes.error) setError((prev) => prev || trendRes.error.message);
    else setTrend(trendRes.data || []);
    setSelectedBatchIds([]);
    setLoading(false);
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleToggleBan(currentlyBanned) {
    setActionError(null);
    setActionBusy(true);
    const { error } = await supabase.rpc('admin_set_client_banned', {
      target_user_id: clientId,
      banned: !currentlyBanned,
    });
    if (error) setActionError(error.message);
    else await load();
    setActionBusy(false);
  }

  async function handleResetPassword(e) {
    e.preventDefault();
    setResetResult(null);
    if (newPassword.length < 6) {
      setResetResult({ ok: false, message: 'Пароль должен быть не короче 6 символов' });
      return;
    }
    setActionBusy(true);
    const { error } = await supabase.rpc('admin_reset_client_password', {
      target_user_id: clientId,
      new_password: newPassword,
    });
    if (error) {
      setResetResult({ ok: false, message: error.message });
    } else {
      setResetResult({ ok: true, message: 'Пароль обновлён' });
      setNewPassword('');
      setShowResetForm(false);
    }
    setActionBusy(false);
  }

  async function handleDeleteAccount() {
    if (deleteConfirmText.trim() !== detail.profile.email) return;
    setActionError(null);
    setActionBusy(true);
    const { error } = await supabase.rpc('admin_delete_client_account', { target_user_id: clientId });
    if (error) {
      setActionError(error.message);
      setActionBusy(false);
    } else {
      navigate('/');
    }
  }

  function toggleBatch(id) {
    setSelectedBatchIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleDeleteBatches() {
    if (selectedBatchIds.length === 0) return;
    if (!window.confirm(`Удалить ${selectedBatchIds.length} партий(ю)? Все связанные суточные логи будут удалены безвозвратно. Расходы/продажи/поставки корма/зарплаты/задачи/сотрудники, привязанные к этим партиям, сохранятся, но потеряют привязку.`)) return;
    setActionError(null);
    setActionBusy(true);
    const { error } = await supabase.rpc('admin_delete_batches', { batch_ids: selectedBatchIds });
    if (error) setActionError(error.message);
    else await load();
    setActionBusy(false);
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>Загрузка...</div>;
  if (error) return <div style={{ padding: 20, color: '#dc3545' }}>Ошибка: {error}</div>;
  if (!detail) return null;

  const { profile, workshops, batches } = detail;
  const isBanned = !!profile.banned_until;

  const mortalitySeries = [{ key: 'mortality', label: 'Падёж (голов)', color: '#dc3545' }];
  const feedSeries = [{ key: 'feed', label: 'Корм', color: '#fd7e14' }];
  const weightSeries = [{ key: 'avg_weight', label: 'Ср. вес', color: '#28a745' }];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Link to="/" style={{ color: '#4f46e5', fontSize: 13, textDecoration: 'none' }}>&larr; Назад к сводке</Link>
      </div>

      {actionError && (
        <div style={{ padding: 12, marginBottom: 16, background: '#dc354515', border: '1px solid #dc354530', borderRadius: 6, color: '#dc3545', fontSize: 14 }}>
          Ошибка: {actionError}
        </div>
      )}

      {/* --- Профиль и действия --- */}
      <div style={{ background: '#fff', border: '1px solid #dee2e6', borderRadius: 8, padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 'bold', color: '#1f2937', margin: '0 0 6px' }}>{profile.email}</h2>
            <div style={{ fontSize: 13, color: '#888', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <span>Регистрация: {dateTimeFmt(profile.created_at)}</span>
              <span>Последний вход: {dateTimeFmt(profile.last_sign_in_at)}</span>
            </div>
          </div>
          <span style={{
            padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 'bold',
            background: isBanned ? '#dc354515' : '#28a74515',
            color: isBanned ? '#dc3545' : '#28a745',
            border: `1px solid ${isBanned ? '#dc354530' : '#28a74530'}`,
          }}>
            {isBanned ? 'Заблокирован' : 'Активен'}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
          <button
            onClick={() => handleToggleBan(isBanned)}
            disabled={actionBusy}
            style={btnStyle(isBanned ? '#28a745' : '#fd7e14')}
          >
            {isBanned ? 'Разблокировать' : 'Заблокировать вход'}
          </button>
          <button
            onClick={() => { setShowResetForm((v) => !v); setResetResult(null); }}
            disabled={actionBusy}
            style={btnStyle('#4f46e5', true)}
          >
            Сбросить пароль
          </button>
        </div>

        {showResetForm && (
          <form onSubmit={handleResetPassword} style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              minLength={6}
              placeholder="Новый пароль (мин. 6 символов)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              style={inputStyle}
            />
            <button type="submit" disabled={actionBusy} style={btnStyle('#4f46e5')}>Сохранить пароль</button>
          </form>
        )}
        {resetResult && (
          <p style={{ marginTop: 10, fontSize: 13, color: resetResult.ok ? '#28a745' : '#dc3545' }}>{resetResult.message}</p>
        )}

        {/* --- Опасная зона --- */}
        <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px dashed #dc354550' }}>
          <div style={{ fontSize: 12, fontWeight: 'bold', color: '#dc3545', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
            ⚠️ Опасная зона
          </div>
          <p style={{ fontSize: 13, color: '#888', margin: '0 0 10px' }}>
            Удаление аккаунта необратимо: будут удалены сам аккаунт и все его данные (цеха, партии, логи, расходы, продажи и т.д.).
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder={`Введите "${profile.email}" для подтверждения`}
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              style={{ ...inputStyle, minWidth: 260 }}
            />
            <button
              onClick={handleDeleteAccount}
              disabled={actionBusy || deleteConfirmText.trim() !== profile.email}
              style={{
                ...btnStyle('#dc3545'),
                opacity: deleteConfirmText.trim() !== profile.email ? 0.4 : 1,
                cursor: deleteConfirmText.trim() !== profile.email ? 'not-allowed' : 'pointer',
              }}
            >
              Удалить аккаунт навсегда
            </button>
          </div>
        </div>
      </div>

      {/* --- Тренды --- */}
      <div style={{ background: '#fff', border: '1px solid #dee2e6', borderRadius: 8, padding: 20, marginBottom: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 'bold', color: '#1f2937', margin: '0 0 14px' }}>📈 Динамика (последние 90 дней)</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20 }}>
          <div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>Падёж, голов/день</div>
            <TrendChart data={trend} xKey="log_date" series={mortalitySeries} formatX={shortDateFmt} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>Корм, кг/день</div>
            <TrendChart data={trend} xKey="log_date" series={feedSeries} formatX={shortDateFmt} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>Средний вес, г</div>
            <TrendChart data={trend} xKey="log_date" series={weightSeries} formatX={shortDateFmt} />
          </div>
        </div>
      </div>

      {/* --- Цеха --- */}
      <div style={{ background: '#fff', border: '1px solid #dee2e6', borderRadius: 8, padding: 20, marginBottom: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 'bold', color: '#1f2937', margin: '0 0 14px' }}>🏭 Цеха ({workshops.length})</h3>
        {workshops.length === 0 ? (
          <p style={{ color: '#999', fontSize: 14 }}>Цехов пока нет</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ background: '#f8f9fa' }}>
                  {['Название', 'Вместимость', 'Статус'].map((h) => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {workshops.map((w) => (
                  <tr key={w.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={tdStyle}>{w.name}</td>
                    <td style={tdStyle}>{w.capacity ? numberFmt(w.capacity) : '—'}</td>
                    <td style={tdStyle}>
                      <span style={{ color: w.is_active ? '#28a745' : '#999' }}>{w.is_active ? 'Активен' : 'Неактивен'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* --- Партии --- */}
      <div style={{ background: '#fff', border: '1px solid #dee2e6', borderRadius: 8, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
          <h3 style={{ fontSize: 16, fontWeight: 'bold', color: '#1f2937', margin: 0 }}>🐣 Партии ({batches.length})</h3>
          <button
            onClick={handleDeleteBatches}
            disabled={selectedBatchIds.length === 0 || actionBusy}
            style={{
              ...btnStyle('#dc3545'),
              opacity: selectedBatchIds.length === 0 ? 0.4 : 1,
              cursor: selectedBatchIds.length === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            Удалить выбранные {selectedBatchIds.length > 0 ? `(${selectedBatchIds.length})` : ''}
          </button>
        </div>

        {batches.length === 0 ? (
          <p style={{ color: '#999', fontSize: 14 }}>Партий пока нет</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ background: '#f8f9fa' }}>
                  <th style={thStyle}></th>
                  {['Партия', 'Цех', 'Поголовье', 'Начало', 'Конец', 'Статус', 'Поголовье сейчас', 'Падёж всего', 'Последний лог'].map((h) => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id} style={{ borderBottom: '1px solid #eee', background: b.is_summary ? '#f8f9fa' : 'transparent' }}>
                    <td style={tdStyle}>
                      <input type="checkbox" checked={selectedBatchIds.includes(b.id)} onChange={() => toggleBatch(b.id)} />
                    </td>
                    <td style={tdStyle}>
                      {b.batch_name}
                      {b.is_summary && (
                        <span style={{ marginLeft: 6, fontSize: 11, padding: '1px 6px', borderRadius: 999, background: '#4f46e515', color: '#4f46e5', border: '1px solid #4f46e530' }}>
                          ⭐ Сводка
                        </span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, color: b.is_summary ? '#999' : 'inherit' }}>{b.workshop_name || '—'}</td>
                    <td style={{ ...tdStyle, color: b.is_summary ? '#999' : 'inherit' }}>{numberFmt(b.initial_quantity)}</td>
                    <td style={{ ...tdStyle, color: b.is_summary ? '#999' : 'inherit' }}>{dateFmt(b.start_date)}</td>
                    <td style={{ ...tdStyle, color: b.is_summary ? '#999' : 'inherit' }}>{dateFmt(b.batch_end)}</td>
                    <td style={tdStyle}>
                      <span style={{ color: b.is_active ? '#28a745' : '#999' }}>{b.is_active ? 'Активна' : 'Завершена'}</span>
                    </td>
                    <td style={{ ...tdStyle, color: b.is_summary ? '#999' : 'inherit' }}>{numberFmt(b.current_flock)}</td>
                    <td style={{ ...tdStyle, color: b.mortality_total > 0 ? '#dc3545' : (b.is_summary ? '#999' : 'inherit') }}>{numberFmt(b.mortality_total)}</td>
                    <td style={{ ...tdStyle, color: '#888', fontSize: 12 }}>{dateFmt(b.last_log_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function btnStyle(color, outline = false) {
  return {
    padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 'bold', cursor: 'pointer',
    border: outline ? `1px solid ${color}` : 'none',
    background: outline ? '#fff' : color,
    color: outline ? color : '#fff',
  };
}

const inputStyle = { padding: '8px 10px', border: '1px solid #dee2e6', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' };
const thStyle = { padding: '10px 12px', borderBottom: '2px solid #dee2e6', textAlign: 'left', fontWeight: 'bold' };
const tdStyle = { padding: '10px 12px' };
