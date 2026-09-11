// src/mobile/pages/MobileBatchesPage.jsx
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { syncSummaryBatchLog } from '../../utils/summaryBatchSync';
import { exportBatchToXLSX } from '../../utils/exportBatchToXLSX';
import Card from '../components/Card';
import ListRow from '../components/ListRow';
import StatusPill from '../components/StatusPill';
import BottomSheet from '../components/BottomSheet';
import ConfirmSheet from '../components/ConfirmSheet';
import FormField from '../components/FormField';
import Tabs from '../components/Tabs';
import EmptyState from '../components/EmptyState';
import Spinner from '../components/Spinner';
import { useTelegramMainButton } from '../telegram/useTelegramMainButton';

const fieldClass = 'w-full rounded-xl px-3 bg-tg-secondary text-tg-text';
const EMPTY_CREATE_FORM = { batch_name: '', initial_quantity: '', start_date: new Date().toISOString().slice(0, 10), workshop_id: '' };

function ageOf(startDate) {
  return Math.max(1, Math.ceil((Date.now() - Date.parse(startDate)) / 86400000));
}

function mortalityStatus(pct) {
  if (pct >= 8) return 'critical';
  if (pct >= 5) return 'warning';
  return 'ok';
}

export default function MobileBatchesPage() {
  const navigate = useNavigate();
  const [view, setView] = useState('active');
  const [rows, setRows] = useState(null);
  const [workshops, setWorkshops] = useState([]);
  const [err, setErr] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState(null); // { id, newStatus }
  const [isSyncingHistory, setIsSyncingHistory] = useState(false);

  async function fetchWorkshops() {
    const { data } = await supabase.from('workshops').select('id, name').eq('is_active', true).order('name');
    setWorkshops(data || []);
  }

  async function fetchBatches() {
    setRows(null);
    setErr('');
    const rpcFn = view === 'active' ? 'get_batches_with_stats' : 'get_archived_batches_with_stats';
    const { data, error } = await supabase.rpc(rpcFn);
    if (error) { setErr(error.message); setRows([]); return; }
    if (data && data.length > 0) {
      const ids = data.map((b) => b.id);
      const { data: workshopData } = await supabase.from('broiler_batches').select('id, workshop_id').in('id', ids);
      const wsMap = {};
      (workshopData || []).forEach((w) => { wsMap[w.id] = w.workshop_id; });
      const enriched = data.map((b) => ({ ...b, workshop_id: wsMap[b.id] ?? b.workshop_id ?? null }));
      const sorted = [...enriched].sort((a, b) => (b.is_summary ? 1 : 0) - (a.is_summary ? 1 : 0));
      setRows(sorted);
    } else {
      setRows([]);
    }
  }

  useEffect(() => { fetchBatches(); }, [view]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { fetchWorkshops(); }, []);

  async function submitCreate() {
    const qty = Number(createForm.initial_quantity);
    if (!createForm.batch_name.trim() || !(qty > 0)) { window.alert('Укажите название и начальное поголовье.'); return; }
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
      const { error } = await supabase.from('broiler_batches').insert([{
        batch_name: createForm.batch_name.trim(), initial_quantity: qty,
        start_date: createForm.start_date, workshop_id: createForm.workshop_id || null,
        user_id: user.id,
      }]);
      if (error) window.alert('Ошибка: ' + error.message);
      else { setCreateForm({ ...EMPTY_CREATE_FORM, start_date: new Date().toISOString().slice(0, 10) }); setCreateOpen(false); await fetchBatches(); }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleWorkshopChange(batchId, workshopId) {
    const { error } = await supabase.from('broiler_batches').update({ workshop_id: workshopId || null }).eq('id', batchId);
    if (error) window.alert('Ошибка при смене цеха: ' + error.message);
    else await fetchBatches();
  }

  async function confirmToggleStatus() {
    if (!confirmTarget) return;
    const { id: batchId, newStatus } = confirmTarget;
    setConfirmTarget(null);

    const { error: batchError } = await supabase.from('broiler_batches').update({ is_active: newStatus }).eq('id', batchId);
    if (batchError) { window.alert('Ошибка при изменении статуса партии: ' + batchError.message); return; }

    if (!newStatus) {
      const today = new Date().toISOString().slice(0, 10);
      const { error: employeesError } = await supabase.from('employees')
        .update({ is_active: false, end_date: today })
        .eq('batch_id', batchId).eq('is_active', true);
      if (employeesError) {
        window.alert('Партия архивирована, но не удалось обновить статус сотрудников: ' + employeesError.message);
      } else {
        const { count } = await supabase.from('employees').select('id', { count: 'exact', head: true }).eq('batch_id', batchId).eq('end_date', today);
        if (count > 0) window.alert(`✅ Партия завершена. Уволено сотрудников: ${count}.\nВыплаты по ним переведены в архив автоматически.`);
      }
    }
    await fetchBatches();
  }

  async function handleExport(batchId) {
    try {
      await exportBatchToXLSX(batchId);
    } catch (err) {
      window.alert('Не удалось экспортировать данные: ' + err.message);
    }
  }

  async function handleSyncHistory() {
    setIsSyncingHistory(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: activeBatches } = await supabase.from('broiler_batches').select('id').eq('is_active', true).or('is_summary.eq.false,is_summary.is.null');
      if (!activeBatches || activeBatches.length === 0) { window.alert('Нет активных обычных партий для синхронизации.'); return; }
      const batchIds = activeBatches.map((b) => b.id);
      const { data: logs } = await supabase.from('daily_logs').select('log_date').in('batch_id', batchIds);
      if (logs && logs.length > 0) {
        const uniqueDates = [...new Set(logs.map((l) => l.log_date))];
        for (const date of uniqueDates) await syncSummaryBatchLog(date, user.id);
        window.alert('✅ Исторические данные успешно синхронизированы!');
        await fetchBatches();
      } else {
        window.alert('В активных партиях нет ни одной записи журнала.');
      }
    } catch (err) {
      window.alert('Ошибка синхронизации: ' + err.message);
    } finally {
      setIsSyncingHistory(false);
    }
  }

  useTelegramMainButton({
    text: submitting ? 'Добавление…' : 'Добавить партию',
    onClick: submitCreate,
    visible: createOpen,
    loading: submitting,
  });

  const confirmCopy = useMemo(() => {
    if (!confirmTarget) return null;
    return confirmTarget.newStatus
      ? { title: 'Восстановить партию?', message: 'Сотрудники, привязанные к этой партии, не будут восстановлены автоматически. Переназначьте их вручную в разделе «Сотрудники».', label: 'Восстановить', danger: false }
      : { title: 'Завершить партию?', message: 'Все сотрудники, привязанные к этой партии, будут автоматически уволены, а их платежи — архивированы.', label: 'Завершить', danger: true };
  }, [confirmTarget]);

  return (
    <div className="flex flex-col gap-3 py-3">
      <Tabs
        tabs={[{ key: 'active', label: 'Активные' }, { key: 'archived', label: 'Архивные' }]}
        active={view}
        onChange={setView}
      />

      <div className="flex gap-2">
        <button
          type="button" onClick={() => setCreateOpen(true)}
          className="flex-1 rounded-xl px-4 py-3 text-base font-semibold bg-tg-button text-tg-button-text"
          style={{ minHeight: 48 }}
        >
          + Добавить партию
        </button>
        {view === 'active' && (
          <button
            type="button" onClick={handleSyncHistory} disabled={isSyncingHistory}
            className="rounded-xl px-3 text-xs font-medium bg-tg-secondary text-tg-hint disabled:opacity-60"
            style={{ minHeight: 48 }}
          >
            {isSyncingHistory ? '…' : '🔄 Синхр.'}
          </button>
        )}
      </div>

      {rows === null ? (
        <div className="flex justify-center py-20"><Spinner size={28} /></div>
      ) : err ? (
        <EmptyState icon="⚠️" title="Не удалось загрузить партии" hint={err} />
      ) : rows.length === 0 ? (
        <EmptyState icon="🐔" title={view === 'active' ? 'Активных партий нет' : 'Архивных партий нет'} hint="Добавьте партию кнопкой выше" />
      ) : (
        rows.map((b) => {
          const age = ageOf(b.start_date);
          const initial = b.initial_quantity || 0;
          const pct = initial > 0 ? (b.total_mortality / initial) * 100 : 0;
          return (
            <Card key={b.id} className={b.is_summary ? 'opacity-90' : ''}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-base font-semibold truncate">
                  {b.batch_name}
                  {b.is_summary && <span className="ml-2 text-xs rounded-full px-2 py-0.5" style={{ background: 'color-mix(in srgb, #fd7e14 15%, transparent)', color: '#fd7e14' }}>Авто</span>}
                </span>
                {!b.is_summary && <StatusPill status={mortalityStatus(pct)}>падёж {pct.toFixed(1)}%</StatusPill>}
              </div>
              <ListRow label="День выращивания" value={age} />
              <ListRow label="Начальное поголовье" value={initial.toLocaleString('ru-RU')} />
              <ListRow label="Осталось" value={Number(b.current_quantity).toLocaleString('ru-RU')} />
              <ListRow label="Падёж всего" value={Number(b.total_mortality).toLocaleString('ru-RU')} />

              {!b.is_summary && (
                <FormField label="Цех">
                  <select
                    value={b.workshop_id || ''}
                    onChange={(e) => handleWorkshopChange(b.id, e.target.value)}
                    className={fieldClass}
                    style={{ minHeight: 40 }}
                  >
                    <option value="">— Не привязан —</option>
                    {workshops.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </FormField>
              )}

              <div className="flex flex-wrap gap-2 mt-3">
                <button type="button" onClick={() => navigate(`/batch/${b.id}`)} className="flex-1 rounded-lg px-3 py-2 text-xs font-medium bg-tg-secondary" style={{ minHeight: 40 }}>
                  Журнал
                </button>
                {view === 'active' ? (
                  b.is_summary ? (
                    <button type="button" onClick={() => navigate(`/batch/${b.id}/report`)} className="flex-1 rounded-lg px-3 py-2 text-xs font-medium text-white" style={{ minHeight: 40, background: '#007bff' }}>
                      Отчёт
                    </button>
                  ) : (
                    <button type="button" onClick={() => setConfirmTarget({ id: b.id, newStatus: false })} className="flex-1 rounded-lg px-3 py-2 text-xs font-medium text-white" style={{ minHeight: 40, background: '#dc3545' }}>
                      Завершить
                    </button>
                  )
                ) : (
                  <>
                    <button type="button" onClick={() => navigate(`/batch/${b.id}/report`)} className="flex-1 rounded-lg px-3 py-2 text-xs font-medium text-white" style={{ minHeight: 40, background: '#007bff' }}>
                      Отчёт
                    </button>
                    <button type="button" onClick={() => setConfirmTarget({ id: b.id, newStatus: true })} className="flex-1 rounded-lg px-3 py-2 text-xs font-medium text-white" style={{ minHeight: 40, background: '#28a745' }}>
                      Восстановить
                    </button>
                    <button type="button" onClick={() => handleExport(b.id)} className="flex-1 rounded-lg px-3 py-2 text-xs font-medium text-white" style={{ minHeight: 40, background: '#495057' }}>
                      XLSX
                    </button>
                  </>
                )}
              </div>
            </Card>
          );
        })
      )}

      <BottomSheet open={createOpen} onClose={() => setCreateOpen(false)} title="Новая партия">
        <div className="flex flex-col gap-3">
          <FormField label="Название партии *">
            <input value={createForm.batch_name} onChange={(e) => setCreateForm((f) => ({ ...f, batch_name: e.target.value }))} placeholder="Партия #1" className={fieldClass} style={{ minHeight: 48 }} />
          </FormField>
          <FormField label="Начальное поголовье *">
            <input type="number" value={createForm.initial_quantity} onChange={(e) => setCreateForm((f) => ({ ...f, initial_quantity: e.target.value }))} placeholder="500" className={fieldClass} style={{ minHeight: 48 }} />
          </FormField>
          <FormField label="Дата начала">
            <input type="date" value={createForm.start_date} onChange={(e) => setCreateForm((f) => ({ ...f, start_date: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }} />
          </FormField>
          <FormField label="Цех">
            <select value={createForm.workshop_id} onChange={(e) => setCreateForm((f) => ({ ...f, workshop_id: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }}>
              <option value="">— Без цеха —</option>
              {workshops.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            {workshops.length === 0 && <p className="text-xs text-tg-hint mt-1">Нет цехов. Создайте в разделе «Учёт по цехам».</p>}
          </FormField>
          <button type="button" onClick={submitCreate} disabled={submitting} className="rounded-xl px-4 py-3 text-base font-semibold bg-tg-button text-tg-button-text disabled:opacity-60" style={{ minHeight: 48 }}>
            {submitting ? 'Добавление…' : 'Добавить партию'}
          </button>
        </div>
      </BottomSheet>

      <ConfirmSheet
        open={!!confirmTarget}
        title={confirmCopy?.title}
        message={confirmCopy?.message}
        confirmLabel={confirmCopy?.label}
        danger={confirmCopy?.danger}
        onConfirm={confirmToggleStatus}
        onClose={() => setConfirmTarget(null)}
      />
    </div>
  );
}
