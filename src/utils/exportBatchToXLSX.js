// src/utils/exportBatchToXLSX.js
// Экспорт полной истории партии (лог, расходы, продажи, корм, зарплаты) в
// один .xlsx-файл с несколькими листами. Используется и десктопом, и
// мобильной (Telegram) оболочкой — см. BatchesPage.jsx / MobileBatchesPage.jsx.

import * as XLSX from 'xlsx';
import { supabase } from '../supabaseClient';

export async function exportBatchToXLSX(batchId) {
  const [
    batchRes, logsRes, expensesRes, salesRes, feedRes, salariesRes,
  ] = await Promise.all([
    supabase.from('broiler_batches').select('*').eq('id', batchId).single(),
    supabase.from('daily_logs').select('*, medicine:medicines(name)').eq('batch_id', batchId).order('log_date', { ascending: false }),
    supabase.rpc('get_expenses_by_batch', { batch_uuid: batchId }),
    supabase.rpc('get_sales_by_batch', { batch_uuid: batchId }),
    supabase.rpc('get_feed_by_batch', { batch_uuid: batchId }),
    supabase.rpc('get_salaries_by_batch', { batch_uuid: batchId }),
  ]);

  if (batchRes.error) throw batchRes.error;
  if (logsRes.error) throw logsRes.error;
  if (expensesRes.error) throw expensesRes.error;
  if (salesRes.error) throw salesRes.error;
  if (feedRes.error) throw feedRes.error;
  if (salariesRes.error) throw salariesRes.error;

  const wb = XLSX.utils.book_new();

  const batchData = [
    ['batch_name', 'start_date', 'initial_quantity', 'is_active'],
    [batchRes.data.batch_name, batchRes.data.start_date, batchRes.data.initial_quantity, batchRes.data.is_active],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(batchData), 'Партия');

  const logsHeader = ['log_date', 'age', 'mortality', 'weight', 'daily_feed', 'medicine', 'dosage', 'water_consumption'];
  const logsBody = logsRes.data.map((l) => [l.log_date, l.age, l.mortality, l.weight ?? '', l.daily_feed ?? '', l.medicine?.name ?? '', l.dosage ?? '', l.water_consumption ?? '']);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([logsHeader, ...logsBody]), 'Журнал');

  const expBody = expensesRes.data.map((e) => [e.expense_date, e.description, e.amount]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['expense_date', 'description', 'amount'], ...expBody]), 'Расходы');

  const salesBody = salesRes.data.map((s) => [s.sale_date, s.customer_name, s.weight_kg, s.price_per_kg]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['sale_date', 'customer_name', 'weight_kg', 'price_per_kg'], ...salesBody]), 'Продажи');

  const feedBody = feedRes.data.map((f) => [f.delivery_date, f.feed_type, f.quantity_kg]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['delivery_date', 'feed_type', 'quantity_kg'], ...feedBody]), 'Корм');

  const salBody = salariesRes.data.map((s) => [s.payment_date, s.employee_name, s.payment_type, s.amount]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['payment_date', 'employee_name', 'payment_type', 'amount'], ...salBody]), 'Зарплаты');

  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.setAttribute('download', `batch_${batchId}_data.xlsx`);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
