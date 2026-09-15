// src/mobile/pages/MobileGasPage.jsx
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabaseClient';
import { forecastGasBalance, projectedZeroBalanceReading } from '../../utils/gasForecast';
import Card from '../components/Card';
import ConfirmSheet from '../components/ConfirmSheet';
import FormField from '../components/FormField';
import StatGrid from '../components/StatGrid';
import Tabs from '../components/Tabs';
import EmptyState from '../components/EmptyState';
import Spinner from '../components/Spinner';

const fieldClass = 'w-full rounded-xl px-3 bg-tg-secondary text-tg-text';
const formatCurrency = (v) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'TJS' }).format(v || 0);

const EMPTY_READING_FORM = { reading_date: new Date().toISOString().slice(0, 10), reading_value: '', description: '' };
const EMPTY_TOPUP_FORM = { transaction_date: new Date().toISOString().slice(0, 10), amount: '', description: '' };
const EMPTY_PRICE_FORM = { effective_date: new Date().toISOString().slice(0, 10), price: '' };

export default function MobileGasPage() {
  const [readings, setReadings] = useState([]);
  const [topups, setTopups] = useState([]);
  const [priceHistory, setPriceHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showHidden, setShowHidden] = useState(false);

  const [activeTab, setActiveTab] = useState('reading');
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const [readingForm, setReadingForm] = useState(EMPTY_READING_FORM);
  const [topupForm, setTopupForm] = useState(EMPTY_TOPUP_FORM);
  const [priceForm, setPriceForm] = useState(EMPTY_PRICE_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState(null); // { table, id, warning }

  async function fetchData() {
    setLoading(true);
    const [readingsRes, topupsRes, priceRes] = await Promise.all([
      supabase.from('gas_meter_readings').select('*').order('reading_date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('gas_topups').select('*').order('transaction_date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('gas_price_history').select('*').order('effective_date', { ascending: false }),
    ]);
    if (readingsRes.error) window.alert('Ошибка: ' + readingsRes.error.message);
    else setReadings(readingsRes.data || []);
    if (topupsRes.error) window.alert('Ошибка: ' + topupsRes.error.message);
    else setTopups(topupsRes.data || []);
    if (priceRes.error) window.alert('Ошибка: ' + priceRes.error.message);
    else setPriceHistory(priceRes.data || []);
    setLoading(false);
  }

  useEffect(() => { fetchData(); }, []);

  const filteredReadings = useMemo(() => readings.filter((r) => showHidden || !r.is_hidden), [readings, showHidden]);
  const filteredTopups = useMemo(() => topups.filter((t) => showHidden || !t.is_hidden), [topups, showHidden]);

  const previousReading = useMemo(() => {
    const sorted = [...readings].sort((a, b) => new Date(b.reading_date) - new Date(a.reading_date));
    return sorted[0] || null;
  }, [readings]);

  const currentPrice = useMemo(() => {
    const today = new Date();
    const applicable = priceHistory.filter((p) => new Date(p.effective_date) <= today).sort((a, b) => new Date(b.effective_date) - new Date(a.effective_date));
    if (applicable.length > 0) return applicable[0];
    const sorted = [...priceHistory].sort((a, b) => new Date(a.effective_date) - new Date(b.effective_date));
    return sorted[0] || null;
  }, [priceHistory]);

  const summary = useMemo(() => {
    const totalTopups = filteredTopups.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    const totalConsumedAmount = filteredReadings.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    return { currentBalance: totalTopups - totalConsumedAmount, totalConsumedAmount };
  }, [filteredTopups, filteredReadings]);

  const rangeReadings = useMemo(() => filteredReadings.filter((r) => {
    if (rangeFrom && r.reading_date < rangeFrom) return false;
    if (rangeTo && r.reading_date > rangeTo) return false;
    return true;
  }), [filteredReadings, rangeFrom, rangeTo]);

  const rangeTotalAmount = useMemo(() =>
    rangeReadings.reduce((sum, r) => sum + (Number(r.amount) || 0), 0), [rangeReadings]);

  const forecast = useMemo(() => forecastGasBalance(filteredReadings, summary.currentBalance), [filteredReadings, summary.currentBalance]);
  const zeroBalancePoint = useMemo(() => projectedZeroBalanceReading(
    previousReading ? previousReading.reading_value : null,
    summary.currentBalance,
    currentPrice ? Number(currentPrice.price) : null,
  ), [previousReading, summary.currentBalance, currentPrice]);

  const readingPreview = useMemo(() => {
    const value = Number(readingForm.reading_value);
    if (!readingForm.reading_value || !value) return null;
    const consumption = previousReading ? value - previousReading.reading_value : null;
    const amount = (consumption != null && currentPrice) ? consumption * currentPrice.price : null;
    return { consumption, amount };
  }, [readingForm.reading_value, previousReading, currentPrice]);

  async function submitReading() {
    const value = Number(readingForm.reading_value);
    if (!readingForm.reading_value || value < 0) { window.alert('Введите корректное показание счётчика'); return; }
    if (previousReading && value < previousReading.reading_value) {
      window.alert(`Новое показание (${value}) меньше предыдущего (${previousReading.reading_value}). Проверьте значение.`);
      return;
    }
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
      const consumption = previousReading ? value - previousReading.reading_value : null;
      const priceVal = currentPrice ? Number(currentPrice.price) : null;
      const amount = (consumption != null && priceVal != null) ? consumption * priceVal : null;
      const { error } = await supabase.from('gas_meter_readings').insert([{
        reading_date: readingForm.reading_date, reading_value: value,
        consumption_m3: consumption, price_per_m3: priceVal, amount,
        description: readingForm.description || null, user_id: user.id,
      }]);
      if (error) window.alert('Ошибка: ' + error.message);
      else { setReadingForm({ ...EMPTY_READING_FORM, reading_date: new Date().toISOString().slice(0, 10) }); await fetchData(); }
    } finally {
      setSubmitting(false);
    }
  }

  async function submitTopup() {
    const amount = Number(topupForm.amount);
    if (!(amount > 0)) { window.alert('Сумма пополнения должна быть больше нуля'); return; }
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
      const { error } = await supabase.from('gas_topups').insert([{
        transaction_date: topupForm.transaction_date, amount,
        description: topupForm.description || null, user_id: user.id,
      }]);
      if (error) window.alert('Ошибка: ' + error.message);
      else { setTopupForm({ ...EMPTY_TOPUP_FORM, transaction_date: new Date().toISOString().slice(0, 10) }); await fetchData(); }
    } finally {
      setSubmitting(false);
    }
  }

  async function submitPrice() {
    const price = Number(priceForm.price);
    if (!(price > 0)) { window.alert('Цена должна быть больше нуля'); return; }
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
      const { error } = await supabase.from('gas_price_history').insert([{
        price, effective_date: priceForm.effective_date, user_id: user.id,
      }]);
      if (error) window.alert('Ошибка: ' + error.message);
      else { setPriceForm(EMPTY_PRICE_FORM); await fetchData(); }
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleHidden(table, row) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
    const { error } = await supabase.from(table).update({ is_hidden: !row.is_hidden }).eq('id', row.id);
    if (error) window.alert('Ошибка: ' + error.message);
    await fetchData();
  }

  async function confirmDeleteAction() {
    if (!confirmTarget) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
    const { error } = await supabase.from(confirmTarget.table).delete().eq('id', confirmTarget.id);
    if (error) window.alert('Ошибка: ' + error.message);
    setConfirmTarget(null);
    await fetchData();
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  const balanceColor = summary.currentBalance <= 0 ? '#dc3545' : (forecast && forecast.daysRemaining != null && forecast.daysRemaining < 7 ? '#fd7e14' : '#28a745');

  return (
    <div className="flex flex-col gap-3 py-3">
      <StatGrid items={[
        { label: 'Текущий баланс', value: formatCurrency(summary.currentBalance), color: balanceColor },
        { label: 'Расход газа (сумма)', value: formatCurrency(summary.totalConsumedAmount), color: '#dc3545' },
        { label: 'Цена газа', value: currentPrice ? `${currentPrice.price} смн/м³` : '—', color: '#007bff' },
        { label: 'Хватит на', value: forecast && forecast.daysRemaining != null ? `${forecast.daysRemaining} дн.` : 'нет данных', hint: forecast?.projectedEmptyDate ? `до ${forecast.projectedEmptyDate.toLocaleDateString('ru-RU')}` : null, color: forecast && forecast.daysRemaining != null && forecast.daysRemaining < 7 ? '#dc3545' : 'var(--tg-hint)' },
        { label: 'Обнулится при', value: zeroBalancePoint ? `${zeroBalancePoint.projectedReading} м³` : '—', hint: zeroBalancePoint ? `ещё ${zeroBalancePoint.m3Remaining} м³` : null, color: '#fd7e14' },
      ]} />
      {readings.length < 2 && (
        <p className="text-xs text-tg-hint px-1">
          {readings.length === 0 ? 'Внесите первое показание счётчика и цену газа, чтобы увидеть прогноз.' : '«Хватит на N дней» появится после второго показания. «Обнулится при» уже доступно.'}
        </p>
      )}

      <Tabs
        tabs={[
          { key: 'reading', label: '🔢 Показания' },
          { key: 'topup', label: '💰 Пополнение' },
          { key: 'price', label: '🏷️ Цена' },
        ]}
        active={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === 'reading' && (
        <>
          <Card>
            <div className="flex flex-col gap-3">
              <FormField label="Дата">
                <input type="date" value={readingForm.reading_date} onChange={(e) => setReadingForm((f) => ({ ...f, reading_date: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }} />
              </FormField>
              <FormField label="Показание счётчика (м³) *">
                <input type="number" step="0.001" value={readingForm.reading_value} onChange={(e) => setReadingForm((f) => ({ ...f, reading_value: e.target.value }))} placeholder={previousReading ? String(previousReading.reading_value) : '0'} className={fieldClass} style={{ minHeight: 48 }} />
              </FormField>
              <FormField label="Описание">
                <input value={readingForm.description} onChange={(e) => setReadingForm((f) => ({ ...f, description: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }} />
              </FormField>
              {previousReading && (
                <p className="text-xs text-tg-hint">Предыдущее: {previousReading.reading_value} м³ ({new Date(previousReading.reading_date).toLocaleDateString('ru-RU')})</p>
              )}
              {readingPreview && readingPreview.consumption != null && (
                <p className="text-sm text-tg-hint">
                  Расход: <strong>{readingPreview.consumption} м³</strong>
                  {readingPreview.amount != null && <> = <strong>{formatCurrency(readingPreview.amount)}</strong> спишется с баланса</>}
                </p>
              )}
              {!currentPrice && <p className="text-xs" style={{ color: '#fd7e14' }}>Цена газа не задана — сначала добавьте её во вкладке «Цена».</p>}
              <button type="button" onClick={submitReading} disabled={submitting} className="rounded-xl px-4 py-3 text-base font-semibold bg-tg-button text-tg-button-text disabled:opacity-60" style={{ minHeight: 48 }}>
                {submitting ? 'Сохранение…' : '🔢 Записать показание'}
              </button>
            </div>
          </Card>

          <label className="flex items-center gap-2 text-sm text-tg-hint select-none">
            <input type="checkbox" checked={showHidden} onChange={() => setShowHidden((v) => !v)} />
            Показать скрытые позиции
          </label>

          <Card>
            <div className="flex flex-col gap-3">
              <FormField label="С какого числа">
                <input type="date" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} className={fieldClass} style={{ minHeight: 44 }} />
              </FormField>
              <FormField label="По какое число">
                <input type="date" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} className={fieldClass} style={{ minHeight: 44 }} />
              </FormField>
              {(rangeFrom || rangeTo) && (
                <button type="button" onClick={() => { setRangeFrom(''); setRangeTo(''); }} className="text-xs text-tg-hint text-left">Сбросить период</button>
              )}
              <div className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: 'rgba(220,53,69,0.1)' }}>
                <p className="text-xs font-medium" style={{ color: '#dc3545' }}>
                  Сумма {(rangeFrom || rangeTo) ? 'за период' : 'за всё время'}
                </p>
                <p className="text-base font-bold" style={{ color: '#dc3545' }}>{formatCurrency(rangeTotalAmount)}</p>
              </div>
            </div>
          </Card>

          {rangeReadings.length === 0 ? (
            <EmptyState icon="🔢" title={(rangeFrom || rangeTo) ? 'Нет показаний за выбранный период' : 'Показаний пока нет'} />
          ) : (
            rangeReadings.map((r) => (
              <Card key={r.id} className={r.is_hidden ? 'opacity-50' : ''}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-base font-medium">{r.reading_value} м³</p>
                    <p className="text-xs text-tg-hint mt-1">{new Date(r.reading_date).toLocaleDateString('ru-RU')}{r.description ? ` · ${r.description}` : ''}</p>
                    {r.consumption_m3 != null && <p className="text-xs text-tg-hint">Расход: {r.consumption_m3} м³</p>}
                  </div>
                  {r.amount != null && <p className="text-base font-semibold shrink-0" style={{ color: '#dc3545' }}>−{formatCurrency(r.amount)}</p>}
                </div>
                <div className="flex gap-2 mt-2">
                  <button type="button" onClick={() => toggleHidden('gas_meter_readings', r)} className="flex-1 rounded-lg px-3 py-2 text-xs bg-tg-secondary" style={{ minHeight: 36 }}>
                    {r.is_hidden ? '👁️ Показать' : '🙈 Скрыть'}
                  </button>
                  <button type="button" onClick={() => setConfirmTarget({ table: 'gas_meter_readings', id: r.id, warning: 'Это повлияет на расчёт расхода и баланс.' })} className="flex-1 rounded-lg px-3 py-2 text-xs text-tg-destructive bg-tg-secondary" style={{ minHeight: 36 }}>🗑 Удалить</button>
                </div>
              </Card>
            ))
          )}
        </>
      )}

      {activeTab === 'topup' && (
        <>
          <Card>
            <div className="flex flex-col gap-3">
              <FormField label="Дата">
                <input type="date" value={topupForm.transaction_date} onChange={(e) => setTopupForm((f) => ({ ...f, transaction_date: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }} />
              </FormField>
              <FormField label="Сумма *">
                <input type="number" step="0.01" value={topupForm.amount} onChange={(e) => setTopupForm((f) => ({ ...f, amount: e.target.value }))} placeholder="5000" className={fieldClass} style={{ minHeight: 48 }} />
              </FormField>
              <FormField label="Описание">
                <input value={topupForm.description} onChange={(e) => setTopupForm((f) => ({ ...f, description: e.target.value }))} placeholder="Предоплата за газ" className={fieldClass} style={{ minHeight: 44 }} />
              </FormField>
              <button type="button" onClick={submitTopup} disabled={submitting} className="rounded-xl px-4 py-3 text-base font-semibold text-white disabled:opacity-60" style={{ minHeight: 48, background: '#28a745' }}>
                {submitting ? 'Сохранение…' : '💰 Записать пополнение'}
              </button>
            </div>
          </Card>

          <label className="flex items-center gap-2 text-sm text-tg-hint select-none">
            <input type="checkbox" checked={showHidden} onChange={() => setShowHidden((v) => !v)} />
            Показать скрытые позиции
          </label>

          {filteredTopups.length === 0 ? (
            <EmptyState icon="💰" title="Пополнений пока нет" />
          ) : (
            filteredTopups.map((t) => (
              <Card key={t.id} className={t.is_hidden ? 'opacity-50' : ''}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-tg-hint">{new Date(t.transaction_date).toLocaleDateString('ru-RU')}{t.description ? ` · ${t.description}` : ''}</p>
                  </div>
                  <p className="text-base font-semibold shrink-0" style={{ color: '#28a745' }}>+{formatCurrency(t.amount)}</p>
                </div>
                <div className="flex gap-2 mt-2">
                  <button type="button" onClick={() => toggleHidden('gas_topups', t)} className="flex-1 rounded-lg px-3 py-2 text-xs bg-tg-secondary" style={{ minHeight: 36 }}>
                    {t.is_hidden ? '👁️ Показать' : '🙈 Скрыть'}
                  </button>
                  <button type="button" onClick={() => setConfirmTarget({ table: 'gas_topups', id: t.id, warning: 'Это повлияет на баланс.' })} className="flex-1 rounded-lg px-3 py-2 text-xs text-tg-destructive bg-tg-secondary" style={{ minHeight: 36 }}>🗑 Удалить</button>
                </div>
              </Card>
            ))
          )}
        </>
      )}

      {activeTab === 'price' && (
        <>
          <Card>
            <div className="flex flex-col gap-3">
              <FormField label="Действует с">
                <input type="date" value={priceForm.effective_date} onChange={(e) => setPriceForm((f) => ({ ...f, effective_date: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }} />
              </FormField>
              <FormField label="Цена за м³ *">
                <input type="number" step="0.01" value={priceForm.price} onChange={(e) => setPriceForm((f) => ({ ...f, price: e.target.value }))} placeholder="2.82" className={fieldClass} style={{ minHeight: 48 }} />
              </FormField>
              <p className="text-xs text-tg-hint">Новая цена применяется к показаниям, внесённым после её даты. Старые расчёты не пересчитываются.</p>
              <button type="button" onClick={submitPrice} disabled={submitting} className="rounded-xl px-4 py-3 text-base font-semibold text-white disabled:opacity-60" style={{ minHeight: 48, background: '#fd7e14' }}>
                {submitting ? 'Сохранение…' : '🏷️ Сохранить цену'}
              </button>
            </div>
          </Card>

          {priceHistory.length === 0 ? (
            <EmptyState icon="🏷️" title="Цена ещё не задана" />
          ) : (
            priceHistory.map((p) => (
              <Card key={p.id}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-base font-medium">
                      {new Date(p.effective_date).toLocaleDateString('ru-RU')}
                      {currentPrice && p.id === currentPrice.id && (
                        <span className="ml-2 text-xs font-semibold" style={{ color: '#007bff' }}>текущая</span>
                      )}
                    </p>
                    <p className="text-xs text-tg-hint mt-1">{p.price} смн/м³</p>
                  </div>
                  <button type="button" onClick={() => setConfirmTarget({ table: 'gas_price_history', id: p.id, warning: undefined })} className="rounded-lg px-3 py-2 text-xs text-tg-destructive bg-tg-secondary shrink-0" style={{ minHeight: 36 }}>🗑</button>
                </div>
              </Card>
            ))
          )}
        </>
      )}

      <ConfirmSheet
        open={!!confirmTarget}
        title="Удалить запись?"
        message={confirmTarget?.warning}
        onConfirm={confirmDeleteAction}
        onClose={() => setConfirmTarget(null)}
      />
    </div>
  );
}
