// src/mobile/pages/workshops/MobileWorkshopDetailPage.jsx
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../../supabaseClient';
import { getNormForDay, FEED_BAG_WEIGHT_G } from '../../../constants/broilerStandards';
import Card from '../../components/Card';
import ListRow from '../../components/ListRow';
import EmptyState from '../../components/EmptyState';
import Spinner from '../../components/Spinner';

export default function MobileWorkshopDetailPage() {
  const { workshopId } = useParams();
  const [workshop, setWorkshop] = useState(null);
  const [batch, setBatch] = useState(null);
  const [logs, setLogs] = useState(null); // null = still loading
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    (async () => {
      setLogs(null);
      setNotFound(false);
      const { data: w } = await supabase.from('workshops').select('id, name').eq('id', workshopId).maybeSingle();
      if (!w) { setNotFound(true); return; }
      setWorkshop(w);

      const { data: b } = await supabase
        .from('broiler_batches')
        .select('*')
        .eq('workshop_id', workshopId)
        .eq('is_active', true)
        .order('start_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      setBatch(b);
      if (!b) { setLogs([]); return; }

      const { data: l } = await supabase
        .from('daily_logs')
        .select('log_date, age, mortality, weight, daily_feed, water_consumption')
        .eq('batch_id', b.id)
        .order('age', { ascending: false });
      setLogs(l || []);
    })();
  }, [workshopId]);

  if (notFound) return <EmptyState icon="⚠️" title="Цех не найден" />;
  if (logs === null) return <div className="flex justify-center py-20"><Spinner /></div>;
  if (!batch) return <EmptyState icon="🏭" title={`В «${workshop?.name ?? ''}» нет активной партии`} />;

  const totalDead = logs.reduce((s, r) => s + (r.mortality || 0), 0);
  const currentHead = batch.initial_quantity - totalDead;

  function feedPerHead(row) {
    let cumMort = 0;
    const sortedAsc = [...logs].sort((a, b) => a.age - b.age);
    for (const l of sortedAsc) {
      if (l.age < row.age) cumMort += l.mortality || 0;
    }
    const flock = batch.initial_quantity - cumMort;
    if (!flock || !row.daily_feed) return null;
    return Math.round((row.daily_feed * FEED_BAG_WEIGHT_G) / flock);
  }

  return (
    <div className="flex flex-col gap-3 py-3">
      <Card>
        <p className="text-base font-semibold">{batch.batch_name}</p>
        <ListRow label="Посадка" value={`${batch.initial_quantity?.toLocaleString('ru-RU')} гол.`} />
        <ListRow label="Сейчас" value={`${currentHead?.toLocaleString('ru-RU')} гол.`} />
        <ListRow label="Всего пало" value={totalDead} />
        <ListRow label="Начало" value={new Date(batch.start_date).toLocaleDateString('ru-RU')} />
      </Card>

      {logs.length === 0 ? (
        <EmptyState icon="📭" title="Записей журнала пока нет" />
      ) : (
        logs.map((row, i) => {
          const norm = getNormForDay(row.age);
          const fph = feedPerHead(row);
          return (
            <Card key={i}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold">{new Date(row.log_date).toLocaleDateString('ru-RU')}</span>
                <span className="text-xs text-tg-hint">День {row.age}</span>
              </div>
              <ListRow label="Падёж" value={row.mortality} />
              <ListRow label="Масса факт / норма" value={`${row.weight ?? '—'} / ${norm?.weight ?? '—'} г`} />
              <ListRow label="Корм факт / норма" value={`${fph ?? '—'} / ${norm?.dailyFeed ?? '—'} г/гол`} />
              <ListRow label="Вода" value={row.water_consumption != null ? `${row.water_consumption} л` : '—'} />
            </Card>
          );
        })
      )}
    </div>
  );
}
