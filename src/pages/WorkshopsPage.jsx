import { useWorkshops } from '../hooks/useBatchData';
import WorkshopCard from '../components/WorkshopCard';
import WorkshopDailyTable from '../components/WorkshopDailyTable';
import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { getNormForDay } from '../constants/broilerStandards';

export default function WorkshopsPage() {
  const { workshops, loading, createWorkshop, updateWorkshop, deleteWorkshop } = useWorkshops();
  const [selectedWorkshop, setSelectedWorkshop] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingWorkshop, setEditingWorkshop] = useState(null);

  const handleCreate = async (data) => {
    const { error } = await createWorkshop(data);
    if (error) { alert('Ошибка: ' + error.message); }
    else { setShowForm(false); }
  };

  const handleUpdate = async (data) => {
    const { error } = await updateWorkshop(editingWorkshop.id, data);
    if (error) { alert('Ошибка: ' + error.message); }
    else { setEditingWorkshop(null); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Вы уверены, что хотите удалить этот цех? Цех будет деактивирован (данные сохранятся).')) return;
    const { error } = await deleteWorkshop(id);
    if (error) { alert('Ошибка: ' + error.message); }
    else {
      if (selectedWorkshop?.id === id) setSelectedWorkshop(null);
    }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>Загрузка...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <h2 style={{ fontSize: 24, fontWeight: 'bold', color: '#1f2937', margin: 0 }}>🏭 Учёт по цехам</h2>
        <button
          onClick={() => { setShowForm(true); setEditingWorkshop(null); }}
          style={{
            padding: '8px 16px', background: '#4f46e5', color: '#fff',
            border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold', fontSize: 14,
            minHeight: 44,
          }}
        >
          + Добавить цех
        </button>
      </div>

      {/* Форма создания/редактирования цеха */}
      {(showForm || editingWorkshop) && (
        <WorkshopForm
          initialData={editingWorkshop}
          onSubmit={editingWorkshop ? handleUpdate : handleCreate}
          onClose={() => { setShowForm(false); setEditingWorkshop(null); }}
        />
      )}

      {workshops.length === 0 && !showForm ? (
        <div style={{
          textAlign: 'center', padding: 60, background: '#fff',
          borderRadius: 8, border: '1px solid #dee2e6',
        }}>
          <p style={{ fontSize: 16, color: '#999', marginBottom: 12 }}>Цеха ещё не добавлены</p>
          <p style={{ fontSize: 13, color: '#bbb' }}>Нажмите «+ Добавить цех» чтобы создать первый</p>
        </div>
      ) : (
        <>
          {/* Строка карточек цехов — обзор всех */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px,1fr))', gap: 16, marginBottom: 24 }}>
            {workshops.map(w => (
              <WorkshopCard
                key={w.id}
                workshop={w}
                isSelected={selectedWorkshop?.id === w.id}
                onClick={() => setSelectedWorkshop(w.id === selectedWorkshop?.id ? null : w)}
                onEdit={() => setEditingWorkshop(w)}
                onDelete={() => handleDelete(w.id)}
              />
            ))}
          </div>

          {/* Детальная таблица выбранного цеха */}
          {selectedWorkshop && (
            <div style={{ background: '#fff', padding: 20, borderRadius: 8, border: '1px solid #dee2e6', marginBottom: 24 }}>
              <WorkshopDailyTable workshopId={selectedWorkshop.id} workshopName={selectedWorkshop.name} />
            </div>
          )}

          {/* Если цех не выбран — показать сводную таблицу всех цехов */}
          {!selectedWorkshop && workshops.length > 0 && (
            <AllWorkshopsSummary workshops={workshops} />
          )}
        </>
      )}
    </div>
  );
}

// --- Форма создания/редактирования цеха ---
function WorkshopForm({ initialData, onSubmit, onClose }) {
  const [name, setName] = useState(initialData?.name || '');
  const [capacity, setCapacity] = useState(initialData?.capacity || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) { alert('Укажите название цеха'); return; }
    setSubmitting(true);
    await onSubmit({ name: name.trim(), capacity, description });
    setSubmitting(false);
  }

  return (
    <div style={{
      background: '#fff', border: '1px solid #dee2e6', borderRadius: 8,
      padding: 24, marginBottom: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
    }}>
      <h3 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 'bold', color: '#1f2937' }}>
        {initialData ? '✏️ Редактировать цех' : '➕ Новый цех'}
      </h3>
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" style={{ marginBottom: 16 }}>
          <div>
            <label style={labelStyle}>Название цеха *</label>
            <input
              value={name} onChange={e => setName(e.target.value)}
              placeholder="Цех №1"
              style={{ ...inputStyle, width: '100%' }}
              required
            />
          </div>
          <div>
            <label style={labelStyle}>Вместимость (голов)</label>
            <input
              type="number" value={capacity} onChange={e => setCapacity(e.target.value)}
              placeholder="45000"
              style={{ ...inputStyle, width: '100%' }}
            />
          </div>
          <div>
            <label style={labelStyle}>Описание</label>
            <input
              value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Основной цех, утеплённый..."
              style={{ ...inputStyle, width: '100%' }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="submit" disabled={submitting}
            style={{
              padding: '8px 20px', background: '#4f46e5', color: '#fff',
              border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold',
              minHeight: 44,
            }}
          >
            {submitting ? 'Сохранение...' : initialData ? 'Сохранить' : 'Создать цех'}
          </button>
          <button
            type="button" onClick={onClose}
            style={{
              padding: '8px 16px', background: '#f0f0f0', border: '1px solid #ccc',
              borderRadius: 6, cursor: 'pointer', minHeight: 44,
            }}
          >
            Отмена
          </button>
        </div>
      </form>
    </div>
  );
}

// --- Сводная таблица всех цехов ---
function AllWorkshopsSummary({ workshops }) {
  const [summaryData, setSummaryData] = useState({});

  useEffect(() => {
    loadSummary();
  }, [workshops]);

  async function loadSummary() {
    const data = {};
    for (const w of workshops) {
      const activeBatch = w.batches?.find(b => b.is_active);
      if (!activeBatch) continue;

      const { data: lastLog } = await supabase
        .from('daily_logs')
        .select('age, mortality, weight, daily_feed')
        .eq('batch_id', activeBatch.id)
        .order('age', { ascending: false })
        .limit(1)
        .single();

      if (lastLog) {
        const norm = getNormForDay(lastLog.age);
        data[w.id] = { ...lastLog, norm };
      }
    }
    setSummaryData(data);
  }

  return (
    <div style={{ background: '#fff', padding: 20, borderRadius: 8, border: '1px solid #dee2e6' }}>
      <h3 style={{ fontSize: 18, fontWeight: 'bold', margin: '0 0 16px', color: '#1f2937' }}>📊 Сводка по всем цехам</h3>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#f8f9fa' }}>
              {['Цех','Партия','День','Поголовье','Пало сегодня','Масса факт','Масса норма','Корм факт (мешк.)','Корм норма (г/гол)'].map(h => (
                <th key={h} style={{ padding: '8px 12px', borderBottom: '2px solid #dee2e6', textAlign:'left', fontWeight: 'bold' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {workshops.map(w => {
              const active = w.batches?.find(b => b.is_active);
              const sd = summaryData[w.id];
              if (!active) return (
                <tr key={w.id}>
                  <td style={{ padding: '8px 12px', color:'#555', fontWeight: 'bold' }}>{w.name}</td>
                  <td colSpan={8} style={{ padding:'8px 12px', color:'#999' }}>Нет активной партии</td>
                </tr>
              );
              return (
                <tr key={w.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '8px 12px', fontWeight:'bold' }}>{w.name}</td>
                  <td style={{ padding: '8px 12px' }}>{active.batch_name}</td>
                  <td style={{ padding: '8px 12px', textAlign:'center' }}>{sd?.age ?? '—'}</td>
                  <td style={{ padding: '8px 12px' }}>{active.initial_quantity?.toLocaleString()}</td>
                  <td style={{ padding: '8px 12px', textAlign:'center', color: sd?.mortality > 150 ? '#dc3545' : 'inherit' }}>
                    {sd?.mortality ?? '—'}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign:'center' }}>{sd?.weight ?? '—'}</td>
                  <td style={{ padding: '8px 12px', textAlign:'center', color: '#999' }}>{sd?.norm?.weight ?? '—'}</td>
                  <td style={{ padding: '8px 12px', textAlign:'center' }}>{sd?.daily_feed ?? '—'}</td>
                  <td style={{ padding: '8px 12px', textAlign:'center', color: '#999' }}>{sd?.norm?.dailyFeed ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            {(() => {
              let totalHead = 0, totalMort = 0, totalFeed = 0;
              workshops.forEach(w => {
                const active = w.batches?.find(b => b.is_active);
                if (!active) return;
                totalHead += active.initial_quantity || 0;
                const sd = summaryData[w.id];
                if (sd) {
                  totalMort += sd.mortality || 0;
                  totalFeed += sd.daily_feed || 0;
                }
              });
              return (
                <tr style={{ background: '#f0f4ff', borderTop: '2px solid #4f46e5' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 'bold', color: '#4f46e5' }}>ИТОГО</td>
                  <td style={{ padding: '10px 12px' }}></td>
                  <td style={{ padding: '10px 12px' }}></td>
                  <td style={{ padding: '10px 12px', fontWeight: 'bold' }}>{totalHead.toLocaleString()}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 'bold', color: '#dc3545' }}>{totalMort}</td>
                  <td style={{ padding: '10px 12px' }}></td>
                  <td style={{ padding: '10px 12px' }}></td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 'bold', color: '#fd7e14' }}>{totalFeed}</td>
                  <td style={{ padding: '10px 12px' }}></td>
                </tr>
              );
            })()}
          </tfoot>
        </table>
      </div>
      <p style={{ fontSize:12, color:'#999', marginTop:8 }}>
        Кликни на карточку цеха выше, чтобы увидеть полную детализацию.
      </p>
    </div>
  );
}

const labelStyle = { display: 'block', fontSize: 13, color: '#555', marginBottom: 4, fontWeight: '500' };
const inputStyle = { padding: '10px', border: '1px solid #dee2e6', borderRadius: 6, fontSize: 16, boxSizing: 'border-box' };
