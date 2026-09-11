// src/mobile/pages/MobileBatchReportPage.jsx
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import Card from '../components/Card';
import ListRow from '../components/ListRow';
import EmptyState from '../components/EmptyState';
import Spinner from '../components/Spinner';

function formatCurrency(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '0 TJS';
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'TJS' }).format(value);
}

export default function MobileBatchReportPage() {
  const { batchId } = useParams();
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setReport(null);
      setError('');
      try {
        const { data: batchRow, error: batchError } = await supabase
          .from('broiler_batches')
          .select('is_summary, batch_name')
          .eq('id', batchId)
          .single();
        if (batchError) { setError('Не удалось загрузить партию.'); return; }

        if (batchRow.is_summary) {
          const { data, error: rpcError } = await supabase.rpc('get_active_summary_report');
          if (rpcError) { setError('Не удалось сгенерировать сводный отчёт.'); return; }
          if (data?.[0]) setReport({ ...data[0], batch_name: batchRow.batch_name, is_summary: true });
        } else {
          const { data, error: rpcError } = await supabase.rpc('generate_batch_report', { p_batch_id: batchId });
          if (rpcError) { setError('Не удалось сгенерировать отчёт. Убедитесь, что партия существует.'); return; }
          if (data) setReport(data);
        }
      } catch (e) {
        setError('Не удалось сгенерировать отчёт: ' + e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [batchId]);

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;
  if (error) return <EmptyState icon="⚠️" title="Ошибка" hint={error} />;
  if (!report) return <EmptyState icon="📭" title="Данные для отчета не найдены." />;

  return (
    <div className="flex flex-col gap-3 py-3">
      <Card>
        <p className="text-lg font-semibold">{report.batch_name}</p>
        <p className="text-sm text-tg-hint">
          {report.is_summary
            ? 'Сводка по всем активным партиям'
            : `${new Date(report.start_date).toLocaleDateString('ru-RU')} – ${new Date(report.end_date).toLocaleDateString('ru-RU')}`}
        </p>
      </Card>

      <Card>
        <p className="text-xs uppercase text-tg-hint mb-1">Доходы</p>
        <ListRow
          label={report.is_summary ? 'Продажи' : 'Продажи (привязанные)'}
          value={formatCurrency(report.total_sales)}
        />
      </Card>

      <Card>
        <p className="text-xs uppercase text-tg-hint mb-1">Расходы</p>
        {report.is_summary && (
          <>
            <ListRow label="Корм" value={formatCurrency(report.total_feed_cost)} />
            <ListRow label="Лекарства" value={formatCurrency(report.total_medicine_cost)} />
            <ListRow label="Уголь" value={formatCurrency(report.total_coal_cost)} />
          </>
        )}
        <ListRow
          label={report.is_summary ? 'Расходы' : 'Расходы (привязанные)'}
          value={formatCurrency(report.total_expenses)}
        />
        <ListRow
          label={report.is_summary ? 'Зарплаты' : 'Зарплаты (привязанные)'}
          value={formatCurrency(report.total_salaries)}
        />
      </Card>

      <Card>
        {report.is_summary && (
          <ListRow label="Итого затрат" value={formatCurrency(report.total_cost)} />
        )}
        <div className="flex items-center justify-between pt-2">
          <span className="text-base font-semibold">Итоговая прибыль</span>
          <span
            className="text-lg font-bold"
            style={{ color: report.profit >= 0 ? '#28a745' : 'var(--tg-destructive, #df3f40)' }}
          >
            {formatCurrency(report.profit)}
          </span>
        </div>
      </Card>
    </div>
  );
}
