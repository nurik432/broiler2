// src/mobile/pages/batchLog/MobileJournalTab.jsx
import { useState } from 'react';
import { supabase } from '../../../supabaseClient';
import { compareWithNorm } from '../../../utils/normComparison';
import { getWeekMortalityNorm, FEED_BAG_WEIGHT_G } from '../../../constants/broilerStandards';
import { syncSummaryBatchLog } from '../../../utils/summaryBatchSync';
import Card from '../../components/Card';
import ListRow from '../../components/ListRow';
import FormField from '../../components/FormField';
import NumberStepper from '../../components/NumberStepper';
import NormBadge from '../../components/NormBadge';
import BottomSheet from '../../components/BottomSheet';
import ConfirmSheet from '../../components/ConfirmSheet';
import EmptyState from '../../components/EmptyState';
import { useTelegramMainButton } from '../../telegram/useTelegramMainButton';
import { useTelegramHaptics } from '../../telegram/useTelegramHaptics';

const EMPTY_ENTRY = {
  log_date: new Date().toISOString().slice(0, 10),
  mortality_natural: '', mortality_halal: '', weight: '', water: '', daily_feed: '', medicine_id: '', dosage: '',
};
const fieldClass = 'w-full rounded-xl px-3 bg-tg-secondary text-tg-text';

function ageOf(startDate, dateStr) {
  return Math.ceil(Math.abs(new Date(dateStr) - new Date(startDate)) / 86400000);
}

function toFiniteOrNull(str) {
  const n = parseFloat(str);
  return Number.isFinite(n) ? n : null;
}

function mortalityHint(batch, age, natural, halal) {
  if (!batch || !age || age < 1) return null;
  const week = Math.ceil(age / 7);
  const normPercent = getWeekMortalityNorm(week);
  const allowedDaily = Math.round((batch.initial_quantity * normPercent / 100) / (week * 7));
  const total = (Number(natural) || 0) + (Number(halal) || 0);
  return {
    normLabel: `~${allowedDaily} гол/сут (${normPercent}%/нед)`,
    deviation: null,
    percent: null,
    status: total > allowedDaily * 2 ? 'critical' : total > allowedDaily ? 'warning' : 'ok',
  };
}

export default function MobileJournalTab({ batch, logs, medicines, onReload }) {
  const [entry, setEntry] = useState(EMPTY_ENTRY);
  const [submitting, setSubmitting] = useState(false);
  const [confirmCritical, setConfirmCritical] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const haptics = useTelegramHaptics();

  const currentQuantity = batch.initial_quantity - logs.reduce((s, l) => s + l.mortality, 0);
  const age = ageOf(batch.start_date, entry.log_date);
  const waterPerHead = entry.water && currentQuantity > 0 ? Math.round((parseFloat(entry.water) * 1000) / currentQuantity) : null;
  const feedPerHead = entry.daily_feed && currentQuantity > 0 ? Math.round((parseFloat(entry.daily_feed) * FEED_BAG_WEIGHT_G) / currentQuantity) : null;

  async function doInsert() {
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('daily_logs').insert([{
        batch_id: batch.id,
        log_date: entry.log_date,
        age,
        mortality: (Number(entry.mortality_natural) || 0) + (Number(entry.mortality_halal) || 0),
        mortality_natural: Number(entry.mortality_natural) || 0,
        mortality_halal: Number(entry.mortality_halal) || 0,
        medicine_id: entry.medicine_id || null,
        dosage: entry.dosage || null,
        water_consumption: entry.water ? Number(entry.water) : null,
        weight: toFiniteOrNull(entry.weight),
        daily_feed: toFiniteOrNull(entry.daily_feed),
        user_id: user.id,
      }]);
      if (error) throw error;
      if (!batch.is_summary) await syncSummaryBatchLog(entry.log_date, user.id);
      setEntry(EMPTY_ENTRY);
      haptics.success();
      await onReload();
    } catch (e) {
      window.alert('Ошибка: ' + e.message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleAdd() {
    const mn = Number(entry.mortality_natural) || 0;
    const mh = Number(entry.mortality_halal) || 0;
    if (mn === 0 && mh === 0 && !entry.weight && !entry.water && !entry.daily_feed && !entry.medicine_id) {
      window.alert('Введите хотя бы одно значение');
      return;
    }
    const checks = [
      compareWithNorm(age, 'weight', entry.weight),
      compareWithNorm(age, 'dailyFeed', feedPerHead),
      compareWithNorm(age, 'waterNorm', waterPerHead),
    ];
    if (checks.some((c) => c?.status === 'critical')) { setConfirmCritical(true); return; }
    doInsert();
  }

  async function saveEdit() {
    const l = editRow;
    const mn = Number(l.mortality_natural) || 0;
    const mh = Number(l.mortality_halal) || 0;
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('daily_logs').update({
      log_date: l.log_date,
      age: ageOf(batch.start_date, l.log_date),
      mortality: mn + mh,
      mortality_natural: mn,
      mortality_halal: mh,
      water_consumption: l.water_consumption !== '' && l.water_consumption != null ? Number(l.water_consumption) : null,
      weight: toFiniteOrNull(l.weight),
      daily_feed: toFiniteOrNull(l.daily_feed),
      medicine_id: l.medicine_id || null,
      dosage: l.dosage || null,
    }).eq('id', l.id);
    if (error) { window.alert(error.message); return; }
    if (!batch.is_summary) await syncSummaryBatchLog(l.log_date, user.id);
    setEditRow(null);
    await onReload();
  }

  async function doDelete() {
    const log = logs.find((l) => l.id === deleteId);
    const { error } = await supabase.from('daily_logs').delete().eq('id', deleteId);
    if (error) { window.alert(error.message); setDeleteId(null); return; }
    if (log && !batch.is_summary) {
      const { data: { user } } = await supabase.auth.getUser();
      await syncSummaryBatchLog(log.log_date, user.id);
    }
    setDeleteId(null);
    await onReload();
  }

  useTelegramMainButton({
    text: submitting ? 'Сохраняем…' : 'Добавить',
    onClick: handleAdd,
    visible: batch.is_active && !editRow,
    loading: submitting,
  });

  return (
    <div className="flex flex-col gap-3">
      {batch.is_active && (
        <Card>
          <p className="text-sm font-semibold mb-2">Добавить запись</p>
          <div className="flex flex-col gap-3">
            <FormField label="Дата">
              <input
                type="date" value={entry.log_date}
                onChange={(e) => setEntry((f) => ({ ...f, log_date: e.target.value }))}
                className={fieldClass} style={{ minHeight: 44 }}
              />
            </FormField>
            <FormField label={<>Падёж ест. <NormBadge result={mortalityHint(batch, age, entry.mortality_natural, entry.mortality_halal)} /></>}>
              <NumberStepper value={entry.mortality_natural} onChange={(v) => setEntry((f) => ({ ...f, mortality_natural: v }))} />
            </FormField>
            <FormField label="Падёж хал.">
              <NumberStepper value={entry.mortality_halal} onChange={(v) => setEntry((f) => ({ ...f, mortality_halal: v }))} />
            </FormField>
            <FormField label={<>Живая масса, г/гол <NormBadge result={compareWithNorm(age, 'weight', entry.weight)} /></>}>
              <NumberStepper value={entry.weight} onChange={(v) => setEntry((f) => ({ ...f, weight: v }))} step={10} suffix="г" />
            </FormField>
            <FormField label={<>Вода, л <NormBadge result={compareWithNorm(age, 'waterNorm', waterPerHead)} /></>}>
              <NumberStepper value={entry.water} onChange={(v) => setEntry((f) => ({ ...f, water: v }))} step={1} suffix="л" />
            </FormField>
            <FormField label={<>Корм, мешков <NormBadge result={compareWithNorm(age, 'dailyFeed', feedPerHead)} /></>}>
              <NumberStepper value={entry.daily_feed} onChange={(v) => setEntry((f) => ({ ...f, daily_feed: v }))} step={0.5} suffix="меш." />
            </FormField>
            <FormField label="Лекарство">
              <select value={entry.medicine_id} onChange={(e) => setEntry((f) => ({ ...f, medicine_id: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }}>
                <option value="">-- нет --</option>
                {medicines.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </FormField>
            <FormField label="Доза">
              <input value={entry.dosage} onChange={(e) => setEntry((f) => ({ ...f, dosage: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }} />
            </FormField>
          </div>
        </Card>
      )}

      {logs.length === 0 ? (
        <EmptyState icon="📭" title="Записей журнала пока нет" />
      ) : (
        logs.map((log) => (
          <Card key={log.id}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-semibold">{new Date(log.log_date).toLocaleDateString('ru-RU')}</span>
              <span className="text-xs text-tg-hint">День {log.age}</span>
            </div>
            <ListRow label="Падёж (ест/хал)" value={`${log.mortality} (${log.mortality_natural || 0}/${log.mortality_halal || 0})`} />
            <ListRow label="Масса" value={log.weight ?? '—'} />
            <ListRow label="Вода" value={log.water_consumption ?? '—'} />
            <ListRow label="Корм" value={log.daily_feed ?? '—'} />
            <ListRow label="Лекарство" value={log.medicine?.name || '—'} />
            {batch.is_active && (
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setEditRow({
                    id: log.id, log_date: log.log_date,
                    mortality_natural: log.mortality_natural || 0, mortality_halal: log.mortality_halal || 0,
                    weight: log.weight ?? '', water_consumption: log.water_consumption ?? '',
                    daily_feed: log.daily_feed ?? '', medicine_id: log.medicine_id || '', dosage: log.dosage || '',
                  })}
                  className="flex-1 rounded-lg px-3 py-2 text-xs bg-tg-secondary"
                  style={{ minHeight: 36 }}
                >
                  Изменить
                </button>
                <button
                  type="button" onClick={() => setDeleteId(log.id)}
                  className="flex-1 rounded-lg px-3 py-2 text-xs text-tg-destructive bg-tg-secondary"
                  style={{ minHeight: 36 }}
                >
                  Удалить
                </button>
              </div>
            )}
          </Card>
        ))
      )}

      <BottomSheet open={!!editRow} onClose={() => setEditRow(null)} title="Изменить запись">
        {editRow && (
          <div className="flex flex-col gap-3">
            <FormField label="Дата">
              <input
                type="date" value={editRow.log_date}
                onChange={(e) => setEditRow((f) => ({ ...f, log_date: e.target.value }))}
                className={fieldClass} style={{ minHeight: 44 }}
              />
            </FormField>
            <FormField label="Падёж ест.">
              <NumberStepper value={String(editRow.mortality_natural)} onChange={(v) => setEditRow((f) => ({ ...f, mortality_natural: v }))} />
            </FormField>
            <FormField label="Падёж хал.">
              <NumberStepper value={String(editRow.mortality_halal)} onChange={(v) => setEditRow((f) => ({ ...f, mortality_halal: v }))} />
            </FormField>
            <FormField label="Масса, г/гол">
              <NumberStepper value={String(editRow.weight)} onChange={(v) => setEditRow((f) => ({ ...f, weight: v }))} step={10} suffix="г" />
            </FormField>
            <FormField label="Вода, л">
              <NumberStepper value={String(editRow.water_consumption)} onChange={(v) => setEditRow((f) => ({ ...f, water_consumption: v }))} step={1} suffix="л" />
            </FormField>
            <FormField label="Корм, мешков">
              <NumberStepper value={String(editRow.daily_feed)} onChange={(v) => setEditRow((f) => ({ ...f, daily_feed: v }))} step={0.5} suffix="меш." />
            </FormField>
            <FormField label="Лекарство">
              <select value={editRow.medicine_id} onChange={(e) => setEditRow((f) => ({ ...f, medicine_id: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }}>
                <option value="">-- нет --</option>
                {medicines.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </FormField>
            <button type="button" onClick={saveEdit} className="rounded-xl px-4 py-3 text-base font-semibold bg-tg-button text-tg-button-text" style={{ minHeight: 48 }}>
              Сохранить
            </button>
          </div>
        )}
      </BottomSheet>

      <ConfirmSheet
        open={confirmCritical}
        title="Критические отклонения"
        message="Обнаружены критические отклонения от нормы ROSS-308. Сохранить всё равно?"
        confirmLabel="Сохранить"
        danger={false}
        onConfirm={doInsert}
        onClose={() => setConfirmCritical(false)}
      />
      <ConfirmSheet open={!!deleteId} title="Удалить запись?" onConfirm={doDelete} onClose={() => setDeleteId(null)} />
    </div>
  );
}
