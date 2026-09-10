// src/mobile/pages/MobileBatchesPage.jsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import Card from '../components/Card';
import ListRow from '../components/ListRow';
import StatusPill from '../components/StatusPill';
import EmptyState from '../components/EmptyState';
import Spinner from '../components/Spinner';

function ageOf(startDate) {
  return Math.max(1, Math.ceil((Date.now() - Date.parse(startDate)) / 86400000));
}

function mortalityStatus(pct) {
  if (pct >= 8) return 'critical';
  if (pct >= 5) return 'warning';
  return 'ok';
}

export default function MobileBatchesPage() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc('get_batches_with_stats');
      if (error) { setErr(error.message); setRows([]); return; }
      const sorted = [...(data || [])].sort((a, b) => (b.is_summary ? 1 : 0) - (a.is_summary ? 1 : 0));
      setRows(sorted);
    })();
  }, []);

  if (rows === null) {
    return <div className="flex justify-center py-20"><Spinner size={28} /></div>;
  }
  if (err) {
    return <EmptyState icon="⚠️" title="Не удалось загрузить партии" hint={err} />;
  }
  if (rows.length === 0) {
    return <EmptyState icon="🐔" title="Активных партий нет" hint="Создайте партию в веб-версии" />;
  }

  return (
    <div className="flex flex-col gap-3 py-3">
      {rows.map((b) => {
        const age = ageOf(b.start_date);
        const initial = b.initial_quantity || 0;
        const pct = initial > 0 ? (b.total_mortality / initial) * 100 : 0;
        return (
          <Card key={b.id} onClick={() => navigate(`/batch/${b.id}`)}>
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-base font-semibold truncate">{b.batch_name}</span>
              {!b.is_summary && (
                <StatusPill status={mortalityStatus(pct)}>падёж {pct.toFixed(1)}%</StatusPill>
              )}
            </div>
            <ListRow label="День выращивания" value={age} />
            <ListRow label="Начальное поголовье" value={initial.toLocaleString('ru-RU')} />
            <ListRow label="Осталось" value={Number(b.current_quantity).toLocaleString('ru-RU')} />
            <ListRow label="Падёж всего" value={Number(b.total_mortality).toLocaleString('ru-RU')} />
          </Card>
        );
      })}
    </div>
  );
}
