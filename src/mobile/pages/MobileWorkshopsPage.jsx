// src/mobile/pages/MobileWorkshopsPage.jsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkshops } from '../../hooks/useBatchData';
import { supabase } from '../../supabaseClient';
import { getNormForDay } from '../../constants/broilerStandards';
import Card from '../components/Card';
import ListRow from '../components/ListRow';
import BottomSheet from '../components/BottomSheet';
import ConfirmSheet from '../components/ConfirmSheet';
import FormField from '../components/FormField';
import NumberStepper from '../components/NumberStepper';
import EmptyState from '../components/EmptyState';
import Spinner from '../components/Spinner';

export default function MobileWorkshopsPage() {
  const { workshops, loading, createWorkshop, updateWorkshop, deleteWorkshop } = useWorkshops();
  const navigate = useNavigate();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState('');
  const [capacity, setCapacity] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [summary, setSummary] = useState({});

  useEffect(() => {
    (async () => {
      const data = {};
      for (const w of workshops) {
        const active = w.batches?.find((b) => b.is_active);
        if (!active) continue;
        const { data: lastLog } = await supabase
          .from('daily_logs')
          .select('age, mortality, weight, daily_feed')
          .eq('batch_id', active.id)
          .order('age', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (lastLog) data[w.id] = { ...lastLog, norm: getNormForDay(lastLog.age) };
      }
      setSummary(data);
    })();
  }, [workshops]);

  function openCreate() {
    setEditing(null); setName(''); setCapacity(''); setDescription(''); setFormOpen(true);
  }
  function openEdit(w) {
    setEditing(w); setName(w.name); setCapacity(w.capacity ? String(w.capacity) : ''); setDescription(w.description || ''); setFormOpen(true);
  }

  async function save() {
    if (!name.trim()) { window.alert('Укажите название цеха'); return; }
    setSaving(true);
    try {
      const payload = { name: name.trim(), capacity, description };
      const { error } = editing ? await updateWorkshop(editing.id, payload) : await createWorkshop(payload);
      if (error) window.alert('Ошибка: ' + error.message);
      else setFormOpen(false);
    } catch (e) {
      window.alert('Ошибка: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    const { error } = await deleteWorkshop(confirmDeleteId);
    if (error) window.alert('Ошибка: ' + error.message);
    setConfirmDeleteId(null);
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  return (
    <div className="flex flex-col gap-3 py-3">
      <button
        type="button"
        onClick={openCreate}
        className="w-full rounded-xl px-4 py-3 text-base font-semibold bg-tg-button text-tg-button-text"
        style={{ minHeight: 48 }}
      >
        + Добавить цех
      </button>

      {workshops.length === 0 ? (
        <EmptyState icon="🏭" title="Цеха ещё не добавлены" hint="Нажмите «+ Добавить цех», чтобы создать первый" />
      ) : (
        workshops.map((w) => {
          const active = w.batches?.find((b) => b.is_active);
          const sd = summary[w.id];
          return (
            <Card key={w.id} onClick={() => navigate(`/workshops/${w.id}`)}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-base font-semibold truncate">🏠 {w.name}</p>
                  {w.capacity ? <p className="text-xs text-tg-hint">Вместимость: {w.capacity.toLocaleString('ru-RU')} гол.</p> : null}
                  {w.description ? <p className="text-xs text-tg-hint italic truncate">{w.description}</p> : null}
                </div>
                <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <button type="button" onClick={() => openEdit(w)} className="w-9 h-9 rounded-lg bg-tg-secondary">✏️</button>
                  <button type="button" onClick={() => setConfirmDeleteId(w.id)} className="w-9 h-9 rounded-lg bg-tg-secondary text-tg-destructive">🗑</button>
                </div>
              </div>
              {!active ? (
                <p className="text-sm text-tg-hint mt-2">Нет активной партии</p>
              ) : (
                <div className="mt-2">
                  <ListRow label={active.batch_name} value={`${active.initial_quantity?.toLocaleString('ru-RU')} гол.`} />
                  {sd && (
                    <>
                      <ListRow label="День выращивания" value={sd.age} />
                      <ListRow label="Падёж (посл. запись)" value={sd.mortality} />
                      {sd.weight && sd.norm && <ListRow label="Масса" value={`${sd.weight} г (норма ${sd.norm.weight})`} />}
                      {sd.daily_feed && sd.norm && <ListRow label="Корм" value={`${sd.daily_feed} мешк. (норма ${sd.norm.dailyFeed} г/гол)`} />}
                    </>
                  )}
                </div>
              )}
            </Card>
          );
        })
      )}

      <BottomSheet open={formOpen} onClose={() => setFormOpen(false)} title={editing ? 'Редактировать цех' : 'Новый цех'}>
        <div className="flex flex-col gap-3">
          <FormField label="Название цеха *">
            <input
              value={name} onChange={(e) => setName(e.target.value)} placeholder="Цех №1"
              className="w-full rounded-xl px-3 bg-tg-secondary text-tg-text" style={{ minHeight: 48 }}
            />
          </FormField>
          <FormField label="Вместимость (голов)">
            <NumberStepper value={capacity} onChange={setCapacity} step={1000} suffix="гол." />
          </FormField>
          <FormField label="Описание">
            <input
              value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Основной цех, утеплённый..."
              className="w-full rounded-xl px-3 bg-tg-secondary text-tg-text" style={{ minHeight: 48 }}
            />
          </FormField>
          <button
            type="button" onClick={save} disabled={saving}
            className="rounded-xl px-4 py-3 text-base font-semibold bg-tg-button text-tg-button-text disabled:opacity-60"
            style={{ minHeight: 48 }}
          >
            {saving ? 'Сохранение…' : editing ? 'Сохранить' : 'Создать цех'}
          </button>
        </div>
      </BottomSheet>

      <ConfirmSheet
        open={!!confirmDeleteId}
        title="Удалить цех?"
        message="Цех будет деактивирован, данные сохранятся."
        onConfirm={confirmDelete}
        onClose={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
