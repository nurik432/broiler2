// src/mobile/pages/MobileMedicinesPage.jsx
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
const UNIT_OPTIONS = ['шт', 'мл', 'л', 'гр', 'кг', 'доза', 'упак', 'флакон'];

const EMPTY_TXN_FORM = { transaction_date: new Date().toISOString().slice(0, 10), medicine_id: '', quantity: '', unit: 'шт', price_per_unit: '', description: '', company: '', batch_id: '' };
const EMPTY_PAYMENT_FORM = { transaction_date: new Date().toISOString().slice(0, 10), medicine_id: '', amount: '', description: '' };
const EMPTY_CATALOG_FORM = { name: '', description: '', imageFile: null };

export default function MobileMedicinesPage() {
  const [transactions, setTransactions] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [activeBatches, setActiveBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showHidden, setShowHidden] = useState(false);

  const [activeTab, setActiveTab] = useState('purchase');
  const [txnForm, setTxnForm] = useState(EMPTY_TXN_FORM);
  const [paymentForm, setPaymentForm] = useState(EMPTY_PAYMENT_FORM);
  const [catalogForm, setCatalogForm] = useState(EMPTY_CATALOG_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState(null); // { type: 'txn'|'medicine', id, imageUrl }

  async function fetchData() {
    setLoading(true);
    const [txRes, medsRes, batchesRes] = await Promise.all([
      supabase.from('medicine_transactions').select('*, medicine:medicines(name)').order('transaction_date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('medicines').select('*').order('name'),
      supabase.from('broiler_batches').select('id, batch_name').eq('is_active', true).or('is_summary.eq.false,is_summary.is.null'),
    ]);
    if (txRes.error) window.alert('Ошибка: ' + txRes.error.message);
    else setTransactions(txRes.data || []);
    if (medsRes.error) window.alert('Ошибка: ' + medsRes.error.message);
    else setMedicines(medsRes.data || []);
    if (batchesRes.error) window.alert('Ошибка: ' + batchesRes.error.message);
    else setActiveBatches(batchesRes.data || []);
    setLoading(false);
  }

  useEffect(() => { fetchData(); }, []);

  const filteredTransactions = useMemo(() => transactions.filter((t) => showHidden || !t.is_hidden), [transactions, showHidden]);

  const summary = useMemo(() => {
    const s = { total_purchased: 0, total_debt: 0, total_paid: 0 };
    filteredTransactions.forEach((t) => {
      const amt = Number(t.amount) || 0;
      if (t.transaction_type === 'purchase') s.total_purchased += amt;
      else if (t.transaction_type === 'debt') s.total_debt += amt;
      else if (t.transaction_type === 'payment') s.total_paid += amt;
    });
    s.current_balance = s.total_debt - s.total_paid;
    return s;
  }, [filteredTransactions]);

  async function submitTxn() {
    const qty = Number(txnForm.quantity);
    const price = Number(txnForm.price_per_unit);
    const totalAmount = qty * price;
    if (!(totalAmount > 0)) { window.alert('Сумма должна быть больше нуля'); return; }
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
      const { error } = await supabase.from('medicine_transactions').insert([{
        transaction_date: txnForm.transaction_date, transaction_type: activeTab,
        medicine_id: txnForm.medicine_id || null, quantity: qty, unit: txnForm.unit,
        price_per_unit: price, amount: totalAmount,
        description: txnForm.description || null, company: txnForm.company || null,
        batch_id: txnForm.batch_id || null, user_id: user.id,
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
      const { error } = await supabase.from('medicine_transactions').insert([{
        transaction_date: paymentForm.transaction_date, transaction_type: 'payment',
        medicine_id: paymentForm.medicine_id || null, quantity: null, unit: null, price_per_unit: null,
        amount, description: paymentForm.description || 'Оплата за лекарства', user_id: user.id,
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
    const { error } = await supabase.from('medicine_transactions').update({ is_hidden: !t.is_hidden }).eq('id', t.id);
    if (error) window.alert('Ошибка: ' + error.message);
    await fetchData();
  }

  async function submitCatalog() {
    if (!catalogForm.name.trim()) { window.alert('Введите название лекарства'); return; }
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
      let imageUrl = null;
      if (catalogForm.imageFile) {
        const fileName = `${Date.now()}_${catalogForm.imageFile.name}`;
        const { error: uploadError } = await supabase.storage.from('medicine_images').upload(fileName, catalogForm.imageFile);
        if (uploadError) { window.alert('Ошибка загрузки изображения: ' + uploadError.message); return; }
        imageUrl = supabase.storage.from('medicine_images').getPublicUrl(fileName).data.publicUrl;
      }
      const { error } = await supabase.from('medicines').insert([{ name: catalogForm.name, description: catalogForm.description || null, image_url: imageUrl, user_id: user.id }]);
      if (error) window.alert('Ошибка: ' + error.message);
      else { setCatalogForm(EMPTY_CATALOG_FORM); await fetchData(); }
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmDeleteAction() {
    if (!confirmTarget) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
    if (confirmTarget.type === 'txn') {
      const { error } = await supabase.from('medicine_transactions').delete().eq('id', confirmTarget.id);
      if (error) window.alert('Ошибка: ' + error.message);
    } else {
      const { error } = await supabase.from('medicines').delete().eq('id', confirmTarget.id);
      if (error) {
        window.alert('Ошибка: ' + error.message);
      } else if (confirmTarget.imageUrl) {
        const filePath = confirmTarget.imageUrl.substring(confirmTarget.imageUrl.lastIndexOf('/') + 1);
        if (filePath) await supabase.storage.from('medicine_images').remove([filePath]);
      }
    }
    setConfirmTarget(null);
    await fetchData();
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  return (
    <div className="flex flex-col gap-3 py-3">
      <StatGrid items={[
        { label: 'Куплено', value: formatCurrency(summary.total_purchased), color: '#007bff' },
        { label: 'В долг', value: formatCurrency(summary.total_debt), color: '#fd7e14' },
        { label: 'Оплачено', value: formatCurrency(summary.total_paid), color: '#28a745' },
        { label: 'Остаток долга', value: formatCurrency(summary.current_balance), color: summary.current_balance > 0 ? '#dc3545' : 'var(--tg-hint)' },
      ]} />

      <Tabs
        tabs={[
          { key: 'purchase', label: '📦 Покупка' },
          { key: 'debt', label: '📋 В долг' },
          { key: 'payment', label: '💰 Оплата' },
          { key: 'catalog', label: '📚 Каталог' },
        ]}
        active={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === 'catalog' ? (
        <>
          <Card>
            <div className="flex flex-col gap-3">
              <FormField label="Название *">
                <input value={catalogForm.name} onChange={(e) => setCatalogForm((f) => ({ ...f, name: e.target.value }))} className={fieldClass} style={{ minHeight: 48 }} />
              </FormField>
              <FormField label="Описание">
                <textarea value={catalogForm.description} onChange={(e) => setCatalogForm((f) => ({ ...f, description: e.target.value }))} className={fieldClass} style={{ minHeight: 72, paddingTop: 8, paddingBottom: 8 }} rows={3} />
              </FormField>
              <FormField label="Изображение (опционально)">
                <input type="file" accept="image/*" onChange={(e) => setCatalogForm((f) => ({ ...f, imageFile: e.target.files?.[0] || null }))} className="text-sm text-tg-hint" />
              </FormField>
              <button type="button" onClick={submitCatalog} disabled={submitting} className="rounded-xl px-4 py-3 text-base font-semibold bg-tg-button text-tg-button-text disabled:opacity-60" style={{ minHeight: 48 }}>
                {submitting ? 'Сохранение…' : '📚 Добавить в каталог'}
              </button>
            </div>
          </Card>

          {medicines.length === 0 ? (
            <EmptyState icon="💊" title="Каталог пуст" hint="Добавьте первое лекарство" />
          ) : (
            medicines.map((m) => (
              <Card key={m.id}>
                <div className="flex gap-3">
                  {m.image_url ? (
                    <img src={m.image_url} alt={m.name} className="w-16 h-16 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="w-16 h-16 rounded-lg bg-tg-secondary flex items-center justify-center text-2xl shrink-0">💊</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-medium truncate">{m.name}</p>
                    {m.description && <p className="text-xs text-tg-hint mt-0.5">{m.description}</p>}
                  </div>
                </div>
                <button type="button" onClick={() => setConfirmTarget({ type: 'medicine', id: m.id, imageUrl: m.image_url })} className="w-full mt-2 rounded-lg px-3 py-2 text-xs text-tg-destructive bg-tg-secondary" style={{ minHeight: 36 }}>🗑 Удалить</button>
              </Card>
            ))
          )}
        </>
      ) : (
        <>
          <label className="flex items-center gap-2 text-sm text-tg-hint select-none">
            <input type="checkbox" checked={showHidden} onChange={() => setShowHidden((v) => !v)} />
            Показать скрытые позиции
          </label>

          <Card>
            {activeTab !== 'payment' ? (
              <div className="flex flex-col gap-3">
                <FormField label="Дата">
                  <input type="date" value={txnForm.transaction_date} onChange={(e) => setTxnForm((f) => ({ ...f, transaction_date: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }} />
                </FormField>
                <FormField label="Лекарство">
                  <select value={txnForm.medicine_id} onChange={(e) => setTxnForm((f) => ({ ...f, medicine_id: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }}>
                    <option value="">— Выберите —</option>
                    {medicines.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </FormField>
                <FormField label="Количество *">
                  <input type="number" step="0.01" value={txnForm.quantity} onChange={(e) => setTxnForm((f) => ({ ...f, quantity: e.target.value }))} placeholder="10" className={fieldClass} style={{ minHeight: 48 }} />
                </FormField>
                <FormField label="Ед. измерения">
                  <select value={txnForm.unit} onChange={(e) => setTxnForm((f) => ({ ...f, unit: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }}>
                    {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </FormField>
                <FormField label="Цена за ед. *">
                  <input type="number" step="0.01" value={txnForm.price_per_unit} onChange={(e) => setTxnForm((f) => ({ ...f, price_per_unit: e.target.value }))} placeholder="150" className={fieldClass} style={{ minHeight: 48 }} />
                </FormField>
                {txnForm.quantity && txnForm.price_per_unit && (
                  <p className="text-sm text-tg-hint">Итого: <strong>{formatCurrency(Number(txnForm.quantity) * Number(txnForm.price_per_unit))}</strong></p>
                )}
                <FormField label="Описание">
                  <input value={txnForm.description} onChange={(e) => setTxnForm((f) => ({ ...f, description: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }} />
                </FormField>
                <FormField label="Фирма">
                  <input value={txnForm.company} onChange={(e) => setTxnForm((f) => ({ ...f, company: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }} />
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
                <FormField label="Лекарство">
                  <select value={paymentForm.medicine_id} onChange={(e) => setPaymentForm((f) => ({ ...f, medicine_id: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }}>
                    <option value="">— Общая оплата —</option>
                    {medicines.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </FormField>
                <FormField label="Сумма *">
                  <input type="number" step="0.01" value={paymentForm.amount} onChange={(e) => setPaymentForm((f) => ({ ...f, amount: e.target.value }))} placeholder="5000" className={fieldClass} style={{ minHeight: 48 }} />
                </FormField>
                <FormField label="Описание">
                  <input value={paymentForm.description} onChange={(e) => setPaymentForm((f) => ({ ...f, description: e.target.value }))} placeholder="Оплата за лекарства" className={fieldClass} style={{ minHeight: 44 }} />
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
            <EmptyState icon="💊" title="Операций пока нет" />
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
                      <p className="text-xs text-tg-hint mt-1">{new Date(t.transaction_date).toLocaleDateString('ru-RU')}{t.medicine?.name ? ` · ${t.medicine.name}` : ''}</p>
                      {t.quantity ? <p className="text-xs text-tg-hint">{t.quantity} {t.unit} @ {formatCurrency(t.price_per_unit)}</p> : null}
                      {t.description ? <p className="text-xs text-tg-hint">{t.description}</p> : null}
                    </div>
                    <p className="text-base font-semibold shrink-0" style={{ color: info.color }}>
                      {t.transaction_type === 'payment' ? '−' : '+'}{formatCurrency(t.amount)}
                    </p>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button type="button" onClick={() => toggleHidden(t)} className="flex-1 rounded-lg px-3 py-2 text-xs bg-tg-secondary" style={{ minHeight: 36 }}>
                      {t.is_hidden ? '👁️ Показать' : '🙈 Скрыть'}
                    </button>
                    <button type="button" onClick={() => setConfirmTarget({ type: 'txn', id: t.id })} className="flex-1 rounded-lg px-3 py-2 text-xs text-tg-destructive bg-tg-secondary" style={{ minHeight: 36 }}>🗑 Удалить</button>
                  </div>
                </Card>
              );
            })
          )}
        </>
      )}

      <ConfirmSheet
        open={!!confirmTarget}
        title={confirmTarget?.type === 'medicine' ? 'Удалить лекарство из каталога?' : 'Удалить запись?'}
        message={confirmTarget?.type === 'txn' ? 'Это повлияет на общий баланс.' : undefined}
        onConfirm={confirmDeleteAction}
        onClose={() => setConfirmTarget(null)}
      />
    </div>
  );
}
