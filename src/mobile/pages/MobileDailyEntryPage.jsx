// src/mobile/pages/MobileDailyEntryPage.jsx
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabaseClient';
import { syncSummaryBatchLog } from '../../utils/summaryBatchSync';
import { useTelegramMainButton } from '../telegram/useTelegramMainButton';
import { useTelegramHaptics } from '../telegram/useTelegramHaptics';
import Card from '../components/Card';
import FormField from '../components/FormField';
import NumberStepper from '../components/NumberStepper';
import SegmentedControl from '../components/SegmentedControl';
import EmptyState from '../components/EmptyState';
import Spinner from '../components/Spinner';

const fieldClass = 'w-full rounded-xl px-3 bg-tg-secondary text-tg-text';
const EMPTY = { mortality_natural: '', mortality_halal: '', feed: '', water: '', weight: '', medicine_id: '', dosage: '' };
const today = () => new Date().toISOString().slice(0, 10);

function ageOf(startDate, dateStr) {
  return Math.max(1, Math.ceil((Date.parse(dateStr) - Date.parse(startDate)) / 86400000));
}

// Быстрая правка уже сохранённого значения (перезапись, а не сложение) — мобильный аналог
// десктопной EditableValue в DailyEntryPage.jsx.
function QuickEdit({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState('');

  if (!editing) {
    return (
      <button type="button" onClick={() => { setVal(String(value)); setEditing(true); }} className="text-tg-hint px-1" title="Исправить значение">
        ✏️
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 ml-1">
      <input
        type="number" inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value)} autoFocus
        className="rounded-lg px-2 bg-tg-secondary text-tg-text text-sm" style={{ width: 56, minHeight: 32 }}
      />
      <button type="button" onClick={() => { onSave(val); setEditing(false); }} style={{ color: '#28a745' }}>✓</button>
      <button type="button" onClick={() => setEditing(false)} style={{ color: '#dc3545' }}>✕</button>
    </span>
  );
}

export default function MobileDailyEntryPage() {
  const [loading, setLoading] = useState(true);
  const [workshops, setWorkshops] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [logs, setLogs] = useState({});          // workshopId -> today's daily_logs row | null
  const [selected, setSelected] = useState('');  // workshop id
  const [entry, setEntry] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const haptics = useTelegramHaptics();
  const [logDate, setLogDate] = useState(today);

  async function load() {
    setLoading(true);
    const [{ data: wsData }, { data: medsData }] = await Promise.all([
      supabase.from('workshops')
        .select('*, batches:broiler_batches (id, batch_name, initial_quantity, start_date, is_active)')
        .eq('is_active', true).order('name'),
      supabase.from('medicines').select('id, name').order('name'),
    ]);
    setMedicines(medsData || []);
    const active = (wsData || [])
      .map((w) => ({ ...w, activeBatch: w.batches?.find((b) => b.is_active) || null }))
      .filter((w) => w.activeBatch);
    setWorkshops(active);
    setSelected((prev) => (active.some((w) => w.id === prev) ? prev : active[0]?.id || ''));

    const byWs = {};
    const batchIds = active.map((w) => w.activeBatch.id);
    if (batchIds.length) {
      const { data: logRows } = await supabase
        .from('daily_logs').select('*, medicine:medicines(name)').in('batch_id', batchIds).eq('log_date', logDate);
      const byBatch = {};
      (logRows || []).forEach((l) => { byBatch[l.batch_id] = l; });
      active.forEach((w) => { byWs[w.id] = byBatch[w.activeBatch.id] || null; });
    }
    setLogs(byWs);
    setLoading(false);
  }

  useEffect(() => { load(); }, [logDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const ws = useMemo(() => workshops.find((w) => w.id === selected), [workshops, selected]);
  const todayLog = ws ? logs[ws.id] : null;

  async function refreshWorkshopLog() {
    if (!ws) return;
    const { data } = await supabase
      .from('daily_logs').select('*, medicine:medicines(name)')
      .eq('batch_id', ws.activeBatch.id).eq('log_date', logDate).maybeSingle();
    setLogs((prev) => ({ ...prev, [ws.id]: data || null }));
  }

  async function handleCorrect(field, rawValue) {
    if (!todayLog) return;
    const numValue = Number(rawValue) || 0;
    const upd = {};
    if (field === 'mortality_natural') { upd.mortality_natural = numValue; upd.mortality = numValue + (todayLog.mortality_halal || 0); }
    else if (field === 'mortality_halal') { upd.mortality_halal = numValue; upd.mortality = (todayLog.mortality_natural || 0) + numValue; }
    else if (field === 'daily_feed') upd.daily_feed = numValue;
    else if (field === 'water_consumption') upd.water_consumption = numValue;

    const { error } = await supabase.from('daily_logs').update(upd).eq('id', todayLog.id);
    if (error) { window.alert('Ошибка: ' + error.message); return; }
    await refreshWorkshopLog();
  }

  async function save() {
    if (!ws) return;
    const mn = Number(entry.mortality_natural) || 0;
    const mh = Number(entry.mortality_halal) || 0;
    const feed = Number(entry.feed) || 0;
    const water = Number(entry.water) || 0;
    const wParsed = parseFloat(entry.weight);
    const weight = Number.isFinite(wParsed) ? wParsed : null;
    const medicineId = entry.medicine_id || null;
    const dosage = entry.dosage || '';
    if (mn === 0 && mh === 0 && feed === 0 && water === 0 && weight === null && !medicineId) {
      setSaved(false);
      window.alert('Введите хотя бы одно значение');
      return;
    }
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const batch = ws.activeBatch;
      if (todayLog) {
        const upd = {
          mortality_natural: (todayLog.mortality_natural || 0) + mn,
          mortality_halal: (todayLog.mortality_halal || 0) + mh,
          daily_feed: (todayLog.daily_feed || 0) + feed,
          water_consumption: (todayLog.water_consumption || 0) + water,
        };
        upd.mortality = upd.mortality_natural + upd.mortality_halal;
        if (weight !== null) upd.weight = weight;
        if (medicineId) upd.medicine_id = medicineId;
        if (dosage) upd.dosage = dosage;
        const { error } = await supabase.from('daily_logs').update(upd).eq('id', todayLog.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('daily_logs').insert([{
          batch_id: batch.id,
          workshop_id: ws.id,
          log_date: logDate,
          age: ageOf(batch.start_date, logDate),
          mortality: mn + mh,
          mortality_natural: mn,
          mortality_halal: mh,
          daily_feed: feed,
          water_consumption: water,
          weight,
          medicine_id: medicineId,
          dosage: dosage || null,
          user_id: user.id,
        }]);
        if (error) throw error;
      }
      await syncSummaryBatchLog(logDate, user.id); // domain invariant
      setEntry(EMPTY);
      setSaved(true);
      haptics.success();
      await refreshWorkshopLog();
    } catch (e) {
      window.alert('Ошибка: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  useTelegramMainButton({
    text: busy ? 'Сохраняем…' : 'Сохранить',
    onClick: save,
    visible: !loading && !!ws,
    loading: busy,
  });

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;
  if (!workshops.length) {
    return <EmptyState icon="🏭" title="Нет цехов с активной партией" hint="Заведите цех и партию в веб-версии" />;
  }

  const set = (k) => (v) => { setEntry((e) => ({ ...e, [k]: v })); setSaved(false); };

  return (
    <div className="flex flex-col gap-4 py-3">
      <FormField label="Дата">
        <input type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} className={fieldClass} style={{ minHeight: 44 }} />
      </FormField>

      {workshops.length <= 3 ? (
        <SegmentedControl
          options={workshops.map((w) => ({ value: w.id, label: w.name }))}
          value={selected}
          onChange={(v) => { setSelected(v); setEntry(EMPTY); setSaved(false); }}
        />
      ) : (
        <FormField label="Цех">
          <select
            value={selected}
            onChange={(e) => { setSelected(e.target.value); setEntry(EMPTY); setSaved(false); }}
            className={fieldClass} style={{ minHeight: 48 }}
          >
            {workshops.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </FormField>
      )}

      {ws && (
        <>
          <p className="text-sm text-tg-hint">
            {ws.activeBatch.batch_name} · день {ageOf(ws.activeBatch.start_date, logDate)}
          </p>

          {todayLog && (
            <Card>
              <p className="text-xs uppercase tracking-wide text-tg-hint mb-2">Итоги за {new Date(logDate).toLocaleDateString('ru-RU')}</p>
              <div className="flex flex-col gap-1 text-sm">
                <div className="flex items-center justify-between">
                  <span>💀 Падёж: <strong>{todayLog.mortality || 0}</strong> гол.</span>
                  <span className="text-xs text-tg-hint">
                    ест. {todayLog.mortality_natural || 0}<QuickEdit value={todayLog.mortality_natural || 0} onSave={(v) => handleCorrect('mortality_natural', v)} />
                    {' '}· хал. {todayLog.mortality_halal || 0}<QuickEdit value={todayLog.mortality_halal || 0} onSave={(v) => handleCorrect('mortality_halal', v)} />
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>🌾 Корм: <strong>{todayLog.daily_feed || 0}</strong> меш. ({((todayLog.daily_feed || 0) * 40).toFixed(0)} кг)</span>
                  <QuickEdit value={todayLog.daily_feed || 0} onSave={(v) => handleCorrect('daily_feed', v)} />
                </div>
                <div className="flex items-center justify-between">
                  <span>💧 Вода: <strong>{todayLog.water_consumption || 0}</strong> л</span>
                  <QuickEdit value={todayLog.water_consumption || 0} onSave={(v) => handleCorrect('water_consumption', v)} />
                </div>
                {todayLog.weight ? <p>⚖️ Масса: <strong>{todayLog.weight}</strong> г</p> : null}
                {todayLog.medicine?.name ? <p>💊 Лекарство: <strong>{todayLog.medicine.name}</strong>{todayLog.dosage ? ` · ${todayLog.dosage}` : ''}</p> : null}
              </div>
            </Card>
          )}

          <Card>
            <p className="text-xs text-tg-hint mb-3">
              {todayLog ? 'Падёж, корм и вода добавятся к итогам выше. Масса и лекарство перезапишутся.' : 'Первая запись за эту дату.'}
            </p>
            <div className="flex flex-col gap-3">
              <FormField label="Падёж естественный (гол.)">
                <NumberStepper value={entry.mortality_natural} onChange={set('mortality_natural')} />
              </FormField>
              <FormField label="Падёж халяль (гол.)">
                <NumberStepper value={entry.mortality_halal} onChange={set('mortality_halal')} />
              </FormField>
              <FormField label="Корм (мешков)">
                <NumberStepper value={entry.feed} onChange={set('feed')} step={0.5} suffix="меш." />
              </FormField>
              <FormField label="Вода (литров)">
                <NumberStepper value={entry.water} onChange={set('water')} step={1} suffix="л" />
              </FormField>
              <FormField label="Масса (г/гол, перезаписывает)">
                <NumberStepper value={entry.weight} onChange={set('weight')} step={10} suffix="г" />
              </FormField>
              <FormField label="Лекарство">
                <select value={entry.medicine_id} onChange={(e) => set('medicine_id')(e.target.value)} className={fieldClass} style={{ minHeight: 44 }}>
                  <option value="">-- нет --</option>
                  {medicines.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </FormField>
              {entry.medicine_id && (
                <FormField label="Доза">
                  <input value={entry.dosage} onChange={(e) => set('dosage')(e.target.value)} placeholder="доза" className={fieldClass} style={{ minHeight: 44 }} />
                </FormField>
              )}
            </div>
            {saved && <p className="text-sm mt-3" style={{ color: '#28a745' }}>Сохранено ✓</p>}
          </Card>
        </>
      )}
    </div>
  );
}
