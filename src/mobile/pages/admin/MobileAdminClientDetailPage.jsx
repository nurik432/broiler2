// src/mobile/pages/admin/MobileAdminClientDetailPage.jsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../../supabaseClient';
import TrendChart from '../../../components/admin/TrendChart';
import Card from '../../components/Card';
import ConfirmSheet from '../../components/ConfirmSheet';
import FormField from '../../components/FormField';
import SectionHeader from '../../components/SectionHeader';
import EmptyState from '../../components/EmptyState';
import Spinner from '../../components/Spinner';

const fieldClass = 'w-full rounded-xl px-3 bg-tg-secondary text-tg-text';
const numberFmt = (n) => Number(n || 0).toLocaleString('ru-RU');
const dateFmt = (v) => (v ? new Date(v).toLocaleDateString('ru-RU') : '—');
const dateTimeFmt = (v) => (v ? new Date(v).toLocaleString('ru-RU') : '—');
const shortDateFmt = (v) => (v ? new Date(v).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) : '');

const DELETE_BATCHES_WARNING = 'Все связанные суточные логи будут удалены безвозвратно. Расходы/продажи/поставки корма/зарплаты/задачи/сотрудники, привязанные к этим партиям, сохранятся, но потеряют привязку.';

export default function MobileAdminClientDetailPage() {
  const { clientId } = useParams();
  const navigate = useNavigate();

  const [detail, setDetail] = useState(null);
  const [trend, setTrend] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [actionError, setActionError] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);

  const [selectedBatchIds, setSelectedBatchIds] = useState([]);
  const [confirmDeleteBatches, setConfirmDeleteBatches] = useState(false);

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

  useEffect(() => { load(); }, [load]);

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

  async function handleResetPassword() {
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

  async function confirmDeleteBatchesAction() {
    setActionError(null);
    setActionBusy(true);
    const { error } = await supabase.rpc('admin_delete_batches', { batch_ids: selectedBatchIds });
    if (error) setActionError(error.message);
    else await load();
    setActionBusy(false);
    setConfirmDeleteBatches(false);
  }

  const mortalitySeries = useMemo(() => [{ key: 'mortality', label: 'Падёж (голов)', color: '#dc3545' }], []);
  const feedSeries = useMemo(() => [{ key: 'feed', label: 'Корм', color: '#fd7e14' }], []);
  const weightSeries = useMemo(() => [{ key: 'avg_weight', label: 'Ср. вес', color: '#28a745' }], []);

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;
  if (error) return <p className="text-tg-destructive py-6">Ошибка: {error}</p>;
  if (!detail) return null;

  const { profile, workshops, batches } = detail;
  const isBanned = !!profile.banned_until;

  return (
    <div className="flex flex-col gap-3 py-3">
      {actionError && (
        <p className="text-sm rounded-lg px-3 py-2 text-tg-destructive" style={{ background: 'color-mix(in srgb, #dc3545 15%, transparent)' }}>
          Ошибка: {actionError}
        </p>
      )}

      <Card>
        <div className="flex items-start justify-between gap-2">
          <p className="text-lg font-semibold break-all">{profile.email}</p>
          <span
            className="text-xs font-semibold rounded-full px-2 py-0.5 shrink-0"
            style={{ background: `color-mix(in srgb, ${isBanned ? '#dc3545' : '#28a745'} 15%, transparent)`, color: isBanned ? '#dc3545' : '#28a745' }}
          >
            {isBanned ? 'Заблокирован' : 'Активен'}
          </span>
        </div>
        <p className="text-xs text-tg-hint mt-2">Регистрация: {dateTimeFmt(profile.created_at)}</p>
        <p className="text-xs text-tg-hint">Последний вход: {dateTimeFmt(profile.last_sign_in_at)}</p>

        <div className="flex gap-2 mt-3">
          <button
            type="button" onClick={() => handleToggleBan(isBanned)} disabled={actionBusy}
            className="flex-1 rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            style={{ minHeight: 44, background: isBanned ? '#28a745' : '#fd7e14' }}
          >
            {isBanned ? 'Разблокировать' : 'Заблокировать вход'}
          </button>
          <button
            type="button" onClick={() => { setShowResetForm((v) => !v); setResetResult(null); }} disabled={actionBusy}
            className="flex-1 rounded-lg px-3 py-2 text-sm font-semibold bg-tg-secondary text-tg-text disabled:opacity-60"
            style={{ minHeight: 44 }}
          >
            Сбросить пароль
          </button>
        </div>

        {showResetForm && (
          <div className="flex flex-col gap-2 mt-3">
            <FormField label="Новый пароль (мин. 6 символов)">
              <input type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={fieldClass} style={{ minHeight: 44 }} />
            </FormField>
            <button
              type="button" onClick={handleResetPassword} disabled={actionBusy}
              className="rounded-lg px-3 py-2 text-sm font-semibold bg-tg-button text-tg-button-text disabled:opacity-60"
              style={{ minHeight: 44 }}
            >
              Сохранить пароль
            </button>
          </div>
        )}
        {resetResult && (
          <p className="text-xs mt-2" style={{ color: resetResult.ok ? '#28a745' : '#dc3545' }}>{resetResult.message}</p>
        )}
      </Card>

      <Card>
        <p className="text-xs font-semibold uppercase tracking-wide text-tg-destructive">⚠️ Опасная зона</p>
        <p className="text-xs text-tg-hint mt-2">
          Удаление аккаунта необратимо: будут удалены сам аккаунт и все его данные (цеха, партии, логи, расходы, продажи и т.д.).
        </p>
        <FormField label={`Введите "${profile.email}" для подтверждения`}>
          <input type="text" value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} className={fieldClass} style={{ minHeight: 44 }} />
        </FormField>
        <button
          type="button" onClick={handleDeleteAccount}
          disabled={actionBusy || deleteConfirmText.trim() !== profile.email}
          className="w-full mt-3 rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
          style={{ minHeight: 44, background: '#dc3545' }}
        >
          Удалить аккаунт навсегда
        </button>
      </Card>

      <SectionHeader>Динамика (последние 90 дней)</SectionHeader>
      <div className="flex flex-col gap-4">
        <Card>
          <p className="text-xs text-tg-hint mb-2">Падёж, голов/день</p>
          <TrendChart data={trend} xKey="log_date" series={mortalitySeries} formatX={shortDateFmt} />
        </Card>
        <Card>
          <p className="text-xs text-tg-hint mb-2">Корм, кг/день</p>
          <TrendChart data={trend} xKey="log_date" series={feedSeries} formatX={shortDateFmt} />
        </Card>
        <Card>
          <p className="text-xs text-tg-hint mb-2">Средний вес, г</p>
          <TrendChart data={trend} xKey="log_date" series={weightSeries} formatX={shortDateFmt} />
        </Card>
      </div>

      <SectionHeader>Цеха ({workshops.length})</SectionHeader>
      {workshops.length === 0 ? (
        <EmptyState icon="🏭" title="Цехов пока нет" />
      ) : (
        workshops.map((w) => (
          <Card key={w.id}>
            <p className="text-base font-medium">{w.name}</p>
            <p className="text-xs text-tg-hint mt-1">
              Вместимость: {w.capacity ? numberFmt(w.capacity) : '—'} · <span style={{ color: w.is_active ? '#28a745' : 'var(--tg-hint)' }}>{w.is_active ? 'Активен' : 'Неактивен'}</span>
            </p>
          </Card>
        ))
      )}

      <div className="flex items-center justify-between">
        <SectionHeader>Партии ({batches.length})</SectionHeader>
      </div>
      {batches.length > 0 && (
        <button
          type="button" onClick={() => setConfirmDeleteBatches(true)}
          disabled={selectedBatchIds.length === 0 || actionBusy}
          className="rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
          style={{ minHeight: 44, background: '#dc3545' }}
        >
          Удалить выбранные {selectedBatchIds.length > 0 ? `(${selectedBatchIds.length})` : ''}
        </button>
      )}
      {batches.length === 0 ? (
        <EmptyState icon="🐣" title="Партий пока нет" />
      ) : (
        batches.map((b) => (
          <Card key={b.id}>
            <div className="flex items-start gap-3">
              <input
                type="checkbox" checked={selectedBatchIds.includes(b.id)} onChange={() => toggleBatch(b.id)}
                className="mt-1" style={{ width: 20, height: 20 }}
              />
              <div className="min-w-0 flex-1">
                <p className="text-base font-medium">
                  {b.batch_name}
                  {b.is_summary && (
                    <span className="ml-2 text-xs rounded-full px-2 py-0.5" style={{ background: 'color-mix(in srgb, #4f46e5 15%, transparent)', color: '#4f46e5' }}>
                      ⭐ Сводка
                    </span>
                  )}
                </p>
                <p className="text-xs text-tg-hint mt-1">
                  {b.workshop_name || '—'} · {numberFmt(b.initial_quantity)} гол. при старте
                </p>
                <p className="text-xs text-tg-hint">
                  {dateFmt(b.start_date)} — {dateFmt(b.batch_end)} · <span style={{ color: b.is_active ? '#28a745' : 'var(--tg-hint)' }}>{b.is_active ? 'Активна' : 'Завершена'}</span>
                </p>
                <p className="text-xs text-tg-hint">
                  Сейчас: {numberFmt(b.current_flock)} гол. · Падёж: <span style={{ color: b.mortality_total > 0 ? '#dc3545' : 'inherit' }}>{numberFmt(b.mortality_total)}</span>
                </p>
                <p className="text-xs text-tg-hint">Последний лог: {dateFmt(b.last_log_date)}</p>
              </div>
            </div>
          </Card>
        ))
      )}

      <ConfirmSheet
        open={confirmDeleteBatches}
        title={`Удалить ${selectedBatchIds.length} партий(ю)?`}
        message={DELETE_BATCHES_WARNING}
        onConfirm={confirmDeleteBatchesAction}
        onClose={() => setConfirmDeleteBatches(false)}
      />
    </div>
  );
}
