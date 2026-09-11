// src/mobile/pages/MobileExpensesPage.jsx
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabaseClient';
import Card from '../components/Card';
import BottomSheet from '../components/BottomSheet';
import ConfirmSheet from '../components/ConfirmSheet';
import FormField from '../components/FormField';
import SegmentedControl from '../components/SegmentedControl';
import EmptyState from '../components/EmptyState';
import Spinner from '../components/Spinner';
import { useTelegramMainButton } from '../telegram/useTelegramMainButton';

const fieldClass = 'w-full rounded-xl px-3 bg-tg-secondary text-tg-text';
const formatCurrency = (v) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'TJS' }).format(v || 0);
const EMPTY_FORM = { expense_date: new Date().toISOString().slice(0, 10), description: '', amount: '', category: '', batch_id: '' };

function firstDayOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function lastDayOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
}

export default function MobileExpensesPage() {
  const [allExpenses, setAllExpenses] = useState([]);
  const [activeBatches, setActiveBatches] = useState([]);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState('work');
  const [showArchived, setShowArchived] = useState(false);

  const [reportOpen, setReportOpen] = useState(false);
  const [startDate, setStartDate] = useState(firstDayOfMonth());
  const [endDate, setEndDate] = useState(lastDayOfMonth());

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  async function fetchData() {
    setLoading(true);
    const [expensesRes, batchesRes] = await Promise.all([
      supabase.rpc('get_expenses'),
      supabase.from('broiler_batches').select('id, batch_name').eq('is_active', true).or('is_summary.eq.false,is_summary.is.null'),
    ]);
    if (expensesRes.error) window.alert('Ошибка: ' + expensesRes.error.message);
    else setAllExpenses(expensesRes.data || []);
    if (batchesRes.error) window.alert('Ошибка: ' + batchesRes.error.message);
    else setActiveBatches(batchesRes.data || []);
    setLoading(false);
  }

  useEffect(() => { fetchData(); }, []);

  const filteredExpenses = useMemo(() => {
    return allExpenses.filter((exp) => {
      if (exp.expense_scope !== activeTab) return false;
      if (showArchived) return true;
      return !exp.batch_id || exp.batch_is_active === true;
    });
  }, [allExpenses, activeTab, showArchived]);

  const reportTotal = useMemo(() => {
    if (!startDate || !endDate) return 0;
    return filteredExpenses
      .filter((exp) => exp.expense_date >= startDate && exp.expense_date <= endDate)
      .reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0);
  }, [filteredExpenses, startDate, endDate]);

  function openCreate() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, expense_date: new Date().toISOString().slice(0, 10) });
    setFormOpen(true);
  }
  function openEdit(exp) {
    setEditingId(exp.id);
    setForm({
      expense_date: exp.expense_date,
      description: exp.description || '',
      amount: String(exp.amount ?? ''),
      category: exp.category || '',
      batch_id: exp.batch_id || '',
    });
    setFormOpen(true);
  }

  async function save() {
    if (!form.description.trim()) { window.alert('Укажите описание расхода'); return; }
    if (!(Number(form.amount) > 0)) { window.alert('Сумма должна быть больше нуля'); return; }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
      const payload = {
        expense_date: form.expense_date,
        description: form.description.trim(),
        amount: Number(form.amount),
        category: form.category.trim(),
        batch_id: form.batch_id || null,
      };
      let error;
      if (editingId) {
        ({ error } = await supabase.from('expenses').update(payload).eq('id', editingId));
      } else {
        ({ error } = await supabase.from('expenses').insert([{ ...payload, expense_scope: activeTab, user_id: user.id }]));
      }
      if (error) window.alert('Ошибка: ' + error.message);
      else { setFormOpen(false); await fetchData(); }
    } catch (e) {
      window.alert('Ошибка: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  useTelegramMainButton({
    text: saving ? 'Сохраняем…' : editingId ? 'Сохранить' : 'Добавить расход',
    onClick: save,
    visible: formOpen,
    loading: saving,
  });

  async function confirmDelete() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
    const { error } = await supabase.from('expenses').delete().eq('id', confirmDeleteId);
    if (error) window.alert('Ошибка: ' + error.message);
    setConfirmDeleteId(null);
    await fetchData();
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  return (
    <div className="flex flex-col gap-3 py-3">
      <SegmentedControl
        options={[{ value: 'work', label: 'Рабочие' }, { value: 'personal', label: 'Домашние' }]}
        value={activeTab}
        onChange={setActiveTab}
      />

      <button
        type="button" onClick={openCreate}
        className="w-full rounded-xl px-4 py-3 text-base font-semibold bg-tg-button text-tg-button-text"
        style={{ minHeight: 48 }}
      >
        + Добавить расход
      </button>

      <label className="flex items-center gap-2 text-sm text-tg-hint select-none">
        <input type="checkbox" checked={showArchived} onChange={() => setShowArchived((v) => !v)} />
        Показать расходы архивных партий
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
            <p className="text-sm">Итого: <strong className="text-base">{formatCurrency(reportTotal)}</strong></p>
          </div>
        )}
      </Card>

      {filteredExpenses.length === 0 ? (
        <EmptyState icon="💸" title="Расходов пока нет" hint="Нажмите «+ Добавить расход»" />
      ) : (
        filteredExpenses.map((exp) => (
          <Card key={exp.id}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-base font-medium truncate">{exp.description}</p>
                <p className="text-xs text-tg-hint">
                  {new Date(exp.expense_date).toLocaleDateString('ru-RU')}
                  {exp.category ? ` · ${exp.category}` : ''}
                </p>
                {exp.batch_name && (
                  <span
                    className="inline-block mt-1 text-xs rounded-full px-2 py-0.5"
                    style={{
                      background: exp.batch_is_active ? 'color-mix(in srgb, var(--tg-link, #4f46e5) 15%, transparent)' : 'var(--tg-secondary-bg)',
                      color: exp.batch_is_active ? 'var(--tg-link, #4f46e5)' : 'var(--tg-hint)',
                    }}
                  >
                    {exp.batch_name}
                  </span>
                )}
              </div>
              <p className="text-base font-semibold shrink-0">{formatCurrency(exp.amount)}</p>
            </div>
            <div className="flex gap-2 mt-2">
              <button type="button" onClick={() => openEdit(exp)} className="flex-1 rounded-lg px-3 py-2 text-xs bg-tg-secondary" style={{ minHeight: 36 }}>✏️ Изменить</button>
              <button type="button" onClick={() => setConfirmDeleteId(exp.id)} className="flex-1 rounded-lg px-3 py-2 text-xs text-tg-destructive bg-tg-secondary" style={{ minHeight: 36 }}>🗑 Удалить</button>
            </div>
          </Card>
        ))
      )}

      <BottomSheet open={formOpen} onClose={() => setFormOpen(false)} title={editingId ? 'Редактировать расход' : 'Новый расход'}>
        <div className="flex flex-col gap-3">
          <FormField label="Дата">
            <input type="date" value={form.expense_date} onChange={(e) => setForm((f) => ({ ...f, expense_date: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }} />
          </FormField>
          <FormField label="Описание *">
            <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Например: ремонт вентилятора" className={fieldClass} style={{ minHeight: 48 }} />
          </FormField>
          <FormField label="Сумма *">
            <input type="number" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="0.00" className={fieldClass} style={{ minHeight: 48 }} />
          </FormField>
          <FormField label="Категория">
            <input value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} placeholder="Например: ремонт, корм" className={fieldClass} style={{ minHeight: 44 }} />
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
            {saving ? 'Сохраняем…' : editingId ? 'Сохранить' : 'Добавить расход'}
          </button>
        </div>
      </BottomSheet>

      <ConfirmSheet
        open={!!confirmDeleteId}
        title="Удалить расход?"
        onConfirm={confirmDelete}
        onClose={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
