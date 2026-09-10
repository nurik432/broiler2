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

const EMPTY = { mortality_natural: '', mortality_halal: '', feed: '', water: '', weight: '' };
const today = () => new Date().toISOString().slice(0, 10);

function ageOf(startDate, dateStr) {
  return Math.max(1, Math.ceil((Date.parse(dateStr) - Date.parse(startDate)) / 86400000));
}

export default function MobileDailyEntryPage() {
  const [loading, setLoading] = useState(true);
  const [workshops, setWorkshops] = useState([]);
  const [logs, setLogs] = useState({});          // workshopId -> today's daily_logs row | null
  const [selected, setSelected] = useState('');  // workshop id
  const [entry, setEntry] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const haptics = useTelegramHaptics();
  const logDate = today();

  async function load() {
    setLoading(true);
    const { data: wsData } = await supabase
      .from('workshops')
      .select('*, batches:broiler_batches (id, batch_name, initial_quantity, start_date, is_active)')
      .eq('is_active', true)
      .order('name');
    const active = (wsData || [])
      .map((w) => ({ ...w, activeBatch: w.batches?.find((b) => b.is_active) || null }))
      .filter((w) => w.activeBatch);
    setWorkshops(active);
    setSelected((prev) => prev || active[0]?.id || '');

    const byWs = {};
    const batchIds = active.map((w) => w.activeBatch.id);
    if (batchIds.length) {
      const { data: logRows } = await supabase
        .from('daily_logs').select('*').in('batch_id', batchIds).eq('log_date', logDate);
      const byBatch = {};
      (logRows || []).forEach((l) => { byBatch[l.batch_id] = l; });
      active.forEach((w) => { byWs[w.id] = byBatch[w.activeBatch.id] || null; });
    }
    setLogs(byWs);
    setLoading(false);
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const ws = useMemo(() => workshops.find((w) => w.id === selected), [workshops, selected]);
  const todayLog = ws ? logs[ws.id] : null;

  async function save() {
    if (!ws) return;
    const mn = Number(entry.mortality_natural) || 0;
    const mh = Number(entry.mortality_halal) || 0;
    const feed = Number(entry.feed) || 0;
    const water = Number(entry.water) || 0;
    const weight = entry.weight ? parseFloat(entry.weight) : null;
    if (mn === 0 && mh === 0 && feed === 0 && water === 0 && weight === null) {
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
          user_id: user.id,
        }]);
        if (error) throw error;
      }
      await syncSummaryBatchLog(logDate, user.id); // domain invariant
      setEntry(EMPTY);
      setSaved(true);
      haptics.success();
      await load();
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
            className="w-full rounded-xl px-3 bg-tg-secondary text-tg-text" style={{ minHeight: 48 }}
          >
            {workshops.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </FormField>
      )}

      {ws && (
        <Card>
          <p className="text-sm text-tg-hint mb-3">
            {ws.activeBatch.batch_name} · день {ageOf(ws.activeBatch.start_date, logDate)}
            {todayLog && ' · за сегодня уже есть запись, значения добавятся'}
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
          </div>
          {saved && <p className="text-sm mt-3" style={{ color: '#28a745' }}>Сохранено ✓</p>}
        </Card>
      )}
    </div>
  );
}
