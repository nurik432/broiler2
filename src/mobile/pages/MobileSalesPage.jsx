// src/mobile/pages/MobileSalesPage.jsx
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabaseClient';
import Card from '../components/Card';
import BottomSheet from '../components/BottomSheet';
import ConfirmSheet from '../components/ConfirmSheet';
import FormField from '../components/FormField';
import NamePicker from '../components/NamePicker';
import EmptyState from '../components/EmptyState';
import Spinner from '../components/Spinner';

const fieldClass = 'w-full rounded-xl px-3 bg-tg-secondary text-tg-text';
const formatCurrency = (v) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'TJS' }).format(v || 0);

function firstDayOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function lastDayOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
}

const EMPTY_FORM = { sale_date: new Date().toISOString().slice(0, 10), customerId: '', customerText: '', weight_kg: '', price_per_kg: '', batch_id: '' };

export default function MobileSalesPage() {
  const [allSales, setAllSales] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [activeBatches, setActiveBatches] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showArchived, setShowArchived] = useState(false);

  const [reportOpen, setReportOpen] = useState(false);
  const [startDate, setStartDate] = useState(firstDayOfMonth());
  const [endDate, setEndDate] = useState(lastDayOfMonth());

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const [paymentsSale, setPaymentsSale] = useState(null);
  const [modalPayments, setModalPayments] = useState([]);

  const [newPaymentOpen, setNewPaymentOpen] = useState(false);
  const [newPaymentCustomerId, setNewPaymentCustomerId] = useState('');
  const [newPaymentCustomerText, setNewPaymentCustomerText] = useState('');
  const [newPaymentAmount, setNewPaymentAmount] = useState('');
  const [newPaymentDate, setNewPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [processingPayment, setProcessingPayment] = useState(false);

  async function fetchData() {
    setLoading(true);
    const [salesRes, batchesRes, customersRes] = await Promise.all([
      supabase.rpc('get_sales_with_stats'),
      supabase.from('broiler_batches').select('id, batch_name').eq('is_active', true).or('is_summary.eq.false,is_summary.is.null'),
      supabase.from('customers').select('id, full_name').order('full_name'),
    ]);
    if (salesRes.error) window.alert('Ошибка: ' + salesRes.error.message);
    else setAllSales(salesRes.data || []);
    if (batchesRes.error) window.alert('Ошибка: ' + batchesRes.error.message);
    else setActiveBatches(batchesRes.data || []);
    if (customersRes.error) window.alert('Ошибка: ' + customersRes.error.message);
    else setCustomers(customersRes.data || []);
    setLoading(false);
  }

  useEffect(() => { fetchData(); }, []);

  const filteredSales = useMemo(() => {
    return allSales.filter((s) => {
      if (showArchived) return true;
      return !s.batch_id || s.batch_is_active === true;
    });
  }, [allSales, showArchived]);

  const reportTotals = useMemo(() => {
    if (!startDate || !endDate) return { totalSales: 0, totalPayments: 0, totalBalance: 0 };
    return filteredSales
      .filter((s) => s.sale_date >= startDate && s.sale_date <= endDate)
      .reduce((acc, s) => {
        acc.totalSales += Number(s.total_amount) || 0;
        acc.totalPayments += Number(s.total_paid) || 0;
        acc.totalBalance += Number(s.balance) || 0;
        return acc;
      }, { totalSales: 0, totalPayments: 0, totalBalance: 0 });
  }, [filteredSales, startDate, endDate]);

  async function handleCreateCustomer(name, target) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
    const { data, error } = await supabase.from('customers').insert([{ full_name: name, user_id: user.id }]).select().single();
    if (error) { window.alert('Ошибка: ' + error.message); return; }
    setCustomers((prev) => [...prev, data].sort((a, b) => a.full_name.localeCompare(b.full_name)));
    if (target === 'form') setForm((f) => ({ ...f, customerId: data.id, customerText: data.full_name }));
    else { setNewPaymentCustomerId(data.id); setNewPaymentCustomerText(data.full_name); }
  }

  function openCreate() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, sale_date: new Date().toISOString().slice(0, 10) });
    setFormOpen(true);
  }
  function openEdit(sale) {
    setEditingId(sale.id);
    setForm({
      sale_date: sale.sale_date,
      customerId: sale.customer_id || '',
      customerText: sale.customer_name || '',
      weight_kg: String(sale.weight_kg ?? ''),
      price_per_kg: String(sale.price_per_kg ?? ''),
      batch_id: sale.batch_id || '',
    });
    setFormOpen(true);
  }

  async function save() {
    if (!(Number(form.weight_kg) > 0)) { window.alert('Укажите вес больше нуля'); return; }
    if (!(Number(form.price_per_kg) > 0)) { window.alert('Укажите цену больше нуля'); return; }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
      const payload = {
        sale_date: form.sale_date,
        customer_id: form.customerId || null,
        weight_kg: Number(form.weight_kg),
        price_per_kg: Number(form.price_per_kg),
        batch_id: form.batch_id || null,
      };
      let error;
      if (editingId) {
        ({ error } = await supabase.from('sales').update(payload).eq('id', editingId));
      } else {
        ({ error } = await supabase.from('sales').insert([{ ...payload, user_id: user.id }]));
      }
      if (error) window.alert('Ошибка: ' + error.message);
      else { setFormOpen(false); await fetchData(); }
    } catch (e) {
      window.alert('Ошибка: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
    const { error } = await supabase.from('sales').delete().eq('id', confirmDeleteId);
    if (error) window.alert('Ошибка: ' + error.message);
    setConfirmDeleteId(null);
    await fetchData();
  }

  async function openPayments(sale) {
    setPaymentsSale(sale);
    const { data, error } = await supabase.from('payments').select('*').eq('sale_id', sale.id).order('payment_date', { ascending: false });
    if (error) { window.alert('Ошибка: ' + error.message); setModalPayments([]); }
    else setModalPayments(data || []);
  }

  async function deletePayment(paymentId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
    const { error } = await supabase.from('payments').delete().eq('id', paymentId);
    if (error) { window.alert('Ошибка: ' + error.message); return; }
    await fetchData();
    const { data } = await supabase.from('payments').select('*').eq('sale_id', paymentsSale.id).order('payment_date', { ascending: false });
    setModalPayments(data || []);
    const { data: freshSales } = await supabase.rpc('get_sales_with_stats');
    setPaymentsSale(freshSales?.find((s) => s.id === paymentsSale.id) || null);
  }

  async function submitNewPayment() {
    if (!newPaymentCustomerId) { window.alert('Выберите клиента.'); return; }
    const amount = Number(newPaymentAmount);
    if (!(amount > 0)) { window.alert('Сумма должна быть больше нуля.'); return; }
    setProcessingPayment(true);
    try {
      const { data: freshSales, error: fetchError } = await supabase.rpc('get_sales_with_stats');
      if (fetchError) { window.alert('Ошибка: ' + fetchError.message); return; }
      const unpaidSales = (freshSales || [])
        .filter((s) => s.customer_id === newPaymentCustomerId && s.balance > 0)
        .sort((a, b) => new Date(a.sale_date) - new Date(b.sale_date));
      const totalOwed = unpaidSales.reduce((sum, s) => sum + (Number(s.balance) || 0), 0);
      if (amount > totalOwed) {
        window.alert(`У клиента остаток всего ${totalOwed.toFixed(2)} TJS, введено ${amount.toFixed(2)} TJS.`);
        return;
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
      let remaining = amount;
      const rowsToInsert = [];
      for (const sale of unpaidSales) {
        if (remaining <= 0) break;
        const chunk = Math.min(remaining, sale.balance);
        rowsToInsert.push({ sale_id: sale.id, payment_date: newPaymentDate, amount: chunk, user_id: user.id });
        remaining -= chunk;
      }
      const { error: insertError } = await supabase.from('payments').insert(rowsToInsert);
      if (insertError) { window.alert('Ошибка: ' + insertError.message); return; }
      setNewPaymentCustomerId(''); setNewPaymentCustomerText(''); setNewPaymentAmount('');
      setNewPaymentOpen(false);
      await fetchData();
    } finally {
      setProcessingPayment(false);
    }
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  return (
    <div className="flex flex-col gap-3 py-3">
      <div className="flex gap-2">
        <button
          type="button" onClick={openCreate}
          className="flex-1 rounded-xl px-4 py-3 text-sm font-semibold bg-tg-button text-tg-button-text"
          style={{ minHeight: 44 }}
        >
          + Продажа
        </button>
        <button
          type="button" onClick={() => setNewPaymentOpen(true)}
          className="flex-1 rounded-xl px-4 py-3 text-sm font-semibold text-white"
          style={{ minHeight: 44, background: '#28a745' }}
        >
          + Поступление
        </button>
      </div>

      <label className="flex items-center gap-2 text-sm text-tg-hint select-none">
        <input type="checkbox" checked={showArchived} onChange={() => setShowArchived((v) => !v)} />
        Показать продажи архивных партий
      </label>

      <Card onClick={() => setReportOpen((v) => !v)}>
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">📊 Отчёт за период</p>
          <span className="text-tg-hint">{reportOpen ? '▲' : '▼'}</span>
        </div>
        {reportOpen && (
          <div className="mt-3 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex gap-2">
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={fieldClass} style={{ minHeight: 44 }} />
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={fieldClass} style={{ minHeight: 44 }} />
            </div>
            <p className="text-sm">Продажи: <strong>{formatCurrency(reportTotals.totalSales)}</strong></p>
            <p className="text-sm">Оплачено: <strong style={{ color: '#28a745' }}>{formatCurrency(reportTotals.totalPayments)}</strong></p>
            <p className="text-sm">Остаток: <strong style={{ color: 'var(--tg-destructive)' }}>{formatCurrency(reportTotals.totalBalance)}</strong></p>
          </div>
        )}
      </Card>

      {filteredSales.length === 0 ? (
        <EmptyState icon="💰" title="Продаж пока нет" hint="Нажмите «+ Продажа»" />
      ) : (
        filteredSales.map((sale) => (
          <Card key={sale.id} onClick={() => openPayments(sale)}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-base font-medium truncate">{sale.customer_name || 'Без клиента'}</p>
                <p className="text-xs text-tg-hint">
                  {new Date(sale.sale_date).toLocaleDateString('ru-RU')} · {sale.weight_kg} кг @ {sale.price_per_kg}
                </p>
                {sale.batch_name && (
                  <span
                    className="inline-block mt-1 text-xs rounded-full px-2 py-0.5"
                    style={{
                      background: sale.batch_is_active ? 'color-mix(in srgb, var(--tg-link, #4f46e5) 15%, transparent)' : 'var(--tg-secondary-bg)',
                      color: sale.batch_is_active ? 'var(--tg-link, #4f46e5)' : 'var(--tg-hint)',
                    }}
                  >
                    {sale.batch_name}
                  </span>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="text-base font-semibold">{formatCurrency(sale.total_amount)}</p>
                {sale.balance <= 0 ? (
                  <span className="text-xs font-medium" style={{ color: '#28a745' }}>Выплачено</span>
                ) : (
                  <span className="text-xs font-medium" style={{ color: 'var(--tg-destructive)' }}>Остаток: {formatCurrency(sale.balance)}</span>
                )}
              </div>
            </div>
            <div className="flex gap-2 mt-2" onClick={(e) => e.stopPropagation()}>
              <button type="button" onClick={() => openEdit(sale)} className="flex-1 rounded-lg px-3 py-2 text-xs bg-tg-secondary" style={{ minHeight: 36 }}>✏️ Изменить</button>
              <button type="button" onClick={() => setConfirmDeleteId(sale.id)} className="flex-1 rounded-lg px-3 py-2 text-xs text-tg-destructive bg-tg-secondary" style={{ minHeight: 36 }}>🗑 Удалить</button>
            </div>
          </Card>
        ))
      )}

      <BottomSheet open={formOpen} onClose={() => setFormOpen(false)} title={editingId ? 'Редактировать продажу' : 'Новая продажа'}>
        <div className="flex flex-col gap-3">
          <FormField label="Дата">
            <input type="date" value={form.sale_date} onChange={(e) => setForm((f) => ({ ...f, sale_date: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }} />
          </FormField>
          <FormField label="Клиент (опционально)">
            <NamePicker
              items={customers}
              value={form.customerText}
              onChange={(text) => setForm((f) => ({ ...f, customerText: text, customerId: '' }))}
              onSelectExisting={(c) => setForm((f) => ({ ...f, customerId: c.id, customerText: c.full_name }))}
              onCreateNew={(name) => handleCreateCustomer(name, 'form')}
              placeholder="Введите имя клиента..."
            />
          </FormField>
          <FormField label="Вес (кг) *">
            <input type="number" step="0.01" value={form.weight_kg} onChange={(e) => setForm((f) => ({ ...f, weight_kg: e.target.value }))} className={fieldClass} style={{ minHeight: 48 }} />
          </FormField>
          <FormField label="Цена за кг *">
            <input type="number" step="0.01" value={form.price_per_kg} onChange={(e) => setForm((f) => ({ ...f, price_per_kg: e.target.value }))} className={fieldClass} style={{ minHeight: 48 }} />
          </FormField>
          <FormField label="Партия (опционально)">
            <select value={form.batch_id} onChange={(e) => setForm((f) => ({ ...f, batch_id: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }}>
              <option value="">— Не привязывать —</option>
              {activeBatches.map((b) => <option key={b.id} value={b.id}>{b.batch_name}</option>)}
            </select>
          </FormField>
          <button
            type="button" onClick={save} disabled={saving}
            className="rounded-xl px-4 py-3 text-base font-semibold bg-tg-button text-tg-button-text disabled:opacity-60"
            style={{ minHeight: 48 }}
          >
            {saving ? 'Сохраняем…' : editingId ? 'Сохранить' : 'Добавить продажу'}
          </button>
        </div>
      </BottomSheet>

      <BottomSheet open={!!paymentsSale} onClose={() => setPaymentsSale(null)} title="История платежей по продаже">
        {paymentsSale && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-tg-hint">
              от {new Date(paymentsSale.sale_date).toLocaleDateString('ru-RU')} (Клиент: {paymentsSale.customer_name || 'Не указан'})
            </p>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div><p className="text-xs text-tg-hint">К оплате</p><p className="font-bold">{formatCurrency(paymentsSale.total_amount)}</p></div>
              <div><p className="text-xs text-tg-hint">Оплачено</p><p className="font-bold" style={{ color: '#28a745' }}>{formatCurrency(paymentsSale.total_paid)}</p></div>
              <div><p className="text-xs text-tg-hint">Остаток</p><p className="font-bold" style={{ color: 'var(--tg-destructive)' }}>{formatCurrency(paymentsSale.balance)}</p></div>
            </div>
            <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
              {modalPayments.length === 0 ? (
                <p className="text-sm text-tg-hint text-center py-4">Платежей пока нет.</p>
              ) : modalPayments.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg bg-tg-secondary px-3 py-2">
                  <span className="text-sm">{new Date(p.payment_date).toLocaleDateString('ru-RU')} · {formatCurrency(p.amount)}</span>
                  <button type="button" onClick={() => deletePayment(p.id)} className="text-xs text-tg-destructive px-2 py-2 -my-2">Удалить</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </BottomSheet>

      <BottomSheet open={newPaymentOpen} onClose={() => setNewPaymentOpen(false)} title="Новое поступление">
        <div className="flex flex-col gap-3">
          <FormField label="Клиент *">
            <NamePicker
              items={customers}
              value={newPaymentCustomerText}
              onChange={(text) => { setNewPaymentCustomerText(text); setNewPaymentCustomerId(''); }}
              onSelectExisting={(c) => { setNewPaymentCustomerId(c.id); setNewPaymentCustomerText(c.full_name); }}
              onCreateNew={(name) => handleCreateCustomer(name, 'payment')}
              placeholder="Введите имя клиента..."
            />
          </FormField>
          <FormField label="Дата">
            <input type="date" value={newPaymentDate} onChange={(e) => setNewPaymentDate(e.target.value)} className={fieldClass} style={{ minHeight: 44 }} />
          </FormField>
          <FormField label="Сумма *">
            <input type="number" step="0.01" value={newPaymentAmount} onChange={(e) => setNewPaymentAmount(e.target.value)} className={fieldClass} style={{ minHeight: 48 }} />
          </FormField>
          <button
            type="button" onClick={submitNewPayment} disabled={processingPayment}
            className="rounded-xl px-4 py-3 text-base font-semibold text-white disabled:opacity-60"
            style={{ minHeight: 48, background: '#28a745' }}
          >
            {processingPayment ? 'Обработка…' : 'Провести'}
          </button>
        </div>
      </BottomSheet>

      <ConfirmSheet
        open={!!confirmDeleteId}
        title="Удалить продажу?"
        message="Будут удалены и все связанные платежи."
        onConfirm={confirmDelete}
        onClose={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
