// src/mobile/pages/MobileFeedPage.jsx
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

const KG_PER_BAG = 40;
const fieldClass = 'w-full rounded-xl px-3 bg-tg-secondary text-tg-text';
const formatCurrency = (v) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'TJS' }).format(v || 0);
const EMPTY_FORM = { delivery_date: new Date().toISOString().slice(0, 10), feed_type: 'старт', bags: '', batch_id: '', price_per_kg: '', transaction_type: 'purchase', company: '' };

export default function MobileFeedPage() {
  const [allDeliveries, setAllDeliveries] = useState([]);
  const [activeBatches, setActiveBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  async function fetchData() {
    setLoading(true);
    const [deliveriesRes, batchesRes] = await Promise.all([
      supabase.rpc('get_feed_deliveries'),
      supabase.from('broiler_batches').select('id, batch_name').eq('is_active', true).or('is_summary.eq.false,is_summary.is.null'),
    ]);
    if (deliveriesRes.error) window.alert('Ошибка: ' + deliveriesRes.error.message);
    else setAllDeliveries(deliveriesRes.data || []);
    if (batchesRes.error) window.alert('Ошибка: ' + batchesRes.error.message);
    else setActiveBatches(batchesRes.data || []);
    setLoading(false);
  }

  useEffect(() => { fetchData(); }, []);

  const filteredDeliveries = useMemo(() => {
    return allDeliveries.filter((d) => {
      if (showArchived) return true;
      return !d.batch_id || d.batch_is_active === true;
    });
  }, [allDeliveries, showArchived]);

  const totals = useMemo(() => {
    const kg = filteredDeliveries.reduce((acc, d) => {
      if (d.feed_type === 'старт') acc.start += d.quantity_kg;
      else if (d.feed_type === 'рост') acc.growth += d.quantity_kg;
      else if (d.feed_type === 'финиш') acc.finish += d.quantity_kg;
      return acc;
    }, { start: 0, growth: 0, finish: 0 });
    const totalKg = kg.start + kg.growth + kg.finish;
    const totalCost = filteredDeliveries.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
    return { kg, totalKg, totalCost };
  }, [filteredDeliveries]);

  function openCreate() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, delivery_date: new Date().toISOString().slice(0, 10) });
    setFormOpen(true);
  }
  function openEdit(d) {
    setEditingId(d.id);
    setForm({
      delivery_date: d.delivery_date, feed_type: d.feed_type,
      bags: String(d.quantity_kg / KG_PER_BAG), batch_id: d.batch_id || '',
      price_per_kg: d.price_per_kg != null ? String(d.price_per_kg) : '',
      transaction_type: d.transaction_type || 'purchase', company: d.company || '',
    });
    setFormOpen(true);
  }

  async function save() {
    const bagsNum = Number(form.bags);
    if (!(bagsNum > 0)) { window.alert('Количество мешков должно быть больше нуля'); return; }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
      const quantityKg = bagsNum * KG_PER_BAG;
      const priceNum = Number(form.price_per_kg);
      const payload = {
        delivery_date: form.delivery_date, feed_type: form.feed_type, quantity_kg: quantityKg,
        batch_id: form.batch_id || null,
        price_per_kg: priceNum || null,
        amount: priceNum > 0 ? quantityKg * priceNum : null,
        transaction_type: priceNum > 0 ? form.transaction_type : null,
      };
      let error;
      if (editingId) {
        ({ error } = await supabase.from('feed_deliveries').update(payload).eq('id', editingId));
      } else {
        ({ error } = await supabase.from('feed_deliveries').insert([{ ...payload, user_id: user.id, company: form.company || null }]));
      }
      if (error) window.alert('Ошибка: ' + error.message);
      else { setFormOpen(false); await fetchData(); }
    } finally {
      setSaving(false);
    }
  }

  useTelegramMainButton({
    text: saving ? 'Сохраняем…' : editingId ? 'Сохранить' : 'Добавить приход',
    onClick: save,
    visible: formOpen,
    loading: saving,
  });

  async function confirmDelete() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
    const { error } = await supabase.from('feed_deliveries').delete().eq('id', confirmDeleteId);
    if (error) window.alert('Ошибка: ' + error.message);
    setConfirmDeleteId(null);
    await fetchData();
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  return (
    <div className="flex flex-col gap-3 py-3">
      <StatGrid items={[
        { label: 'Старт', value: `${(totals.kg.start / KG_PER_BAG).toFixed(1)} меш.`, hint: `${totals.kg.start} кг`, color: '#007bff' },
        { label: 'Рост', value: `${(totals.kg.growth / KG_PER_BAG).toFixed(1)} меш.`, hint: `${totals.kg.growth} кг`, color: '#28a745' },
        { label: 'Финиш', value: `${(totals.kg.finish / KG_PER_BAG).toFixed(1)} меш.`, hint: `${totals.kg.finish} кг`, color: '#fd7e14' },
        { label: 'Всего', value: `${(totals.totalKg / KG_PER_BAG).toFixed(1)} меш.`, hint: totals.totalCost > 0 ? formatCurrency(totals.totalCost) : `${totals.totalKg} кг`, color: 'var(--tg-hint)' },
      ]} />

      <button
        type="button" onClick={openCreate}
        className="w-full rounded-xl px-4 py-3 text-base font-semibold bg-tg-button text-tg-button-text"
        style={{ minHeight: 48 }}
      >
        + Добавить приход
      </button>

      <label className="flex items-center gap-2 text-sm text-tg-hint select-none">
        <input type="checkbox" checked={showArchived} onChange={() => setShowArchived((v) => !v)} />
        Показать поставки архивных партий
      </label>

      {filteredDeliveries.length === 0 ? (
        <EmptyState icon="🌾" title="Поставок пока нет" hint="Нажмите «+ Добавить приход»" />
      ) : (
        filteredDeliveries.map((d) => (
          <Card key={d.id}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-base font-medium">{d.feed_type.charAt(0).toUpperCase() + d.feed_type.slice(1)}</p>
                <p className="text-xs text-tg-hint">{new Date(d.delivery_date).toLocaleDateString('ru-RU')} · {(d.quantity_kg / KG_PER_BAG).toFixed(1)} меш. ({d.quantity_kg} кг)</p>
                {d.batch_name && (
                  <span
                    className="inline-block mt-1 text-xs rounded-full px-2 py-0.5"
                    style={{
                      background: d.batch_is_active ? 'color-mix(in srgb, var(--tg-link, #4f46e5) 15%, transparent)' : 'var(--tg-secondary-bg)',
                      color: d.batch_is_active ? 'var(--tg-link, #4f46e5)' : 'var(--tg-hint)',
                    }}
                  >
                    {d.batch_name}
                  </span>
                )}
              </div>
              <p className="text-base font-semibold shrink-0">{d.amount > 0 ? formatCurrency(d.amount) : '–'}</p>
            </div>
            <div className="flex gap-2 mt-2">
              <button type="button" onClick={() => openEdit(d)} className="flex-1 rounded-lg px-3 py-2 text-xs bg-tg-secondary" style={{ minHeight: 36 }}>✏️ Изменить</button>
              <button type="button" onClick={() => setConfirmDeleteId(d.id)} className="flex-1 rounded-lg px-3 py-2 text-xs text-tg-destructive bg-tg-secondary" style={{ minHeight: 36 }}>🗑 Удалить</button>
            </div>
          </Card>
        ))
      )}

      <BottomSheet open={formOpen} onClose={() => setFormOpen(false)} title={editingId ? 'Редактировать приход' : 'Новый приход корма'}>
        <div className="flex flex-col gap-3">
          <FormField label="Дата">
            <input type="date" value={form.delivery_date} onChange={(e) => setForm((f) => ({ ...f, delivery_date: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }} />
          </FormField>
          <FormField label="Тип корма">
            <select value={form.feed_type} onChange={(e) => setForm((f) => ({ ...f, feed_type: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }}>
              <option value="старт">Старт</option>
              <option value="рост">Рост</option>
              <option value="финиш">Финиш</option>
            </select>
          </FormField>
          <FormField label={`Мешки (1 меш. = ${KG_PER_BAG} кг) *`}>
            <input type="number" step="0.5" value={form.bags} onChange={(e) => setForm((f) => ({ ...f, bags: e.target.value }))} placeholder="10" className={fieldClass} style={{ minHeight: 48 }} />
            {form.bags && <p className="text-xs text-tg-hint mt-1">= {(Number(form.bags) * KG_PER_BAG).toFixed(0)} кг</p>}
          </FormField>
          <FormField label="Партия (опционально)">
            <select value={form.batch_id} onChange={(e) => setForm((f) => ({ ...f, batch_id: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }}>
              <option value="">— Не привязывать —</option>
              {activeBatches.map((b) => <option key={b.id} value={b.id}>{b.batch_name}</option>)}
            </select>
          </FormField>
          <FormField label="Цена за кг (опционально)">
            <input type="number" step="0.01" value={form.price_per_kg} onChange={(e) => setForm((f) => ({ ...f, price_per_kg: e.target.value }))} placeholder="5.00" className={fieldClass} style={{ minHeight: 44 }} />
          </FormField>
          {Number(form.price_per_kg) > 0 && (
            <FormField label="Тип оплаты">
              <select value={form.transaction_type} onChange={(e) => setForm((f) => ({ ...f, transaction_type: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }}>
                <option value="purchase">Сразу</option>
                <option value="debt">В долг</option>
              </select>
            </FormField>
          )}
          <FormField label="Фирма (опционально)">
            <input value={form.company} onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }} />
          </FormField>
          <button
            type="button" onClick={save} disabled={saving}
            className="rounded-xl px-4 py-3 text-base font-semibold bg-tg-button text-tg-button-text disabled:opacity-60"
            style={{ minHeight: 48 }}
          >
            {saving ? 'Сохраняем…' : editingId ? 'Сохранить' : 'Добавить приход'}
          </button>
        </div>
      </BottomSheet>

      <ConfirmSheet open={!!confirmDeleteId} title="Удалить запись?" onConfirm={confirmDelete} onClose={() => setConfirmDeleteId(null)} />
    </div>
  );
}
