import { useState } from 'react';

export default function TaskForm({ employees, workshops, onSubmit, onClose, initialData }) {
  const [form, setForm] = useState({
    title:       initialData?.title       || '',
    description: initialData?.description || '',
    assignee_id: initialData?.assignee_id || '',
    workshop_id: initialData?.workshop_id || '',
    priority:    initialData?.priority    || 'medium',
    due_date:    initialData?.due_date    || '',
    created_by:  initialData?.created_by  || '',
    status:      initialData?.status      || 'open',
  });
  const [submitting, setSubmitting] = useState(false);

  const set = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));

  async function handleSubmit() {
    if (!form.title.trim()) { alert('Укажите название задачи'); return; }
    if (!form.assignee_id)  { alert('Выберите исполнителя'); return; }
    setSubmitting(true);
    await onSubmit({
      ...form,
      assignee_id: form.assignee_id  || null,
      workshop_id: form.workshop_id  || null,
      due_date:    form.due_date     || null,
    });
    setSubmitting(false);
  }

  return (
    <div style={{
      background:'#fff', border:'1px solid #dee2e6', borderRadius:8,
      padding:24, marginBottom:20,
    }}>
      <h3 style={{ margin:'0 0 16px', fontSize: 18, fontWeight: 'bold', color: '#1f2937' }}>
        {initialData ? 'Редактировать задачу' : 'Новая задача'}
      </h3>

      <div style={{ display:'grid', gap:12 }}>
        {/* Название */}
        <div>
          <label style={labelStyle}>Название задачи *</label>
          <input value={form.title} onChange={set('title')} placeholder="Что нужно сделать?"
            style={{ ...inputStyle, width:'100%' }} />
        </div>

        {/* Описание */}
        <div>
          <label style={labelStyle}>Описание</label>
          <textarea value={form.description} onChange={set('description')}
            placeholder="Подробности задачи..."
            style={{ ...inputStyle, width:'100%', minHeight:80, resize:'vertical' }} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap:12 }}>
          {/* Исполнитель */}
          <div>
            <label style={labelStyle}>Исполнитель *</label>
            <select value={form.assignee_id} onChange={set('assignee_id')} style={{ ...inputStyle, width:'100%' }}>
              <option value=''>— Выберите —</option>
              {employees.map(e => (
                <option key={e.id} value={e.id}>{e.full_name} {e.position ? `(${e.position})` : ''}</option>
              ))}
            </select>
          </div>

          {/* Приоритет */}
          <div>
            <label style={labelStyle}>Приоритет</label>
            <select value={form.priority} onChange={set('priority')} style={{ ...inputStyle, width:'100%' }}>
              <option value='low'>Низкий</option>
              <option value='medium'>Средний</option>
              <option value='high'>Высокий</option>
              <option value='urgent'>🚨 Срочный</option>
            </select>
          </div>

          {/* Цех */}
          <div>
            <label style={labelStyle}>Цех (опционально)</label>
            <select value={form.workshop_id} onChange={set('workshop_id')} style={{ ...inputStyle, width:'100%' }}>
              <option value=''>— Не привязывать —</option>
              {workshops.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>

          {/* Срок */}
          <div>
            <label style={labelStyle}>Срок выполнения</label>
            <input type='date' value={form.due_date} onChange={set('due_date')}
              style={{ ...inputStyle, width:'100%' }} />
          </div>
        </div>

        {/* Создатель */}
        <div className="w-full sm:w-1/2">
          <label style={labelStyle}>Создал (ваше имя)</label>
          <input value={form.created_by} onChange={set('created_by')}
            placeholder="Иванов И.И."
            style={{ ...inputStyle, width:'100%' }} />
        </div>
      </div>

      <div style={{ display:'flex', gap:8, marginTop:16 }}>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          style={{ padding:'8px 20px', background:'#4f46e5', color:'#fff',
            border:'none', borderRadius:6, cursor:'pointer', fontWeight:'bold', minHeight:44 }}
        >
          {submitting ? 'Сохранение...' : initialData ? 'Сохранить' : 'Создать задачу'}
        </button>
        <button onClick={onClose}
          style={{ padding:'8px 16px', background:'#f0f0f0', border:'1px solid #ccc',
            borderRadius:6, cursor:'pointer', minHeight:44 }}>
          Отмена
        </button>
      </div>
    </div>
  );
}

const labelStyle = { display:'block', fontSize:13, color:'#555', marginBottom:4, fontWeight:'500' };
const inputStyle  = { padding:'10px', border:'1px solid #dee2e6', borderRadius:6, fontSize:16, boxSizing:'border-box' };
