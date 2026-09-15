// src/mobile/pages/salaries/MobileSalaryTab.jsx
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../supabaseClient';
import { calculateSalary } from '../../../utils/calculateSalary';
import Card from '../../components/Card';
import BottomSheet from '../../components/BottomSheet';
import EmptyState from '../../components/EmptyState';
import ConfirmSheet from '../../components/ConfirmSheet';

const fieldClass = 'w-full rounded-xl px-3 bg-tg-secondary text-tg-text';
const formatCurrency = (v) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'TJS' }).format(v || 0);

export default function MobileSalaryTab({ selectedPerson, setSelectedPerson, activeBatches, persons }) {
  const [allSalaries, setAllSalaries] = useState([]);
  const [showPastPeriods, setShowPastPeriods] = useState(false);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentType, setPaymentType] = useState('аванс');
  const [saving, setSaving] = useState(false);
  const [editingPaymentId, setEditingPaymentId] = useState(null);
  const [editDate, setEditDate] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editType, setEditType] = useState('аванс');
  const [confirmDeletePaymentId, setConfirmDeletePaymentId] = useState(null);

  async function loadSalaries() {
    if (!selectedPerson) { setAllSalaries([]); return; }
    const employeeIds = (selectedPerson.employees || []).map((e) => e.id);
    if (employeeIds.length === 0) { setAllSalaries([]); return; }
    const { data, error } = await supabase.from('salaries').select('*').in('employee_id', employeeIds).order('payment_date', { ascending: false });
    if (error) { window.alert('Ошибка: ' + error.message); setAllSalaries([]); return; }
    const formatted = (data || []).map((s) => {
      let batchName = null; let batchIsActive = true;
      if (s.batch_id) {
        const batch = activeBatches.find((b) => b.id === s.batch_id);
        if (batch) { batchName = batch.batch_name; batchIsActive = true; }
        else {
          selectedPerson.employees?.forEach((emp) => {
            if (emp.broiler_batches?.id === s.batch_id) { batchName = emp.broiler_batches.batch_name; batchIsActive = emp.broiler_batches.is_active; }
          });
        }
      }
      return { ...s, batch_name: batchName, batch_is_active: batchIsActive };
    });
    setAllSalaries(formatted);
  }

  useEffect(() => { loadSalaries(); }, [selectedPerson]);

  const activePersons = useMemo(() => {
    return (persons || []).filter((p) => {
      const latest = p.employees?.[0];
      if (!latest) return false;
      const isFired = latest.is_active === false || !!latest.end_date;
      return !isFired;
    });
  }, [persons]);

  const recentEmployment = selectedPerson?.employees?.[0];
  const currentEmployeeId = recentEmployment?.id;

  const { currentPeriodSalaries, pastPeriodSalaries } = useMemo(() => {
    const current = []; const past = [];
    allSalaries.forEach((s) => (s.employee_id === currentEmployeeId ? current : past).push(s));
    return { currentPeriodSalaries: current, pastPeriodSalaries: past };
  }, [allSalaries, currentEmployeeId]);

  const currentAccruedData = useMemo(() => {
    if (!recentEmployment) return { salary: 0, effectiveDays: 0, breakdown: [] };
    return calculateSalary(recentEmployment, recentEmployment.broiler_batches || {});
  }, [recentEmployment]);

  const currentTotals = useMemo(() => {
    const totals = { totalAdvance: 0, totalSalary: 0, totalAll: 0, byBatch: {} };
    currentPeriodSalaries.forEach((s) => {
      const amount = Number(s.amount) || 0;
      totals.totalAll += amount;
      if (s.payment_type === 'аванс') totals.totalAdvance += amount;
      else if (s.payment_type === 'зарплата') totals.totalSalary += amount;
      if (s.batch_id && s.batch_name) {
        if (!totals.byBatch[s.batch_id]) totals.byBatch[s.batch_id] = { name: s.batch_name, total: 0, isActive: s.batch_is_active };
        totals.byBatch[s.batch_id].total += amount;
      }
    });
    return totals;
  }, [currentPeriodSalaries]);

  const pastTotals = useMemo(() => pastPeriodSalaries.reduce((sum, s) => sum + (Number(s.amount) || 0), 0), [pastPeriodSalaries]);

  const pastPeriodGroups = useMemo(() => {
    if (!selectedPerson?.employees) return [];
    return selectedPerson.employees.slice(1).map((emp) => {
      const empSalaries = pastPeriodSalaries.filter((s) => s.employee_id === emp.id);
      const empTotal = empSalaries.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
      const accrued = calculateSalary(emp, emp.broiler_batches || {});
      return {
        employee: emp, salaries: empSalaries, total: empTotal, accrued,
        periodLabel: `${new Date(emp.start_date).toLocaleDateString('ru-RU')} — ${emp.end_date ? new Date(emp.end_date).toLocaleDateString('ru-RU') : 'По н.в.'}`,
      };
    }).filter((g) => g.salaries.length > 0 || g.accrued.salary > 0);
  }, [selectedPerson, pastPeriodSalaries]);

  async function addPayment() {
    if (!selectedPerson) return;
    if (!(Number(paymentAmount) > 0)) { window.alert('Сумма должна быть больше нуля'); return; }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
      const { error } = await supabase.from('salaries').insert([{
        employee_id: recentEmployment?.id || null, amount: Number(paymentAmount), payment_type: paymentType,
        payment_date: paymentDate, batch_id: recentEmployment?.batch_id || null, user_id: user.id,
      }]);
      if (error) { window.alert('Ошибка: ' + error.message); return; }
      setPaymentAmount('');
      await loadSalaries();
    } finally {
      setSaving(false);
    }
  }

  function startEditPayment(p) {
    setEditingPaymentId(p.id); setEditDate(p.payment_date); setEditAmount(String(p.amount)); setEditType(p.payment_type);
  }

  async function saveEditPayment() {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
      const { error } = await supabase.from('salaries').update({ payment_date: editDate, amount: Number(editAmount), payment_type: editType }).eq('id', editingPaymentId);
      if (error) { window.alert('Ошибка: ' + error.message); return; }
      setEditingPaymentId(null);
      await loadSalaries();
    } finally {
      setSaving(false);
    }
  }

  async function deletePayment(paymentId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
    const { error } = await supabase.from('salaries').delete().eq('id', paymentId);
    if (error) { window.alert('Ошибка: ' + error.message); return; }
    await loadSalaries();
  }

  const isEmployeeFired = !recentEmployment || recentEmployment.is_active === false || !!recentEmployment.end_date;
  const remainingToPay = Math.max(currentAccruedData.salary - currentTotals.totalAll, 0);
  const isSheetOpen = !!selectedPerson && !isEmployeeFired;
  const closeSheet = () => setSelectedPerson(null);

  function renderPaymentRow(p, allowEdit) {
    const isEditing = editingPaymentId === p.id;
    return (
      <div key={p.id} className="flex items-center justify-between gap-2 py-2" style={{ borderBottom: '1px solid var(--tg-secondary-bg)' }}>
        {isEditing ? (
          <div className="flex flex-col gap-2 flex-1">
            <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className={fieldClass} style={{ minHeight: 40 }} />
            <div className="flex gap-2">
              <input type="number" step="0.01" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} className={fieldClass} style={{ minHeight: 40, flex: 1 }} />
              <select value={editType} onChange={(e) => setEditType(e.target.value)} className={fieldClass} style={{ minHeight: 40, flex: 1 }}>
                <option value="аванс">аванс</option>
                <option value="зарплата">зарплата</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={saveEditPayment} disabled={saving} className="flex-1 rounded-lg px-3 py-2 text-xs font-semibold text-white" style={{ minHeight: 36, background: '#28a745' }}>Сохранить</button>
              <button type="button" onClick={() => setEditingPaymentId(null)} className="flex-1 rounded-lg px-3 py-2 text-xs bg-tg-secondary" style={{ minHeight: 36 }}>Отмена</button>
            </div>
          </div>
        ) : (
          <>
            <div className="min-w-0">
              <p className="text-sm">{new Date(p.payment_date).toLocaleDateString('ru-RU')} · <span className="capitalize">{p.payment_type}</span></p>
              <p className="text-xs text-tg-hint">{p.batch_name || 'Без партии'}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-sm font-semibold">{formatCurrency(p.amount)}</span>
              {allowEdit && (
                <>
                  <button type="button" onClick={() => startEditPayment(p)} className="text-xs px-2 py-2" style={{ color: 'var(--tg-link, #4f46e5)' }}>✏️</button>
                  <button type="button" onClick={() => setConfirmDeletePaymentId(p.id)} className="text-xs px-2 py-2 text-tg-destructive">🗑</button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-tg-hint px-1">Выберите сотрудника, чтобы записать аванс или выплатить зарплату</p>

      {activePersons.length === 0 ? (
        <EmptyState icon="👤" title="Нет работающих сотрудников" />
      ) : (
        activePersons.map((p) => {
          const emp = p.employees?.[0];
          const batch = emp?.broiler_batches;
          return (
            <Card key={p.id} onClick={() => setSelectedPerson(p)}>
              <p className="font-semibold truncate">{p.full_name}</p>
              {emp?.position && <p className="text-xs text-tg-hint">{emp.position}</p>}
              <div
                className="mt-2 inline-flex items-center gap-1.5 text-xs rounded-full px-2 py-0.5 font-medium"
                style={{ background: 'color-mix(in srgb, #28a745 15%, transparent)', color: '#28a745' }}
              >
                <span>🟢 Работает</span>
                {emp?.start_date && <span className="opacity-75">c {new Date(emp.start_date).toLocaleDateString('ru-RU')}</span>}
              </div>
              {batch && (
                <span
                  className="inline-block mt-1.5 ml-2 text-xs rounded-full px-2 py-0.5"
                  style={{
                    background: batch.is_active ? 'color-mix(in srgb, var(--tg-link, #4f46e5) 15%, transparent)' : 'var(--tg-secondary-bg)',
                    color: batch.is_active ? 'var(--tg-link, #4f46e5)' : 'var(--tg-hint)',
                  }}
                >
                  {batch.batch_name}{!batch.is_active && ' (архив)'}
                </span>
              )}
            </Card>
          );
        })
      )}

      <BottomSheet open={isSheetOpen} onClose={closeSheet} title={selectedPerson?.full_name}>
        {selectedPerson && (
          <div className="flex flex-col gap-3">
            <Card style={{ background: 'color-mix(in srgb, var(--tg-link, #4f46e5) 8%, var(--tg-section-bg))' }}>
              <p className="text-sm font-bold" style={{ color: 'var(--tg-link, #4f46e5)' }}>Начисление за текущий период</p>
              {recentEmployment && (
                <p className="text-xs text-tg-hint mt-1">
                  {new Date(recentEmployment.start_date).toLocaleDateString('ru-RU')} — {recentEmployment.end_date ? new Date(recentEmployment.end_date).toLocaleDateString('ru-RU') : 'По настоящее время'}
                  {recentEmployment.broiler_batches && ` · ${recentEmployment.broiler_batches.batch_name}`}
                </p>
              )}
              <div className="grid grid-cols-2 gap-2 mt-3">
                <div><p className="text-xs text-tg-hint">Отработано дней</p><p className="font-bold">{currentAccruedData.effectiveDays} дн.</p></div>
                <div><p className="text-xs text-tg-hint">Начислено</p><p className="font-bold" style={{ color: 'var(--tg-link, #4f46e5)' }}>{formatCurrency(currentAccruedData.salary)}</p></div>
                <div><p className="text-xs text-tg-hint">Выплачено</p><p className="font-bold" style={{ color: '#28a745' }}>{formatCurrency(currentTotals.totalAll)}</p></div>
                <div><p className="text-xs text-tg-hint">Остаток</p><p className="font-bold" style={{ color: remainingToPay > 0 ? '#dc3545' : 'var(--tg-text)' }}>{formatCurrency(remainingToPay)}</p></div>
              </div>
              {currentAccruedData.breakdown && currentAccruedData.breakdown.length > 0 && (
                <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--tg-secondary-bg)' }}>
                  <p className="text-xs font-semibold text-tg-hint mb-1">Детализация расчёта:</p>
                  {currentAccruedData.breakdown.map((item, idx) => (
                    <p key={idx} className="text-xs text-tg-hint">• {item.label} = <strong>{formatCurrency(item.sum)}</strong></p>
                  ))}
                </div>
              )}
            </Card>

            <div className="grid grid-cols-2 gap-2">
              <Card><p className="text-xs text-tg-hint">Авансы</p><p className="font-bold">{formatCurrency(currentTotals.totalAdvance)}</p></Card>
              <Card><p className="text-xs text-tg-hint">Зарплаты</p><p className="font-bold">{formatCurrency(currentTotals.totalSalary)}</p></Card>
              {Object.entries(currentTotals.byBatch).map(([batchId, info]) => (
                <Card key={batchId}><p className="text-xs text-tg-hint">{info.name}{info.isActive ? '' : ' (архив)'}</p><p className="font-bold">{formatCurrency(info.total)}</p></Card>
              ))}
            </div>

            <Card>
              <p className="text-sm font-semibold mb-2">Выплатить</p>
              <div className="flex flex-col gap-2">
                <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className={fieldClass} style={{ minHeight: 44 }} />
                <input type="number" step="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} placeholder="0.00" className={fieldClass} style={{ minHeight: 44 }} />
                <select value={paymentType} onChange={(e) => setPaymentType(e.target.value)} className={fieldClass} style={{ minHeight: 44 }}>
                  <option value="аванс">Аванс</option>
                  <option value="зарплата">Зарплата (остаток)</option>
                </select>
                <button type="button" onClick={addPayment} disabled={saving} className="rounded-xl px-4 py-3 text-base font-semibold bg-tg-button text-tg-button-text disabled:opacity-60" style={{ minHeight: 48 }}>
                  {saving ? 'Добавление…' : '+ Выплатить'}
                </button>
              </div>
            </Card>

            <Card>
              <p className="text-sm font-semibold mb-2">Выплаты текущего периода</p>
              {currentPeriodSalaries.length === 0 ? <p className="text-sm text-tg-hint">Нет выплат</p> : currentPeriodSalaries.map((p) => renderPaymentRow(p, true))}
            </Card>

            {pastPeriodGroups.length > 0 && (
              <Card onClick={() => setShowPastPeriods((v) => !v)}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">📂 Выплаты прошлых периодов ({pastPeriodSalaries.length} · {formatCurrency(pastTotals)})</p>
                  <span className="text-tg-hint">{showPastPeriods ? '▲' : '▼'}</span>
                </div>
                {showPastPeriods && (
                  <div className="mt-3 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
                    {pastPeriodGroups.map((group) => (
                      <div key={group.employee.id} className="rounded-xl bg-tg-secondary p-3">
                        <p className="text-xs font-semibold">{group.periodLabel}</p>
                        <p className="text-xs text-tg-hint">{group.employee.position || 'Должность не указана'}{group.employee.broiler_batches ? ` · ${group.employee.broiler_batches.batch_name}` : ''}</p>
                        <p className="text-xs text-tg-hint mt-1">Начислено: <strong style={{ color: 'var(--tg-link, #4f46e5)' }}>{formatCurrency(group.accrued.salary)}</strong> · Выплачено: <strong style={{ color: '#28a745' }}>{formatCurrency(group.total)}</strong></p>
                        <div className="mt-2">
                          {group.salaries.length === 0 ? <p className="text-xs text-tg-hint">Нет выплат</p> : group.salaries.map((p) => renderPaymentRow(p, true))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}
          </div>
        )}
      </BottomSheet>

      <ConfirmSheet
        open={!!confirmDeletePaymentId}
        title="Удалить выплату?"
        onConfirm={() => deletePayment(confirmDeletePaymentId)}
        onClose={() => setConfirmDeletePaymentId(null)}
      />
    </div>
  );
}
