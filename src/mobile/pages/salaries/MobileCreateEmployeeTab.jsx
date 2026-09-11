// src/mobile/pages/salaries/MobileCreateEmployeeTab.jsx
import { useState } from 'react';
import { supabase } from '../../../supabaseClient';
import Card from '../../components/Card';
import FormField from '../../components/FormField';
import NamePicker from '../../components/NamePicker';

const fieldClass = 'w-full rounded-xl px-3 bg-tg-secondary text-tg-text';

export default function MobileCreateEmployeeTab({ activeBatches, fetchPersons, persons }) {
  const [nameInput, setNameInput] = useState('');
  const [personChoice, setPersonChoice] = useState(null); // { mode: 'existing', person } | { mode: 'new', name }
  const [position, setPosition] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [batchId, setBatchId] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  function handleNameChange(text) {
    setNameInput(text);
    setPersonChoice(null);
  }

  async function handleAdd() {
    if (!personChoice) { window.alert('Выберите физлицо из списка или создайте новое.'); return; }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }

      let personId; let fullName;
      if (personChoice.mode === 'existing') {
        personId = personChoice.person.id;
        fullName = personChoice.person.full_name;
        const { data: openPeriods, error: checkError } = await supabase
          .from('employees').select('id').eq('person_id', personId).eq('is_active', true).is('end_date', null);
        if (checkError) throw checkError;
        if (openPeriods && openPeriods.length > 0) {
          window.alert('У этого физлица уже есть активный период работы. Сначала уволить его во вкладке «Приём и увольнение».');
          return;
        }
      } else {
        fullName = personChoice.name;
        const { data: newPerson, error: personError } = await supabase.from('persons').insert([{ full_name: fullName, user_id: user.id }]).select().single();
        if (personError) throw personError;
        personId = newPerson.id;
      }

      const { error: employeeError } = await supabase.from('employees').insert([{
        full_name: fullName, person_id: personId, position, start_date: startDate,
        batch_id: batchId || null, is_active: true, user_id: user.id,
      }]);
      if (employeeError) {
        if (employeeError.code === '23505') {
          throw new Error('У этого физлица уже есть активный период работы. Сначала уволить его во вкладке «Приём и увольнение».');
        }
        throw employeeError;
      }

      setNameInput(''); setPersonChoice(null); setPosition(''); setBatchId('');
      setStartDate(new Date().toISOString().slice(0, 10));
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      await fetchPersons();
    } catch (e) {
      window.alert('Ошибка: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {success && (
        <Card style={{ borderLeft: '4px solid #28a745' }}>
          <p className="text-sm font-semibold" style={{ color: '#28a745' }}>✅ Сотрудник добавлен!</p>
        </Card>
      )}
      <Card>
        <div className="flex flex-col gap-3">
          <FormField label="ФИО">
            <NamePicker
              items={persons || []}
              value={nameInput}
              onChange={handleNameChange}
              onSelectExisting={(p) => { setNameInput(p.full_name); setPersonChoice({ mode: 'existing', person: p }); }}
              onCreateNew={(name) => setPersonChoice({ mode: 'new', name })}
              placeholder="Начните вводить имя..."
            />
            {personChoice?.mode === 'existing' && <p className="text-xs mt-1" style={{ color: 'var(--tg-link, #4f46e5)' }}>✓ Существующее физлицо — будет добавлен новый период</p>}
            {personChoice?.mode === 'new' && <p className="text-xs mt-1" style={{ color: '#28a745' }}>✓ Будет создано новое физлицо «{personChoice.name}»</p>}
          </FormField>
          <FormField label="Должность">
            <input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="Например: рабочий, сторож" className={fieldClass} style={{ minHeight: 48 }} />
          </FormField>
          <FormField label="Дата начала работы">
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={fieldClass} style={{ minHeight: 44 }} />
          </FormField>
          <FormField label="Партия (опционально)">
            <select value={batchId} onChange={(e) => setBatchId(e.target.value)} className={fieldClass} style={{ minHeight: 44 }}>
              <option value="">— Без партии —</option>
              {activeBatches.map((b) => <option key={b.id} value={b.id}>{b.batch_name}</option>)}
            </select>
          </FormField>
          <button
            type="button" onClick={handleAdd} disabled={saving}
            className="rounded-xl px-4 py-3 text-base font-semibold bg-tg-button text-tg-button-text disabled:opacity-60"
            style={{ minHeight: 48 }}
          >
            {saving ? 'Добавление…' : '✨ Принять на работу'}
          </button>
        </div>
      </Card>
    </div>
  );
}
