// src/mobile/pages/MobileBatchLogPage.jsx
import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { calcMortality, forecastWeight, calcHistoricalMortality, buildWeightSeries } from '../../utils/normComparison';
import { getNormForDay, FEED_BAG_WEIGHT_G } from '../../constants/broilerStandards';
import Card from '../components/Card';
import ListRow from '../components/ListRow';
import StatusPill from '../components/StatusPill';
import Tabs from '../components/Tabs';
import WeightChart from '../components/WeightChart';
import EmptyState from '../components/EmptyState';
import Spinner from '../components/Spinner';
import MobileJournalTab from './batchLog/MobileJournalTab';

function formatCurrency(v) {
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'TJS' }).format(v || 0);
}

export default function MobileBatchLogPage() {
  const { batchId } = useParams();
  const navigate = useNavigate();
  const [batch, setBatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('journal');
  const [logs, setLogs] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [sales, setSales] = useState([]);
  const [feed, setFeed] = useState([]);
  const [salaries, setSalaries] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [historicalBatches, setHistoricalBatches] = useState([]);
  const [historicalLogs, setHistoricalLogs] = useState([]);

  async function fetchAll() {
    setLoading(true);
    try {
      const [batchRes, logsRes, medicinesRes, expensesRes, salesRes, feedRes, salariesRes] = await Promise.all([
        supabase.from('broiler_batches').select('*').eq('id', batchId).single(),
        supabase.from('daily_logs').select('*, medicine:medicines(name)').eq('batch_id', batchId).order('log_date', { ascending: false }),
        supabase.from('medicines').select('id, name'),
        supabase.rpc('get_expenses_by_batch', { batch_uuid: batchId }),
        supabase.rpc('get_sales_by_batch', { batch_uuid: batchId }),
        supabase.rpc('get_feed_by_batch', { batch_uuid: batchId }),
        supabase.rpc('get_salaries_by_batch', { batch_uuid: batchId }),
      ]);
      if (batchRes.error) throw batchRes.error;
      setBatch(batchRes.data);
      setLogs(logsRes.data || []);
      setMedicines(medicinesRes.data || []);
      setExpenses(expensesRes.data || []);
      setSales(salesRes.data || []);
      setFeed(feedRes.data || []);
      setSalaries(salariesRes.data || []);

      const { data: others } = await supabase
        .from('broiler_batches')
        .select('id, batch_name, initial_quantity')
        .neq('id', batchId);
      setHistoricalBatches(others || []);
      if (others?.length) {
        const { data: histLogs } = await supabase
          .from('daily_logs')
          .select('batch_id, age, mortality')
          .in('batch_id', others.map((b) => b.id));
        setHistoricalLogs(histLogs || []);
      } else {
        setHistoricalLogs([]);
      }
    } catch (e) {
      window.alert('Не удалось загрузить данные партии: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (batchId) fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId]);

  const totalMortality = useMemo(() => logs.reduce((s, l) => s + l.mortality, 0), [logs]);
  const currentQuantity = batch ? batch.initial_quantity - totalMortality : 0;
  const lastLog = useMemo(() => [...logs].sort((a, b) => b.age - a.age)[0], [logs]);
  const norm = lastLog ? getNormForDay(lastLog.age) : null;
  const mortality = logs.length && batch ? calcMortality(logs, batch.initial_quantity) : null;
  const forecast = logs.length ? forecastWeight(logs, 42) : null;
  const weightSeries = logs.length ? buildWeightSeries(logs, 42) : [];
  const histMortality = lastLog ? calcHistoricalMortality(historicalBatches, historicalLogs, lastLog.age) : [];
  const waterPerHead = lastLog?.water_consumption && currentQuantity > 0
    ? Math.round((lastLog.water_consumption * 1000) / currentQuantity) : null;
  const feedPerHead = lastLog?.daily_feed && currentQuantity > 0
    ? Math.round((lastLog.daily_feed * FEED_BAG_WEIGHT_G) / currentQuantity) : null;

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;
  if (!batch) return <EmptyState icon="⚠️" title="Партия не найдена" />;

  const tabs = [
    { key: 'journal', label: 'Журнал', count: logs.length },
    { key: 'expenses', label: 'Расходы', count: expenses.length },
    { key: 'sales', label: 'Продажи', count: sales.length },
    { key: 'feed', label: 'Корм', count: feed.length },
    { key: 'salaries', label: 'Зарплаты', count: salaries.length },
  ];

  return (
    <div className="flex flex-col gap-3 py-3">
      <Card>
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-lg font-semibold truncate">{batch.batch_name}</span>
          <StatusPill status={batch.is_active ? 'ok' : 'neutral'}>{batch.is_active ? 'Активна' : 'Завершена'}</StatusPill>
        </div>
        <button
          type="button"
          onClick={() => navigate(`/batch/${batchId}/report`)}
          className="text-sm text-tg-link underline mt-1"
        >
          Финансовый отчёт →
        </button>
        <ListRow label="Начало" value={new Date(batch.start_date).toLocaleDateString('ru-RU')} />
        <ListRow label="Начальное поголовье" value={batch.initial_quantity?.toLocaleString('ru-RU')} />
        <ListRow label="Общий падёж" value={totalMortality} />
        <ListRow label="Текущее поголовье" value={currentQuantity.toLocaleString('ru-RU')} />
      </Card>

      {logs.length > 0 && (
        <>
          {norm && (
            <Card>
              <p className="text-sm font-semibold mb-1">🐔 Живая масса</p>
              <ListRow label={`Факт (день ${lastLog.age})`} value={`${lastLog.weight ?? '—'} г`} />
              <ListRow label="Норма ROSS-308" value={`${norm.weight} г`} />
            </Card>
          )}
          {mortality && (
            <Card>
              <p className="text-sm font-semibold mb-1">💀 Падёж (накопительный)</p>
              <ListRow label="Пало" value={`${mortality.totalDead} гол. (${mortality.factPercent}%)`} />
              <ListRow label="Норма ROSS-308" value={`до ${mortality.normPercent}%`} />
              <div className="pt-1">
                <StatusPill status={mortality.status}>
                  {mortality.status === 'ok' ? 'В норме' : mortality.status === 'warning' ? 'Повышенный' : 'Критический'}
                </StatusPill>
              </div>
            </Card>
          )}
          {norm && waterPerHead != null && (
            <Card>
              <p className="text-sm font-semibold mb-1">💧 Вода, мл/гол/сутки</p>
              <ListRow label="Всего" value={`${lastLog.water_consumption} л`} />
              <ListRow label="На голову" value={`${waterPerHead} мл`} />
              <ListRow label="Норма ROSS-308" value={`${norm.waterNorm} мл`} />
            </Card>
          )}
          {norm && feedPerHead != null && (
            <Card>
              <p className="text-sm font-semibold mb-1">🌾 Корм, г/гол/сутки</p>
              <ListRow label="Всего" value={`${lastLog.daily_feed} мешк.`} />
              <ListRow label="На голову" value={`${feedPerHead} г`} />
              <ListRow label="Норма ROSS-308" value={`${norm.dailyFeed} г`} />
            </Card>
          )}
          {weightSeries.length > 0 && (
            <Card>
              <p className="text-sm font-semibold mb-2">📈 Масса: факт vs норма vs прогноз</p>
              {forecast && (
                <p className="text-xs text-tg-hint mb-2">
                  Прирост/сут: {forecast.dailyGain} г · Прогноз (42): {forecast.forecastWeight} г
                </p>
              )}
              <WeightChart data={weightSeries} />
            </Card>
          )}
          {histMortality.length > 0 && mortality && (
            <Card>
              <p className="text-sm font-semibold mb-2">📊 Падёж vs предыдущие партии (день {lastLog.age})</p>
              <ListRow label="Текущая" value={`${mortality.totalDead} / ${mortality.factPercent}%`} />
              {histMortality.map((h, i) => (
                <ListRow key={i} label={h.batchName} value={`${h.totalDead} / ${h.percent}%`} />
              ))}
            </Card>
          )}
        </>
      )}

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'journal' && (
        <MobileJournalTab batch={batch} logs={logs} medicines={medicines} onReload={fetchAll} />
      )}
      {tab === 'expenses' && (
        expenses.length === 0 ? <EmptyState icon="📭" title="Расходов нет" /> : expenses.map((e) => (
          <ListRow key={e.id} label={`${new Date(e.expense_date).toLocaleDateString('ru-RU')} · ${e.description}`} value={formatCurrency(e.amount)} />
        ))
      )}
      {tab === 'sales' && (
        sales.length === 0 ? <EmptyState icon="📭" title="Продаж нет" /> : sales.map((s) => (
          <ListRow key={s.id} label={`${new Date(s.sale_date).toLocaleDateString('ru-RU')} · ${s.customer_name || '—'}`} value={formatCurrency(s.weight_kg * s.price_per_kg)} />
        ))
      )}
      {tab === 'feed' && (
        feed.length === 0 ? <EmptyState icon="📭" title="Поставок корма нет" /> : feed.map((f) => (
          <ListRow key={f.id} label={`${new Date(f.delivery_date).toLocaleDateString('ru-RU')} · ${f.feed_type}`} value={`${f.quantity_kg} кг`} />
        ))
      )}
      {tab === 'salaries' && (
        salaries.length === 0 ? <EmptyState icon="📭" title="Выплат нет" /> : salaries.map((s) => (
          <ListRow key={s.id} label={`${new Date(s.payment_date).toLocaleDateString('ru-RU')} · ${s.employee_name}`} value={formatCurrency(s.amount)} />
        ))
      )}
    </div>
  );
}
