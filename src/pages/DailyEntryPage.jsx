import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { getNormForDay, FEED_BAG_WEIGHT_G } from '../constants/broilerStandards';
import { syncSummaryBatchLog } from '../utils/summaryBatchSync';

export default function DailyEntryPage() {
  const [workshops, setWorkshops] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [todayDate, setTodayDate] = useState(new Date().toISOString().slice(0, 10));

  // Состояния ввода для каждого цеха (по workshop.id)
  const [entries, setEntries] = useState({});
  const [submitting, setSubmitting] = useState({});
  const [todayLogs, setTodayLogs] = useState({}); // Текущие итоги дня

  useEffect(() => {
    loadAll();
  }, [todayDate]);

  async function loadAll() {
    setLoading(true);

    // 1. Загрузить все активные цеха с активными партиями
    const { data: wsData } = await supabase
      .from('workshops')
      .select(`
        *,
        batches:broiler_batches (
          id, batch_name, initial_quantity, start_date, is_active
        )
      `)
      .eq('is_active', true)
      .order('name');

    const workshopsWithActive = (wsData || []).map(w => ({
      ...w,
      activeBatch: w.batches?.find(b => b.is_active) || null,
    })).filter(w => w.activeBatch);

    setWorkshops(workshopsWithActive);

    // 2. Загрузить лекарства
    const { data: medsData } = await supabase
      .from('medicines')
      .select('id, name')
      .order('name');
    setMedicines(medsData || []);

    // 3. Загрузить текущие записи журнала за выбранный день одним запросом на все партии
    const logs = {};
    const batchIds = workshopsWithActive.map(w => w.activeBatch.id);
    if (batchIds.length > 0) {
      const { data: logsData } = await supabase
        .from('daily_logs')
        .select('*, medicine:medicines(name)')
        .in('batch_id', batchIds)
        .eq('log_date', todayDate);

      const logsByBatch = {};
      (logsData || []).forEach(l => { logsByBatch[l.batch_id] = l; });
      workshopsWithActive.forEach(w => { logs[w.id] = logsByBatch[w.activeBatch.id] || null; });
    }
    setTodayLogs(logs);
    setLoading(false);
  }

  // Перезагрузить запись журнала только для одного цеха (без полной перезагрузки страницы)
  async function refreshWorkshopLog(workshop) {
    const { data: logData } = await supabase
      .from('daily_logs')
      .select('*, medicine:medicines(name)')
      .eq('batch_id', workshop.activeBatch.id)
      .eq('log_date', todayDate)
      .maybeSingle();

    setTodayLogs(prev => ({ ...prev, [workshop.id]: logData || null }));
  }

  // Исправить уже сохранённое значение за сегодня (перезаписать, а не суммировать)
  async function handleCorrect(workshop, field, rawValue) {
    const existingLog = todayLogs[workshop.id];
    if (!existingLog) return;

    const numValue = Number(rawValue) || 0;
    const updateData = {};

    if (field === 'mortality_natural') {
      updateData.mortality_natural = numValue;
      updateData.mortality = numValue + (existingLog.mortality_halal || 0);
    } else if (field === 'mortality_halal') {
      updateData.mortality_halal = numValue;
      updateData.mortality = (existingLog.mortality_natural || 0) + numValue;
    } else if (field === 'daily_feed') {
      updateData.daily_feed = numValue;
    } else if (field === 'water_consumption') {
      updateData.water_consumption = numValue;
    }

    const { error } = await supabase
      .from('daily_logs')
      .update(updateData)
      .eq('id', existingLog.id);

    if (error) {
      alert('Ошибка: ' + error.message);
      return;
    }

    await refreshWorkshopLog(workshop);
  }

  // Расчёт возраста партии
  function getAge(startDate) {
    const start = new Date(startDate);
    const current = new Date(todayDate);
    return Math.ceil(Math.abs(current - start) / (1000 * 60 * 60 * 24));
  }

  // Обновить поле ввода
  function updateEntry(workshopId, field, value) {
    setEntries(prev => ({
      ...prev,
      [workshopId]: {
        ...(prev[workshopId] || {}),
        [field]: value,
      }
    }));
  }

  // Добавить данные (суммировать с существующими)
  async function handleSubmit(workshop) {
    const entry = entries[workshop.id];
    if (!entry) return;

    const mortalityNatural = Number(entry.mortality_natural) || 0;
    const mortalityHalal = Number(entry.mortality_halal) || 0;
    const mortality = mortalityNatural + mortalityHalal;
    const feedBags = Number(entry.feed) || 0;
    const waterLiters = Number(entry.water) || 0;
    const weightVal = entry.weight ? parseFloat(entry.weight) : null;
    const medicineId = entry.medicine_id || null;
    const dosageVal = entry.dosage || '';

    if (mortality === 0 && feedBags === 0 && waterLiters === 0 && !weightVal && !medicineId) {
      alert('Введите хотя бы одно значение');
      return;
    }

    setSubmitting(prev => ({ ...prev, [workshop.id]: true }));

    const batch = workshop.activeBatch;
    const age = getAge(batch.start_date);
    const existingLog = todayLogs[workshop.id];

    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (existingLog) {
        // Обновить существующую запись — суммировать числовые поля
        const newMortalityNatural = (existingLog.mortality_natural || 0) + mortalityNatural;
        const newMortalityHalal = (existingLog.mortality_halal || 0) + mortalityHalal;
        const newMortality = newMortalityNatural + newMortalityHalal;
        const newFeed = (existingLog.daily_feed || 0) + feedBags;
        const newWater = (existingLog.water_consumption || 0) + waterLiters;

        const updateData = {
          mortality: newMortality,
          mortality_natural: newMortalityNatural,
          mortality_halal: newMortalityHalal,
          daily_feed: newFeed,
          water_consumption: newWater,
        };

        // Масса и лекарство — перезаписываем (не суммируем)
        if (weightVal !== null) updateData.weight = weightVal;
        if (medicineId) updateData.medicine_id = medicineId;
        if (dosageVal) updateData.dosage = dosageVal;

        const { error } = await supabase
          .from('daily_logs')
          .update(updateData)
          .eq('id', existingLog.id);

        if (error) throw error;
      } else {
        // Создать новую запись за сегодня
        const { error } = await supabase
          .from('daily_logs')
          .insert([{
            batch_id: batch.id,
            workshop_id: workshop.id,
            log_date: todayDate,
            age: age,
            mortality: mortality,
            mortality_natural: mortalityNatural,
            mortality_halal: mortalityHalal,
            daily_feed: feedBags,
            water_consumption: waterLiters,
            weight: weightVal,
            medicine_id: medicineId,
            dosage: dosageVal || null,
            user_id: user.id,
          }]);

        if (error) throw error;
      }

      // Очистить форму ввода
      setEntries(prev => ({
        ...prev,
        [workshop.id]: {
          mortality_natural: '', mortality_halal: '',
          feed: '', water: '', weight: '',
          medicine_id: '', dosage: ''
        }
      }));

      // Синхронизация "Общей партии"
      await syncSummaryBatchLog(todayDate, user.id);

      // Обновить только этот цех, не перезагружая всю страницу
      await refreshWorkshopLog(workshop);
    } catch (err) {
      alert('Ошибка: ' + err.message);
    }

    setSubmitting(prev => ({ ...prev, [workshop.id]: false }));
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>Загрузка...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <h2 style={{ fontSize: 24, fontWeight: 'bold', color: '#1f2937', margin: 0 }}>📝 Дневной ввод по цехам</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 14, color: '#555' }}>Дата:</label>
          <input
            type="date"
            value={todayDate}
            onChange={e => setTodayDate(e.target.value)}
            style={{ padding: '6px 10px', border: '1px solid #dee2e6', borderRadius: 6, fontSize: 14 }}
          />
        </div>
      </div>

      {workshops.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 60, background: '#fff',
          borderRadius: 8, border: '1px solid #dee2e6',
        }}>
          <p style={{ fontSize: 16, color: '#999', marginBottom: 8 }}>Нет цехов с активными партиями</p>
          <p style={{ fontSize: 13, color: '#bbb' }}>Создайте цех и привяжите к нему активную партию</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          {workshops.map(w => (
            <WorkshopEntryCard
              key={w.id}
              workshop={w}
              todayLog={todayLogs[w.id]}
              entry={entries[w.id] || {}}
              onUpdate={(field, value) => updateEntry(w.id, field, value)}
              onSubmit={() => handleSubmit(w)}
              onCorrect={(field, value) => handleCorrect(w, field, value)}
              isSubmitting={submitting[w.id]}
              age={getAge(w.activeBatch.start_date)}
              todayDate={todayDate}
              medicines={medicines}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// --- Карточка ввода для одного цеха ---
function WorkshopEntryCard({ workshop, todayLog, entry, onUpdate, onSubmit, onCorrect, isSubmitting, age, todayDate, medicines }) {
  const batch = workshop.activeBatch;
  const norm = getNormForDay(age);

  // Текущие итоги за день
  const currentMortalityNatural = todayLog?.mortality_natural || 0;
  const currentMortalityHalal = todayLog?.mortality_halal || 0;
  const currentMortality = todayLog?.mortality || 0;
  const currentFeed = todayLog?.daily_feed || 0;
  const currentWater = todayLog?.water_consumption || 0;
  const currentWeight = todayLog?.weight || null;
  const currentMedicine = todayLog?.medicine?.name || null;
  const currentDosage = todayLog?.dosage || null;

  const hasData = currentMortality > 0 || currentFeed > 0 || currentWater > 0 || currentWeight || currentMedicine;

  // По умолчанию сворачиваем форму ввода, если за сегодня уже есть данные —
  // так проще найти цеха, где ввод ещё не сделан, когда их много.
  const [expanded, setExpanded] = useState(() => !hasData);

  return (
    <div style={{
      background: '#fff', borderRadius: 8, border: '1px solid #dee2e6',
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden',
    }}>
      {/* Заголовок */}
      <div style={{
        padding: '12px 16px', background: '#f8f9fa', borderBottom: '1px solid #eee',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8,
      }}>
        <div>
          <span style={{ fontSize: 16, fontWeight: 'bold', color: '#1f2937' }}>🏠 {workshop.name}</span>
          <span style={{ fontSize: 13, color: '#888', marginLeft: 8 }}>
            {batch.batch_name} · {batch.initial_quantity?.toLocaleString()} гол. · День {age}
          </span>
        </div>
        {norm && (
          <div style={{ fontSize: 11, color: '#999' }}>
            Норма: масса {norm.weight}г · корм {norm.dailyFeed}г/гол · вода {norm.waterNorm}мл/гол
          </div>
        )}
        {hasData && (
          <button
            onClick={() => setExpanded(e => !e)}
            style={{
              background: 'none', border: '1px solid #dee2e6', borderRadius: 6,
              padding: '6px 12px', fontSize: 13, color: '#4f46e5', cursor: 'pointer',
              minHeight: 32,
            }}
          >
            {expanded ? 'Свернуть ▲' : 'Добавить ещё ▼'}
          </button>
        )}
      </div>

      <div style={{ padding: 16 }}>
        {/* Текущие итоги за день */}
        {hasData && (
          <div style={{
            display: 'flex', gap: 12, marginBottom: expanded ? 16 : 0, flexWrap: 'wrap',
          }}>
            <div style={{ ...statBox, borderColor: '#dc354530' }}>
              <div style={{ fontSize: 11, color: '#888' }}>💀 Падёж сегодня</div>
              <div style={{ fontSize: 20, fontWeight: 'bold', color: '#dc3545' }}>{currentMortality} гол.</div>
              <div style={{ fontSize: 11, color: '#999', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                <span>🕊 Ест.: {currentMortalityNatural}<EditableValue value={currentMortalityNatural} onSave={v => onCorrect('mortality_natural', v)} /></span>
                <span>☪ Хал.: {currentMortalityHalal}<EditableValue value={currentMortalityHalal} onSave={v => onCorrect('mortality_halal', v)} /></span>
              </div>
            </div>
            <div style={{ ...statBox, borderColor: '#fd7e1430' }}>
              <div style={{ fontSize: 11, color: '#888' }}>🌾 Корм сегодня</div>
              <div style={{ fontSize: 20, fontWeight: 'bold', color: '#fd7e14', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {currentFeed} мешк.<EditableValue value={currentFeed} onSave={v => onCorrect('daily_feed', v)} />
              </div>
              <div style={{ fontSize: 11, color: '#bbb' }}>{(currentFeed * 40).toFixed(0)} кг</div>
            </div>
            <div style={{ ...statBox, borderColor: '#007bff30' }}>
              <div style={{ fontSize: 11, color: '#888' }}>💧 Вода сегодня</div>
              <div style={{ fontSize: 20, fontWeight: 'bold', color: '#007bff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {currentWater} л<EditableValue value={currentWater} onSave={v => onCorrect('water_consumption', v)} />
              </div>
            </div>
            {currentWeight && (
              <div style={{ ...statBox, borderColor: '#28a74530' }}>
                <div style={{ fontSize: 11, color: '#888' }}>⚖️ Масса</div>
                <div style={{ fontSize: 20, fontWeight: 'bold', color: '#28a745' }}>{currentWeight} г</div>
              </div>
            )}
            {currentMedicine && (
              <div style={{ ...statBox, borderColor: '#6f42c130' }}>
                <div style={{ fontSize: 11, color: '#888' }}>💊 Лекарство</div>
                <div style={{ fontSize: 14, fontWeight: 'bold', color: '#6f42c1' }}>{currentMedicine}</div>
                {currentDosage && <div style={{ fontSize: 11, color: '#999' }}>Доза: {currentDosage}</div>}
              </div>
            )}
          </div>
        )}

        {expanded && (
        <>
        {/* Форма ввода — Падёж */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 8 }}>
          <div style={{ flex: '1 1 110px', minWidth: 95 }}>
            <label style={labelStyle}>🕊 Падёж ест. (гол.)</label>
            <input
              type="number"
              inputMode="numeric"
              value={entry.mortality_natural || ''}
              onChange={e => onUpdate('mortality_natural', e.target.value)}
              placeholder="0"
              min="0"
              style={inputStyle}
            />
          </div>
          <div style={{ flex: '1 1 110px', minWidth: 95 }}>
            <label style={labelStyle}>☪ Падёж халяль (гол.)</label>
            <input
              type="number"
              inputMode="numeric"
              value={entry.mortality_halal || ''}
              onChange={e => onUpdate('mortality_halal', e.target.value)}
              placeholder="0"
              min="0"
              style={inputStyle}
            />
          </div>
          <div style={{ flex: '1 1 110px', minWidth: 95 }}>
            <label style={labelStyle}>🌾 Корм (мешков)</label>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              value={entry.feed || ''}
              onChange={e => onUpdate('feed', e.target.value)}
              placeholder="0"
              min="0"
              style={inputStyle}
            />
          </div>
          <div style={{ flex: '1 1 110px', minWidth: 95 }}>
            <label style={labelStyle}>💧 Вода (литров)</label>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              value={entry.water || ''}
              onChange={e => onUpdate('water', e.target.value)}
              placeholder="0"
              min="0"
              style={inputStyle}
            />
          </div>
        </div>

        {/* Форма ввода — Масса, Лекарство */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 110px', minWidth: 95 }}>
            <label style={labelStyle}>⚖️ Масса (г/гол)</label>
            <input
              type="number"
              inputMode="decimal"
              value={entry.weight || ''}
              onChange={e => onUpdate('weight', e.target.value)}
              placeholder="г"
              min="0"
              style={inputStyle}
            />
          </div>
          <div style={{ flex: '2 1 160px', minWidth: 130 }}>
            <label style={labelStyle}>💊 Лекарство</label>
            <select
              value={entry.medicine_id || ''}
              onChange={e => onUpdate('medicine_id', e.target.value)}
              style={{ ...inputStyle, background: '#fff' }}
            >
              <option value="">-- нет --</option>
              {medicines.map(med => (
                <option key={med.id} value={med.id}>{med.name}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: '1 1 100px', minWidth: 80 }}>
            <label style={labelStyle}>💊 Доза</label>
            <input
              type="text"
              value={entry.dosage || ''}
              onChange={e => onUpdate('dosage', e.target.value)}
              placeholder="доза"
              style={inputStyle}
            />
          </div>
          <div style={{ flex: '0 0 auto' }}>
            <button
              onClick={onSubmit}
              disabled={isSubmitting}
              style={{
                padding: '8px 20px', background: '#4f46e5', color: '#fff',
                border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold',
                fontSize: 14, height: 44, whiteSpace: 'nowrap',
                opacity: isSubmitting ? 0.6 : 1,
              }}
            >
              {isSubmitting ? '...' : '+ Добавить'}
            </button>
          </div>
        </div>

        {/* Подсказка */}
        <p style={{ fontSize: 11, color: '#bbb', marginTop: 8 }}>
          Падёж, корм и вода суммируются с уже введёнными за {todayDate}. Масса и лекарство перезаписываются. Чтобы исправить ошибочно введённое число — нажмите ✏️ рядом с ним выше.
        </p>
        </>
        )}
      </div>
    </div>
  );
}

// --- Быстрое исправление уже сохранённого значения (перезапись, а не сложение) ---
function EditableValue({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState('');

  if (!editing) {
    return (
      <button
        onClick={() => { setVal(String(value)); setEditing(true); }}
        title="Исправить значение"
        style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px',
          fontSize: 13, color: '#999', lineHeight: 1,
        }}
      >
        ✏️
      </button>
    );
  }

  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', marginLeft: 4 }}>
      <input
        type="number"
        inputMode="decimal"
        value={val}
        onChange={e => setVal(e.target.value)}
        autoFocus
        style={{ width: 56, padding: '4px 6px', fontSize: 14, border: '1px solid #4f46e5', borderRadius: 4 }}
      />
      <button
        onClick={() => { onSave(val); setEditing(false); }}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#28a745', fontSize: 16, padding: '4px 6px' }}
      >✓</button>
      <button
        onClick={() => setEditing(false)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc3545', fontSize: 16, padding: '4px 6px' }}
      >✕</button>
    </span>
  );
}

const labelStyle = { display: 'block', fontSize: 12, color: '#666', marginBottom: 4, fontWeight: '500' };
const inputStyle = {
  width: '100%', padding: '10px', border: '1px solid #dee2e6',
  borderRadius: 6, fontSize: 16, boxSizing: 'border-box',
};
const statBox = {
  padding: '8px 16px', borderRadius: 8, border: '1px solid',
  background: '#fafafa', minWidth: 100, textAlign: 'center',
};
