// src/mobile/pages/MobileDebtsPage.jsx
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabaseClient';
import Card from '../components/Card';
import BottomSheet from '../components/BottomSheet';
import ConfirmSheet from '../components/ConfirmSheet';
import FormField from '../components/FormField';
import StatGrid from '../components/StatGrid';
import EmptyState from '../components/EmptyState';
import Spinner from '../components/Spinner';
import { useTelegramMainButton } from '../telegram/useTelegramMainButton';

const fieldClass = 'w-full rounded-xl px-3 bg-tg-secondary text-tg-text';
const formatCurrency = (v) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'TJS' }).format(v || 0);
const EMPTY_DEBT_FORM = { creditor_name: '', amount: '', description: '', debt_date: new Date().toISOString().slice(0, 10) };

export default function MobileDebtsPage() {
  const [debts, setDebts] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showSettled, setShowSettled] = useState(false);
  const [filterCreditor, setFilterCreditor] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const [formOpen, setFormOpen] = useState(false);
  const [debtForm, setDebtForm] = useState(EMPTY_DEBT_FORM);
  const [savingDebt, setSavingDebt] = useState(false);

  const [payingDebtId, setPayingDebtId] = useState(null);
  const [payAmount, setPayAmount] = useState('');
  const [payDescription, setPayDescription] = useState('');
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [savingPayment, setSavingPayment] = useState(false);

  const [confirmDeleteDebtId, setConfirmDeleteDebtId] = useState(null);
  const [confirmDeletePaymentId, setConfirmDeletePaymentId] = useState(null);

  async function fetchDebts() {
    setLoading(true);
    const { data, error } = await supabase.from('debts').select('*, debt_payments(*)').order('debt_date', { ascending: false });
    if (error) { window.alert('Ошибка: ' + error.message); setDebts([]); }
    else setDebts(data || []);
    setLoading(false);
  }

  useEffect(() => { fetchDebts(); }, []);

  const uniqueCreditors = useMemo(() => {
    const set = new Set();
    debts.forEach((d) => { if (d.creditor_name) set.add(d.creditor_name); });
    return Array.from(set).sort();
  }, [debts]);

  const filteredDebts = useMemo(() => {
    return debts.filter((d) => {
      if (!showSettled && d.is_settled) return false;
      if (filterCreditor && d.creditor_name !== filterCreditor) return false;
      return true;
    });
  }, [debts, showSettled, filterCreditor]);

  const getDebtPaid = (debt) => (debt.debt_payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const getDebtRemaining = (debt) => Math.max((Number(debt.amount) || 0) - getDebtPaid(debt), 0);

  const dashboard = useMemo(() => {
    const totalDebt = debts.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
    const totalPaid = debts.reduce((sum, d) => sum + getDebtPaid(d), 0);
    const activeDebts = debts.filter((d) => !d.is_settled).length;
    const settledDebts = debts.filter((d) => d.is_settled).length;
    const byCreditor = {};
    debts.forEach((d) => {
      const name = d.creditor_name || 'Без имени';
      if (!byCreditor[name]) byCreditor[name] = { totalDebt: 0, totalPaid: 0 };
      byCreditor[name].totalDebt += Number(d.amount) || 0;
      byCreditor[name].totalPaid += getDebtPaid(d);
    });
    return {
      totalDebt, totalPaid, remaining: totalDebt - totalPaid, activeDebts, settledDebts,
      byCreditor: Object.entries(byCreditor)
        .map(([name, v]) => ({ name, ...v, remaining: v.totalDebt - v.totalPaid }))
        .sort((a, b) => b.remaining - a.remaining),
    };
  }, [debts]);

  function openCreate() {
    setDebtForm({ ...EMPTY_DEBT_FORM, debt_date: new Date().toISOString().slice(0, 10) });
    setFormOpen(true);
  }

  async function saveDebt() {
    if (!debtForm.creditor_name.trim()) { window.alert('Укажите, кому должны'); return; }
    if (!(Number(debtForm.amount) > 0)) { window.alert('Сумма должна быть больше нуля'); return; }
    setSavingDebt(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
      const { error } = await supabase.from('debts').insert({
        creditor_name: debtForm.creditor_name.trim(),
        amount: Number(debtForm.amount),
        description: debtForm.description || null,
        debt_date: debtForm.debt_date,
        user_id: user.id,
      });
      if (error) window.alert('Ошибка: ' + error.message);
      else { setFormOpen(false); await fetchDebts(); }
    } finally {
      setSavingDebt(false);
    }
  }

  useTelegramMainButton({
    text: savingDebt ? 'Сохраняем…' : 'Записать долг',
    onClick: saveDebt,
    visible: formOpen,
    loading: savingDebt,
  });

  function startPay(debt) {
    setPayingDebtId(debt.id); setPayAmount(''); setPayDescription('');
    setPayDate(new Date().toISOString().slice(0, 10));
  }

  async function savePayment(debtId) {
    if (!(Number(payAmount) > 0)) { window.alert('Сумма должна быть больше нуля'); return; }
    setSavingPayment(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
      const { error } = await supabase.from('debt_payments').insert({
        debt_id: debtId, amount: Number(payAmount), payment_date: payDate,
        description: payDescription || null, user_id: user.id,
      });
      if (error) { window.alert('Ошибка: ' + error.message); return; }
      const debt = debts.find((d) => d.id === debtId);
      if (debt) {
        const totalPaidNow = getDebtPaid(debt) + Number(payAmount);
        if (totalPaidNow >= Number(debt.amount)) {
          const { error: settleError } = await supabase.from('debts').update({ is_settled: true }).eq('id', debtId);
          if (settleError) window.alert('Оплата сохранена, но не удалось автоматически закрыть долг: ' + settleError.message);
        }
      }
      setPayingDebtId(null);
      await fetchDebts();
    } finally {
      setSavingPayment(false);
    }
  }

  async function toggleSettled(debt) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
    const { error } = await supabase.from('debts').update({ is_settled: !debt.is_settled }).eq('id', debt.id);
    if (error) window.alert('Ошибка: ' + error.message);
    await fetchDebts();
  }

  async function confirmDeleteDebt() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
    const { error } = await supabase.from('debts').delete().eq('id', confirmDeleteDebtId);
    if (error) window.alert('Ошибка: ' + error.message);
    setConfirmDeleteDebtId(null);
    await fetchDebts();
  }

  async function confirmDeletePayment() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
    const { error } = await supabase.from('debt_payments').delete().eq('id', confirmDeletePaymentId);
    if (error) window.alert('Ошибка: ' + error.message);
    setConfirmDeletePaymentId(null);
    await fetchDebts();
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  return (
    <div className="flex flex-col gap-3 py-3">
      <StatGrid items={[
        { label: 'Всего долгов', value: formatCurrency(dashboard.totalDebt), color: '#fd7e14' },
        { label: 'Оплачено', value: formatCurrency(dashboard.totalPaid), color: '#28a745' },
        { label: 'Остаток', value: formatCurrency(dashboard.remaining), color: dashboard.remaining > 0 ? '#dc3545' : 'var(--tg-hint)' },
        { label: 'Активных / Закрытых', value: `${dashboard.activeDebts} / ${dashboard.settledDebts}`, color: 'var(--tg-link, #4f46e5)' },
      ]} />

      {dashboard.byCreditor.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-tg-hint">По кредиторам</p>
          {dashboard.byCreditor.map((c) => (
            <Card key={c.name}>
              <div className="flex justify-between items-center">
                <p className="font-semibold">{c.name}</p>
                <p className="text-sm font-bold" style={{ color: c.remaining > 0 ? 'var(--tg-destructive)' : '#28a745' }}>{formatCurrency(c.remaining)}</p>
              </div>
            </Card>
          ))}
        </div>
      )}

      <button
        type="button" onClick={openCreate}
        className="w-full rounded-xl px-4 py-3 text-base font-semibold bg-tg-button text-tg-button-text"
        style={{ minHeight: 48 }}
      >
        + Записать долг
      </button>

      <div className="flex flex-wrap gap-2 items-center">
        {uniqueCreditors.length > 0 && (
          <select value={filterCreditor} onChange={(e) => setFilterCreditor(e.target.value)} className={fieldClass} style={{ minHeight: 40, flex: 1 }}>
            <option value="">Все кредиторы</option>
            {uniqueCreditors.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <label className="flex items-center gap-2 text-sm text-tg-hint select-none">
          <input type="checkbox" checked={showSettled} onChange={() => setShowSettled((v) => !v)} />
          Закрытые
        </label>
      </div>

      {filteredDebts.length === 0 ? (
        <EmptyState icon="📋" title="Долгов нет" hint={!showSettled ? 'Попробуйте включить закрытые' : undefined} />
      ) : (
        filteredDebts.map((debt) => {
          const paid = getDebtPaid(debt);
          const remaining = getDebtRemaining(debt);
          const progress = Number(debt.amount) > 0 ? Math.min((paid / Number(debt.amount)) * 100, 100) : 0;
          const isExpanded = expandedId === debt.id;
          return (
            <Card key={debt.id} onClick={() => setExpandedId(isExpanded ? null : debt.id)}>
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold truncate">{debt.creditor_name || '—'}</p>
                    <span
                      className="text-xs rounded-full px-2 py-0.5"
                      style={{
                        background: debt.is_settled ? 'color-mix(in srgb, #28a745 15%, transparent)' : 'color-mix(in srgb, #dc3545 15%, transparent)',
                        color: debt.is_settled ? '#28a745' : '#dc3545',
                      }}
                    >
                      {debt.is_settled ? 'Закрыт' : 'Активный'}
                    </span>
                  </div>
                  <p className="text-xs text-tg-hint">
                    {new Date(debt.debt_date).toLocaleDateString('ru-RU')}{debt.description ? ` · ${debt.description}` : ''}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-tg-hint">Остаток</p>
                  <p className="text-base font-bold" style={{ color: remaining > 0 ? 'var(--tg-destructive)' : 'var(--tg-text)' }}>{formatCurrency(remaining)}</p>
                </div>
              </div>
              <div className="mt-2 h-2 rounded-full bg-tg-secondary overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${progress}%`, background: progress >= 100 ? '#28a745' : progress > 50 ? '#fd7e14' : '#dc3545' }} />
              </div>

              {isExpanded && (
                <div className="mt-3 pt-3 flex flex-col gap-3" style={{ borderTop: '1px solid var(--tg-secondary-bg)' }} onClick={(e) => e.stopPropagation()}>
                  <div>
                    <p className="text-xs font-semibold text-tg-hint mb-1">История оплат</p>
                    {(debt.debt_payments || []).length === 0 ? (
                      <p className="text-sm text-tg-hint">Оплат ещё не было</p>
                    ) : (
                      [...debt.debt_payments].sort((a, b) => new Date(b.payment_date) - new Date(a.payment_date)).map((p) => (
                        <div key={p.id} className="flex items-center justify-between py-1">
                          <span className="text-sm">{new Date(p.payment_date).toLocaleDateString('ru-RU')} · {formatCurrency(p.amount)}</span>
                          <button type="button" onClick={() => setConfirmDeletePaymentId(p.id)} className="text-xs text-tg-destructive px-2 py-2 -my-2">Удалить</button>
                        </div>
                      ))
                    )}
                  </div>

                  {!debt.is_settled && (
                    payingDebtId === debt.id ? (
                      <div className="flex flex-col gap-2 rounded-xl bg-tg-secondary p-3">
                        <FormField label="Сумма">
                          <input type="number" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder={`Макс. ${remaining}`} className={fieldClass} style={{ minHeight: 44 }} />
                        </FormField>
                        <FormField label="Дата">
                          <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className={fieldClass} style={{ minHeight: 44 }} />
                        </FormField>
                        <FormField label="Комментарий">
                          <input value={payDescription} onChange={(e) => setPayDescription(e.target.value)} className={fieldClass} style={{ minHeight: 44 }} />
                        </FormField>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => savePayment(debt.id)} disabled={savingPayment} className="flex-1 rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" style={{ minHeight: 44, background: '#28a745' }}>
                            {savingPayment ? 'Сохранение…' : 'Сохранить'}
                          </button>
                          <button type="button" onClick={() => setPayingDebtId(null)} className="flex-1 rounded-xl px-4 py-2 text-sm bg-tg-secondary" style={{ minHeight: 44 }}>Отмена</button>
                        </div>
                      </div>
                    ) : (
                      <button type="button" onClick={() => startPay(debt)} className="rounded-xl px-4 py-2 text-sm font-semibold text-white" style={{ minHeight: 44, background: '#28a745' }}>
                        💵 Внести часть оплаты
                      </button>
                    )
                  )}

                  <div className="flex gap-2">
                    <button type="button" onClick={() => toggleSettled(debt)} className="flex-1 rounded-xl px-3 py-2 text-xs font-medium bg-tg-secondary" style={{ minHeight: 40 }}>
                      {debt.is_settled ? '↩ Вернуть в активные' : '✅ Отметить закрытым'}
                    </button>
                    <button type="button" onClick={() => setConfirmDeleteDebtId(debt.id)} className="flex-1 rounded-xl px-3 py-2 text-xs font-medium text-tg-destructive bg-tg-secondary" style={{ minHeight: 40 }}>
                      🗑 Удалить долг
                    </button>
                  </div>
                </div>
              )}
            </Card>
          );
        })
      )}

      <BottomSheet open={formOpen} onClose={() => setFormOpen(false)} title="Записать долг">
        <div className="flex flex-col gap-3">
          <FormField label="Кому должны *">
            <input
              list="mobile-creditor-suggestions"
              value={debtForm.creditor_name}
              onChange={(e) => setDebtForm((f) => ({ ...f, creditor_name: e.target.value }))}
              placeholder="Имя / Фирма"
              className={fieldClass} style={{ minHeight: 48 }}
            />
            <datalist id="mobile-creditor-suggestions">
              {uniqueCreditors.map((c) => <option key={c} value={c} />)}
            </datalist>
          </FormField>
          <FormField label="Сумма *">
            <input type="number" step="0.01" value={debtForm.amount} onChange={(e) => setDebtForm((f) => ({ ...f, amount: e.target.value }))} className={fieldClass} style={{ minHeight: 48 }} />
          </FormField>
          <FormField label="Дата">
            <input type="date" value={debtForm.debt_date} onChange={(e) => setDebtForm((f) => ({ ...f, debt_date: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }} />
          </FormField>
          <FormField label="За что">
            <input value={debtForm.description} onChange={(e) => setDebtForm((f) => ({ ...f, description: e.target.value }))} placeholder="Корм, лекарства и т.д." className={fieldClass} style={{ minHeight: 44 }} />
          </FormField>
          <button
            type="button" onClick={saveDebt} disabled={savingDebt}
            className="rounded-xl px-4 py-3 text-base font-semibold bg-tg-button text-tg-button-text disabled:opacity-60"
            style={{ minHeight: 48 }}
          >
            {savingDebt ? 'Сохранение…' : 'Записать долг'}
          </button>
        </div>
      </BottomSheet>

      <ConfirmSheet open={!!confirmDeleteDebtId} title="Удалить долг?" message="Будут удалены все его погашения." onConfirm={confirmDeleteDebt} onClose={() => setConfirmDeleteDebtId(null)} />
      <ConfirmSheet open={!!confirmDeletePaymentId} title="Удалить погашение?" onConfirm={confirmDeletePayment} onClose={() => setConfirmDeletePaymentId(null)} />
    </div>
  );
}
