// src/mobile/pages/MobileTasksPage.jsx
import { useMemo, useState } from 'react';
import { useTasks, useEmployees } from '../../hooks/useTasks';
import { useWorkshops } from '../../hooks/useBatchData';
import Card from '../components/Card';
import BottomSheet from '../components/BottomSheet';
import ConfirmSheet from '../components/ConfirmSheet';
import FormField from '../components/FormField';
import EmptyState from '../components/EmptyState';
import Spinner from '../components/Spinner';
import { useTelegramMainButton } from '../telegram/useTelegramMainButton';

const PRIORITY_LABEL = { low: 'Низкий', medium: 'Средний', high: 'Высокий', urgent: '🚨 Срочный' };
const PRIORITY_COLOR = { low: '#6c757d', medium: '#4f46e5', high: '#fd7e14', urgent: '#dc3545' };
const STATUS_LABEL = { open: 'Открыта', in_progress: 'В работе', done: 'Выполнена', cancelled: 'Отменена' };
const STATUS_NEXT = { open: 'in_progress', in_progress: 'done', done: 'open' };
const STATUS_BTN = { open: '▶ В работу', in_progress: '✅ Выполнено', done: '↩ Открыть снова' };
const EMPTY_FORM = { title: '', description: '', assignee_id: '', workshop_id: '', priority: 'medium', due_date: '', created_by: '' };
const fieldClass = 'w-full rounded-xl px-3 bg-tg-secondary text-tg-text';

export default function MobileTasksPage() {
  const [filters, setFilters] = useState({ status: '', assigneeId: '', workshopId: '', priority: '' });
  const { tasks, loading, createTask, updateTask, deleteTask } = useTasks({
    status: filters.status || undefined,
    assigneeId: filters.assigneeId || undefined,
    workshopId: filters.workshopId || undefined,
    priority: filters.priority || undefined,
  });
  const { employees } = useEmployees();
  const { workshops } = useWorkshops();

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const counts = useMemo(
    () => tasks.reduce((acc, t) => { acc[t.status] = (acc[t.status] || 0) + 1; return acc; }, {}),
    [tasks],
  );
  const overdueCount = useMemo(
    () => tasks.filter((t) => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'done').length,
    [tasks],
  );
  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  function openCreate() { setEditingId(null); setForm(EMPTY_FORM); setFormOpen(true); }
  function openEdit(t) {
    setEditingId(t.id);
    setForm({
      title: t.title, description: t.description || '', assignee_id: t.assignee_id || '',
      workshop_id: t.workshop_id || '', priority: t.priority, due_date: t.due_date || '', created_by: t.created_by || '',
    });
    setFormOpen(true);
  }

  async function save() {
    if (!form.title.trim()) { window.alert('Укажите название задачи'); return; }
    if (!form.assignee_id) { window.alert('Выберите исполнителя'); return; }
    setSaving(true);
    const payload = { ...form, workshop_id: form.workshop_id || null, due_date: form.due_date || null };
    const { error } = editingId ? await updateTask(editingId, payload) : await createTask(payload);
    setSaving(false);
    if (error) window.alert('Ошибка: ' + error.message);
    else setFormOpen(false);
  }

  useTelegramMainButton({
    text: saving ? 'Сохраняем…' : editingId ? 'Сохранить' : 'Создать задачу',
    onClick: save,
    visible: formOpen,
    loading: saving,
  });

  async function confirmDelete() {
    const { error } = await deleteTask(confirmDeleteId);
    if (error) window.alert('Ошибка: ' + error.message);
    setConfirmDeleteId(null);
  }

  return (
    <div className="flex flex-col gap-3 py-3">
      <div className="flex gap-2">
        <button
          type="button" onClick={openCreate}
          className="flex-1 rounded-xl px-4 py-3 text-sm font-semibold bg-tg-button text-tg-button-text"
          style={{ minHeight: 44 }}
        >
          + Задача
        </button>
        <button
          type="button" onClick={() => setFiltersOpen(true)}
          className="flex-1 rounded-xl px-4 py-3 text-sm font-semibold bg-tg-secondary text-tg-text"
          style={{ minHeight: 44 }}
        >
          Фильтры{activeFilterCount ? ` (${activeFilterCount})` : ''}
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto">
        {[
          { label: 'Открытые', value: counts.open || 0, color: '#4f46e5' },
          { label: 'В работе', value: counts.in_progress || 0, color: '#fd7e14' },
          { label: 'Выполнены', value: counts.done || 0, color: '#28a745' },
          { label: 'Просрочены', value: overdueCount, color: '#dc3545' },
        ].map((s) => (
          <div
            key={s.label}
            className="flex-shrink-0 rounded-xl px-3 py-2 text-center"
            style={{ background: `color-mix(in srgb, ${s.color} 12%, transparent)`, border: `1px solid ${s.color}30`, minWidth: 84 }}
          >
            <div className="text-xl font-bold" style={{ color: s.color }}>{s.value}</div>
            <div className="text-xs text-tg-hint">{s.label}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : tasks.length === 0 ? (
        <EmptyState icon="✅" title="Задач нет" hint="Создайте первую" />
      ) : (
        tasks.map((task) => {
          const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done';
          return (
            <Card
              key={task.id}
              style={{ borderLeft: `4px solid ${PRIORITY_COLOR[task.priority] || 'var(--tg-secondary-bg)'}` }}
              className={isOverdue ? 'border border-tg-destructive' : ''}
            >
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span
                  className="text-xs font-bold rounded px-1.5 py-0.5"
                  style={{ color: PRIORITY_COLOR[task.priority], background: `${PRIORITY_COLOR[task.priority]}20` }}
                >
                  {PRIORITY_LABEL[task.priority]}
                </span>
                <span className="text-xs text-tg-hint">{STATUS_LABEL[task.status]}</span>
                {isOverdue && <span className="text-xs font-bold text-tg-destructive">⚠️ Просрочена</span>}
              </div>
              <p
                className="text-base font-medium"
                style={{
                  textDecoration: task.status === 'done' ? 'line-through' : 'none',
                  color: task.status === 'done' ? 'var(--tg-hint)' : 'var(--tg-text)',
                }}
              >
                {task.title}
              </p>
              {task.description && <p className="text-sm text-tg-hint mt-0.5">{task.description}</p>}
              <div className="flex flex-col gap-0.5 mt-1.5 text-xs text-tg-hint">
                {task.assignee && <span>👤 {task.assignee.full_name}{task.assignee.position ? ` · ${task.assignee.position}` : ''}</span>}
                {task.workshop && <span>🏠 {task.workshop.name}</span>}
                {task.due_date && (
                  <span style={{ color: isOverdue ? 'var(--tg-destructive)' : undefined }}>📅 Срок: {task.due_date}</span>
                )}
                {task.completed_at && (
                  <span style={{ color: '#28a745' }}>✅ Выполнено: {new Date(task.completed_at).toLocaleDateString('ru-RU')}</span>
                )}
                {task.created_by && <span>Создал: {task.created_by}</span>}
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => updateTask(task.id, { status: STATUS_NEXT[task.status] || 'open' })}
                  className="flex-1 rounded-lg px-3 py-2 text-xs font-semibold text-white"
                  style={{ background: task.status === 'done' ? '#6c757d' : '#28a745', minHeight: 36 }}
                >
                  {STATUS_BTN[task.status] || '↩ Открыть'}
                </button>
                <button type="button" onClick={() => openEdit(task)} className="rounded-lg px-3 py-2 text-xs bg-tg-secondary" style={{ minHeight: 36 }}>✏️</button>
                <button type="button" onClick={() => setConfirmDeleteId(task.id)} className="rounded-lg px-3 py-2 text-xs text-tg-destructive bg-tg-secondary" style={{ minHeight: 36 }}>🗑</button>
              </div>
            </Card>
          );
        })
      )}

      <BottomSheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Фильтры">
        <div className="flex flex-col gap-3">
          <FormField label="Статус">
            <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }}>
              <option value="">Все статусы</option>
              {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </FormField>
          <FormField label="Приоритет">
            <select value={filters.priority} onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }}>
              <option value="">Все приоритеты</option>
              {Object.entries(PRIORITY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </FormField>
          <FormField label="Исполнитель">
            <select value={filters.assigneeId} onChange={(e) => setFilters((f) => ({ ...f, assigneeId: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }}>
              <option value="">Все исполнители</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
            </select>
          </FormField>
          <FormField label="Цех">
            <select value={filters.workshopId} onChange={(e) => setFilters((f) => ({ ...f, workshopId: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }}>
              <option value="">Все цеха</option>
              {workshops.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </FormField>
          <button
            type="button"
            onClick={() => setFilters({ status: '', assigneeId: '', workshopId: '', priority: '' })}
            className="rounded-xl px-4 py-2 text-sm bg-tg-secondary text-tg-text"
            style={{ minHeight: 44 }}
          >
            Сбросить
          </button>
        </div>
      </BottomSheet>

      <BottomSheet open={formOpen} onClose={() => setFormOpen(false)} title={editingId ? 'Редактировать задачу' : 'Новая задача'}>
        <div className="flex flex-col gap-3">
          <FormField label="Название задачи *">
            <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Что нужно сделать?" className={fieldClass} style={{ minHeight: 48 }} />
          </FormField>
          <FormField label="Описание">
            <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className={fieldClass} style={{ minHeight: 80 }} />
          </FormField>
          <FormField label="Исполнитель *">
            <select value={form.assignee_id} onChange={(e) => setForm((f) => ({ ...f, assignee_id: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }}>
              <option value="">— Выберите —</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}{e.position ? ` (${e.position})` : ''}</option>)}
            </select>
          </FormField>
          <FormField label="Приоритет">
            <select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }}>
              {Object.entries(PRIORITY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </FormField>
          <FormField label="Цех (опционально)">
            <select value={form.workshop_id} onChange={(e) => setForm((f) => ({ ...f, workshop_id: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }}>
              <option value="">— Не привязывать —</option>
              {workshops.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </FormField>
          <FormField label="Срок выполнения">
            <input type="date" value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }} />
          </FormField>
          <FormField label="Создал (ваше имя)">
            <input value={form.created_by} onChange={(e) => setForm((f) => ({ ...f, created_by: e.target.value }))} placeholder="Иванов И.И." className={fieldClass} style={{ minHeight: 44 }} />
          </FormField>
        </div>
      </BottomSheet>

      <ConfirmSheet open={!!confirmDeleteId} title="Удалить задачу?" onConfirm={confirmDelete} onClose={() => setConfirmDeleteId(null)} />
    </div>
  );
}
