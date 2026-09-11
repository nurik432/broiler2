// src/mobile/pages/MobileCoalPage.jsx
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabaseClient';
import Card from '../components/Card';
import ConfirmSheet from '../components/ConfirmSheet';
import FormField from '../components/FormField';
import StatGrid from '../components/StatGrid';
import Tabs from '../components/Tabs';
import EmptyState from '../components/EmptyState';
import Spinner from '../components/Spinner';

const fieldClass = 'w-full rounded-xl px-3 bg-tg-secondary text-tg-text';
const formatCurrency = (v) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'TJS' }).format(v || 0);
const TYPE_LABELS = { purchase: { label: 'Покупка', color: '#007bff' }, debt: { label: 'В долг', color: '#fd7e14' }, payment: { label: 'Оплата', color: '#28a745' } };

const EMPTY_TXN_FORM = { transaction_date: new Date().toISOString().slice(0, 10), quantity_kg: '', price_per_kg: '', description: '', batch_id: '' };
const EMPTY_PAYMENT_FORM = { transaction_date: new Date().toISOString().slice(0, 10), amount: '', description: '' };

export default function MobileCoalPage() {
  const [transactions, setTransactions] = useState([]);
  const [activeBatches, setActiveBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showHidden, setShowHidden] = useState(false);

  const [activeTab, setActiveTab] = useState('purchase');
  const [txnForm, setTxnForm] = useState(EMPTY_TXN_FORM);
  const [paymentForm, setPaymentForm] = useState(EMPTY_PAYMENT_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  async function fetchData() {
    setLoading(true);
    const [txRes, batchesRes] = await Promise.all([
      supabase.from('coal_transactions').select('*').order('transaction_date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('broiler_batches').select('id, batch_name').eq('is_active', true).or('is_summary.eq.false,is_summary.is.null'),
    ]);
    if (txRes.error) window.alert('Ошибка: ' + txRes.error.message);
    else setTransactions(txRes.data || []);
    if (batchesRes.error) window.alert('Ошибка: ' + batchesRes.error.message);
    else setActiveBatches(batchesRes.data || []);
    setLoading(false);
  }

  useEffect(() => { fetchData(); }, []);

  const filteredTransactions = useMemo(() => transactions.filter((t) => showHidden || !t.is_hidden), [transactions, showHidden]);

  const summary = useMemo(() => {
    const s = { total_kg: 0, total_purchased: 0, total_debt: 0, total_paid: 0 };
    filteredTransactions.forEach((t) => {
      const amt = Number(t.amount) || 0;
      const kg = Number(t.quantity_kg) || 0;
      if (t.transaction_type === 'purchase') { s.total_purchased += amt; s.total_kg += kg; }
      else if (t.transaction_type === 'debt') { s.total_debt += amt; s.total_kg += kg; }
      else if (t.transaction_type === 'payment') { s.total_paid += amt; }
    });
    s.current_balance = s.total_debt - s.total_paid;
    return s;
  }, [filteredTransactions]);

  async function submitTxn() {
    const qty = Number(txnForm.quantity_kg);
    const price = Number(txnForm.price_per_kg);
    const totalAmount = qty * price;
    if (!(totalAmount > 0)) { window.alert('Сумма должна быть больше нуля'); return; }
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
      const { error } = await supabase.from('coal_transactions').insert([{
        transaction_date: txnForm.transaction_date, transaction_type: activeTab,
        quantity_kg: qty, price_per_kg: price, amount: totalAmount,
        description: txnForm.description || null, batch_id: txnForm.batch_id || null, user_id: user.id,
      }]);
      if (error) window.alert('Ошибка: ' + error.message);
      else { setTxnForm({ ...EMPTY_TXN_FORM, transaction_date: new Date().toISOString().slice(0, 10) }); await fetchData(); }
    } finally {
      setSubmitting(false);
    }
  }

  async function submitPayment() {
    const amount = Number(paymentForm.amount);
    if (!(amount > 0)) { window.alert('Сумма должна быть больше нуля'); return; }
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
      const { error } = await supabase.from('coal_transactions').insert([{
        transaction_date: paymentForm.transaction_date, transaction_type: 'payment',
        quantity_kg: null, price_per_kg: null, amount,
        description: paymentForm.description || 'Платёж за уголь', user_id: user.id,
      }]);
      if (error) window.alert('Ошибка: ' + error.message);
      else { setPaymentForm({ ...EMPTY_PAYMENT_FORM, transaction_date: new Date().toISOString().slice(0, 10) }); await fetchData(); }
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleHidden(t) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
    const { error } = await supabase.from('coal_transactions').update({ is_hidden: !t.is_hidden }).eq('id', t.id);
    if (error) window.alert('Ошибка: ' + error.message);
    await fetchData();
  }

  async function confirmDelete() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
    const { error } = await supabase.from('coal_transactions').delete().eq('id', confirmDeleteId);
    if (error) window.alert('Ошибка: ' + error.message);
    setConfirmDeleteId(null);
    await fetchData();
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  return (
    <div className="flex flex-col gap-3 py-3">
      <StatGrid items={[
        { label: 'Всего (кг)', value: `${summary.total_kg || 0} кг`, color: 'var(--tg-hint)' },
        { label: 'Куплено', value: formatCurrency(summary.total_purchased), color: '#007bff' },
        { label: 'В долг', value: formatCurrency(summary.total_debt), color: '#fd7e14' },
        { label: 'Оплачено', value: formatCurrency(summary.total_paid), color: '#28a745' },
      ]} />
      <StatGrid items={[
        { label: 'Остаток долга', value: formatCurrency(summary.current_balance), color: summary.current_balance > 0 ? '#dc3545' : 'var(--tg-hint)' },
      ]} />

      <label className="flex items-center gap-2 text-sm text-tg-hint select-none">
        <input type="checkbox" checked={showHidden} onChange={() => setShowHidden((v) => !v)} />
        Показать скрытые позиции
      </label>

      <Tabs
        tabs={[
          { key: 'purchase', label: '📦 Покупка' },
          { key: 'debt', label: '📋 В долг' },
          { key: 'payment', label: '💰 Оплата' },
        ]}
        active={activeTab}
        onChange={setActiveTab}
      />

      <Card>
        {activeTab !== 'payment' ? (
          <div className="flex flex-col gap-3">
            <FormField label="Дата">
              <input type="date" value={txnForm.transaction_date} onChange={(e) => setTxnForm((f) => ({ ...f, transaction_date: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }} />
            </FormField>
            <FormField label="Кол-во (кг) *">
              <input type="number" step="0.1" value={txnForm.quantity_kg} onChange={(e) => setTxnForm((f) => ({ ...f, quantity_kg: e.target.value }))} placeholder="1000" className={fieldClass} style={{ minHeight: 48 }} />
            </FormField>
            <FormField label="Цена за кг *">
              <input type="number" step="0.01" value={txnForm.price_per_kg} onChange={(e) => setTxnForm((f) => ({ ...f, price_per_kg: e.target.value }))} placeholder="3.50" className={fieldClass} style={{ minHeight: 48 }} />
            </FormField>
            {txnForm.quantity_kg && txnForm.price_per_kg && (
              <p className="text-sm text-tg-hint">Итого: <strong>{formatCurrency(Number(txnForm.quantity_kg) * Number(txnForm.price_per_kg))}</strong></p>
            )}
            <FormField label="Описание">
              <input value={txnForm.description} onChange={(e) => setTxnForm((f) => ({ ...f, description: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }} />
            </FormField>
            <FormField label="Партия (опционально)">
              <select value={txnForm.batch_id} onChange={(e) => setTxnForm((f) => ({ ...f, batch_id: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }}>
                <option value="">— Не привязывать —</option>
                {activeBatches.map((b) => <option key={b.id} value={b.id}>{b.batch_name}</option>)}
              </select>
            </FormField>
            <button
              type="button" onClick={submitTxn} disabled={submitting}
              className="rounded-xl px-4 py-3 text-base font-semibold text-white disabled:opacity-60"
              style={{ minHeight: 48, background: activeTab === 'purchase' ? '#007bff' : '#fd7e14' }}
            >
              {submitting ? 'Сохранение…' : activeTab === 'purchase' ? '📦 Записать покупку' : '📋 Записать в долг'}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <FormField label="Дата">
              <input type="date" value={paymentForm.transaction_date} onChange={(e) => setPaymentForm((f) => ({ ...f, transaction_date: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }} />
            </FormField>
            <FormField label="Сумма *">
              <input type="number" step="0.01" value={paymentForm.amount} onChange={(e) => setPaymentForm((f) => ({ ...f, amount: e.target.value }))} placeholder="5000" className={fieldClass} style={{ minHeight: 48 }} />
            </FormField>
            <FormField label="Описание">
              <input value={paymentForm.description} onChange={(e) => setPaymentForm((f) => ({ ...f, description: e.target.value }))} placeholder="Платёж за уголь" className={fieldClass} style={{ minHeight: 44 }} />
            </FormField>
            <button
              type="button" onClick={submitPayment} disabled={submitting}
              className="rounded-xl px-4 py-3 text-base font-semibold text-white disabled:opacity-60"
              style={{ minHeight: 48, background: '#28a745' }}
            >
              {submitting ? 'Сохранение…' : '💰 Записать оплату'}
            </button>
          </div>
        )}
      </Card>

      {filteredTransactions.length === 0 ? (
        <EmptyState icon="🔥" title="Операций пока нет" />
      ) : (
        filteredTransactions.map((t) => {
          const info = TYPE_LABELS[t.transaction_type] || {};
          return (
            <Card key={t.id} className={t.is_hidden ? 'opacity-50' : ''}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-xs font-semibold rounded-full px-2 py-0.5" style={{ background: `color-mix(in srgb, ${info.color} 15%, transparent)`, color: info.color }}>
                    {info.label}
                  </span>
                  <p className="text-xs text-tg-hint mt-1">{new Date(t.transaction_date).toLocaleDateString('ru-RU')}{t.description ? ` · ${t.description}` : ''}</p>
                  {t.quantity_kg ? <p className="text-xs text-tg-hint">{t.quantity_kg} кг @ {t.price_per_kg}</p> : null}
                </div>
                <p className="text-base font-semibold shrink-0" style={{ color: info.color }}>
                  {t.transaction_type === 'payment' ? '−' : '+'}{formatCurrency(t.amount)}
                </p>
              </div>
              <div className="flex gap-2 mt-2">
                <button type="button" onClick={() => toggleHidden(t)} className="flex-1 rounded-lg px-3 py-2 text-xs bg-tg-secondary" style={{ minHeight: 36 }}>
                  {t.is_hidden ? '👁️ Показать' : '🙈 Скрыть'}
                </button>
                <button type="button" onClick={() => setConfirmDeleteId(t.id)} className="flex-1 rounded-lg px-3 py-2 text-xs text-tg-destructive bg-tg-secondary" style={{ minHeight: 36 }}>🗑 Удалить</button>
              </div>
            </Card>
          );
        })
      )}

      <ConfirmSheet open={!!confirmDeleteId} title="Удалить запись?" message="Это повлияет на общий баланс." onConfirm={confirmDelete} onClose={() => setConfirmDeleteId(null)} />
    </div>
  );
}
