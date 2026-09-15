// src/mobile/pages/salaries/MobileHireFireTab.jsx
import { useMemo, useState } from 'react';
import { supabase } from '../../../supabaseClient';
import Card from '../../components/Card';
import BottomSheet from '../../components/BottomSheet';
import ConfirmSheet from '../../components/ConfirmSheet';
import FormField from '../../components/FormField';
import NamePicker from '../../components/NamePicker';
import EmptyState from '../../components/EmptyState';

const fieldClass = 'w-full rounded-xl px-3 bg-tg-secondary text-tg-text';

function tiersToForm(tiers) {
  return (Array.isArray(tiers) ? tiers : []).map((t) => ({ days: String(t.days || ''), rate: String(t.rate || '') }));
}
function tiersFromForm(tiers) {
  return tiers.filter((t) => Number(t.days) > 0).map((t) => ({ days: Number(t.days), rate: Number(t.rate) || 0 }));
}

function TiersEditor({ tiers, setTiers, baseRate }) {
  return (
    <div className="rounded-xl bg-tg-secondary p-3">
      <div className="flex justify-between items-center mb-2">
        <p className="text-xs font-semibold text-tg-hint">📊 Ступени ставок</p>
        <button type="button" onClick={() => setTiers([...tiers, { days: '', rate: '' }])} className="text-xs px-2 py-1 rounded-lg font-medium" style={{ background: 'var(--tg-bg)', color: 'var(--tg-link, #4f46e5)' }}>
          + Добавить
        </button>
      </div>
      {tiers.length === 0 ? (
        <p className="text-xs text-tg-hint">Нет ступеней — все дни по основной ставке ({baseRate || 0}/день)</p>
      ) : (
        <div className="flex flex-col gap-2">
          {tiers.map((tier, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="text-xs text-tg-hint w-4">{idx + 1}.</span>
              <input
                type="number" placeholder="Дней" value={tier.days}
                onChange={(e) => { const u = [...tiers]; u[idx] = { ...u[idx], days: e.target.value }; setTiers(u); }}
                className={fieldClass} style={{ minHeight: 40, flex: 1 }}
              />
              <span className="text-xs text-tg-hint">дн. по</span>
              <input
                type="number" step="0.01" placeholder="Ставка" value={tier.rate}
                onChange={(e) => { const u = [...tiers]; u[idx] = { ...u[idx], rate: e.target.value }; setTiers(u); }}
                className={fieldClass} style={{ minHeight: 40, flex: 1 }}
              />
              <button type="button" onClick={() => setTiers(tiers.filter((_, i) => i !== idx))} className="text-tg-destructive px-1">✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MobileHireFireTab({ persons, activeBatches, fetchPersons }) {
  const [selectedPersonId, setSelectedPersonId] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [saving, setSaving] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState(null);

  const [addPeriodOpen, setAddPeriodOpen] = useState(false);
  const [addPeriodForm, setAddPeriodForm] = useState(null);

  const [rehireOpen, setRehireOpen] = useState(false);
  const [rehireForm, setRehireForm] = useState(null);

  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeSearchText, setMergeSearchText] = useState('');
  const [mergeTarget, setMergeTarget] = useState(null);

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [confirmFireOpen, setConfirmFireOpen] = useState(false);

  const filteredPersons = useMemo(() => {
    if (!persons) return [];
    return persons.filter((person) => {
      if (showArchived) return true;
      if (!person.employees || person.employees.length === 0) return false;
      return person.employees.some((emp) => {
        const batchIsActive = emp.broiler_batches?.is_active;
        const empIsActive = emp.is_active !== false && !emp.end_date;
        return empIsActive && (batchIsActive === true || batchIsActive === undefined);
      });
    });
  }, [persons, showArchived]);

  const selectedPerson = useMemo(() => persons?.find((p) => p.id === selectedPersonId) || null, [persons, selectedPersonId]);
  const recentEmployment = selectedPerson?.employees?.[0];
  const isEmployeeFired = !recentEmployment || recentEmployment.is_active === false || !!recentEmployment.end_date;

  function openEdit() {
    if (!recentEmployment) return;
    setEditForm({
      name: selectedPerson.full_name,
      position: recentEmployment.position || '',
      start_date: recentEmployment.start_date || new Date().toISOString().slice(0, 10),
      end_date: recentEmployment.end_date || '',
      batch_id: recentEmployment.batch_id || '',
      rate: recentEmployment.rate ?? '',
      absent_days: recentEmployment.absent_days ?? 0,
      tiers: tiersToForm(
        Array.isArray(recentEmployment.salary_tiers) && recentEmployment.salary_tiers.length > 0
          ? recentEmployment.salary_tiers
          : (Number(recentEmployment.first_days_n) > 0 ? [{ days: recentEmployment.first_days_n, rate: recentEmployment.fixed_sum || 0 }] : []),
      ),
    });
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!selectedPerson || !recentEmployment) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
      if (editForm.name !== selectedPerson.full_name) {
        const { error: nameError } = await supabase.from('persons').update({ full_name: editForm.name }).eq('id', selectedPerson.id);
        if (nameError) window.alert('Ошибка при обновлении имени: ' + nameError.message);
      }
      const { error } = await supabase.from('employees').update({
        full_name: editForm.name, position: editForm.position, start_date: editForm.start_date,
        end_date: editForm.end_date || null, batch_id: editForm.batch_id || null,
        rate: Number(editForm.rate) || 0, absent_days: Number(editForm.absent_days) || 0,
        is_active: !editForm.end_date, salary_tiers: tiersFromForm(editForm.tiers),
      }).eq('id', recentEmployment.id);
      if (error) { window.alert('Ошибка: ' + error.message); return; }
      await fetchPersons();
      setEditOpen(false);
      setSelectedPersonId(null);
    } finally {
      setSaving(false);
    }
  }

  async function fireEmployee() {
    if (!selectedPerson || !recentEmployment) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
      const { error } = await supabase.from('employees').update({ end_date: new Date().toISOString().slice(0, 10), is_active: false }).eq('id', recentEmployment.id);
      if (error) { window.alert('Ошибка: ' + error.message); return; }
      await fetchPersons();
      setSelectedPersonId(null);
    } finally {
      setSaving(false);
    }
  }

  function openRehire() {
    setRehireForm({ position: recentEmployment?.position || '', start_date: new Date().toISOString().slice(0, 10), batch_id: '' });
    setRehireOpen(true);
  }

  async function confirmRehire() {
    if (!selectedPerson) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
      const { error } = await supabase.from('employees').insert({
        person_id: selectedPerson.id, full_name: selectedPerson.full_name,
        position: rehireForm.position, start_date: rehireForm.start_date, end_date: null,
        batch_id: rehireForm.batch_id || null, is_active: true, user_id: user.id,
        rate: recentEmployment?.rate || 0, salary_tiers: recentEmployment?.salary_tiers || [],
      });
      if (error) {
        window.alert(error.code === '23505' ? 'У этого физлица уже есть активный период работы.' : 'Ошибка: ' + error.message);
        return;
      }
      await fetchPersons();
      setRehireOpen(false);
      setSelectedPersonId(null);
    } finally {
      setSaving(false);
    }
  }

  function openAddPeriod() {
    setAddPeriodForm({
      position: recentEmployment?.position || '', start_date: new Date().toISOString().slice(0, 10), end_date: '',
      batch_id: '', rate: recentEmployment?.rate || '',
      tiers: tiersToForm(recentEmployment?.salary_tiers || []),
    });
    setAddPeriodOpen(true);
  }

  async function saveAddPeriod() {
    if (!selectedPerson) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
      const { error } = await supabase.from('employees').insert({
        person_id: selectedPerson.id, full_name: selectedPerson.full_name,
        position: addPeriodForm.position, start_date: addPeriodForm.start_date,
        end_date: addPeriodForm.end_date || null, batch_id: addPeriodForm.batch_id || null,
        rate: Number(addPeriodForm.rate) || 0, is_active: !addPeriodForm.end_date, user_id: user.id,
        salary_tiers: tiersFromForm(addPeriodForm.tiers),
      });
      if (error) {
        window.alert(error.code === '23505' ? 'У этого физлица уже есть активный период работы. Сначала уволить его.' : 'Ошибка: ' + error.message);
        return;
      }
      await fetchPersons();
      setAddPeriodOpen(false);
      setSelectedPersonId(null);
    } finally {
      setSaving(false);
    }
  }

  function openMerge() {
    setMergeSearchText(''); setMergeTarget(null); setMergeOpen(true);
  }

  async function confirmMerge() {
    if (!selectedPerson || !mergeTarget) return;
    const targetOpen = mergeTarget.employees?.some((e) => e.is_active !== false && !e.end_date);
    const selectedOpen = selectedPerson.employees?.some((e) => e.is_active !== false && !e.end_date);
    if (targetOpen && selectedOpen) {
      window.alert('У обоих физлиц есть активный период работы. Сначала уволить один из них.');
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
      const { error: reparentError } = await supabase.from('employees')
        .update({ person_id: selectedPerson.id, full_name: selectedPerson.full_name })
        .eq('person_id', mergeTarget.id);
      if (reparentError) {
        window.alert(reparentError.code === '23505'
          ? 'Не удалось объединить: у обоих физлиц есть активный период работы.'
          : 'Ошибка: ' + reparentError.message);
        return;
      }
      const { error: deleteError } = await supabase.from('persons').delete().eq('id', mergeTarget.id);
      if (deleteError) window.alert('Карточки перенесены, но не удалось удалить дубль: ' + deleteError.message);
      await fetchPersons();
      setMergeOpen(false);
      setMergeTarget(null);
      setSelectedPersonId(null);
    } finally {
      setSaving(false);
    }
  }

  async function deletePerson() {
    if (!selectedPerson) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
      const { error } = await supabase.from('persons').delete().eq('id', selectedPerson.id);
      if (error) { window.alert('Ошибка: ' + error.message); return; }
      await fetchPersons();
      setConfirmDeleteOpen(false);
      setSelectedPersonId(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-2 text-sm text-tg-hint select-none">
        <input type="checkbox" checked={showArchived} onChange={() => setShowArchived((v) => !v)} />
        Показать уволенных
      </label>

      {filteredPersons.length === 0 ? (
        <EmptyState icon="👤" title="Нет сотрудников" />
      ) : (
        filteredPersons.map((person) => {
          const latestEmp = person.employees?.[0];
          const batch = latestEmp?.broiler_batches;
          const isFired = !latestEmp || latestEmp.is_active === false || !!latestEmp.end_date;
          const isExpanded = selectedPersonId === person.id;
          return (
            <Card key={person.id} onClick={() => setSelectedPersonId(isExpanded ? null : person.id)}>
              <div className="min-w-0">
                <p className="font-semibold truncate">{person.full_name}</p>
                {latestEmp?.position && <p className="text-xs text-tg-hint">{latestEmp.position}</p>}
              </div>

              <div
                className="mt-2 inline-flex items-center gap-1.5 text-xs rounded-full px-2 py-0.5 font-medium"
                style={{
                  background: isFired ? 'color-mix(in srgb, #dc3545 15%, transparent)' : 'color-mix(in srgb, #28a745 15%, transparent)',
                  color: isFired ? '#dc3545' : '#28a745',
                }}
              >
                <span>{isFired ? '🔴 Уволен' : '🟢 Работает'}</span>
                {isFired
                  ? latestEmp?.end_date && <span className="opacity-75">{new Date(latestEmp.end_date).toLocaleDateString('ru-RU')}</span>
                  : latestEmp?.start_date && <span className="opacity-75">c {new Date(latestEmp.start_date).toLocaleDateString('ru-RU')}</span>}
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

              {isExpanded && (
                <div className="mt-3 pt-3 flex flex-col gap-3" style={{ borderTop: '1px solid var(--tg-secondary-bg)' }} onClick={(e) => e.stopPropagation()}>
                  {isEmployeeFired ? (
                    <p className="text-sm font-medium" style={{ color: '#dc3545' }}>🔴 В данный момент уволен</p>
                  ) : (
                    <p className="text-sm font-medium" style={{ color: '#28a745' }}>🟢 Работает (c {new Date(recentEmployment.start_date).toLocaleDateString('ru-RU')})</p>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={openEdit} className="rounded-xl px-3 py-2 text-xs font-medium text-white" style={{ minHeight: 40, background: '#007bff' }}>✏️ Редактировать</button>
                    {isEmployeeFired ? (
                      <button type="button" onClick={openRehire} className="rounded-xl px-3 py-2 text-xs font-medium text-white" style={{ minHeight: 40, background: '#28a745' }}>🔄 Принять заново</button>
                    ) : (
                      <button type="button" onClick={() => setConfirmFireOpen(true)} className="rounded-xl px-3 py-2 text-xs font-medium text-white" style={{ minHeight: 40, background: '#fd7e14' }}>📤 Уволить</button>
                    )}
                    <button type="button" onClick={openAddPeriod} className="rounded-xl px-3 py-2 text-xs font-medium text-white" style={{ minHeight: 40, background: '#059669' }}>➕ Добавить период</button>
                    <button type="button" onClick={openMerge} className="rounded-xl px-3 py-2 text-xs font-medium text-white" style={{ minHeight: 40, background: '#9333ea' }}>🔗 Объединить</button>
                  </div>
                  <button type="button" onClick={() => setConfirmDeleteOpen(true)} className="rounded-xl px-3 py-2 text-xs font-medium text-white" style={{ minHeight: 40, background: '#dc3545' }}>🗑 Удалить</button>

                  <div>
                    <p className="text-xs font-semibold text-tg-hint mb-1">История работы</p>
                    {(person.employees || []).map((emp) => (
                      <div key={emp.id} className="rounded-lg bg-tg-secondary p-2 mb-1">
                        <p className="text-sm font-medium" style={{ color: 'var(--tg-link, #4f46e5)' }}>{emp.position || 'Должность не указана'}</p>
                        <p className="text-xs text-tg-hint">{new Date(emp.start_date).toLocaleDateString('ru-RU')} — {emp.end_date ? new Date(emp.end_date).toLocaleDateString('ru-RU') : 'По настоящее время'}</p>
                        <p className="text-xs text-tg-hint">Ставка: {emp.rate} TJS/день{emp.broiler_batches ? ` · ${emp.broiler_batches.batch_name}` : ''}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          );
        })
      )}

      <BottomSheet open={editOpen} onClose={() => setEditOpen(false)} title="Редактировать текущий период">
        {editForm && (
          <div className="flex flex-col gap-3">
            <FormField label="ФИО"><input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} className={fieldClass} style={{ minHeight: 48 }} /></FormField>
            <FormField label="Должность"><input value={editForm.position} onChange={(e) => setEditForm((f) => ({ ...f, position: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }} /></FormField>
            <FormField label="Дата начала"><input type="date" value={editForm.start_date} onChange={(e) => setEditForm((f) => ({ ...f, start_date: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }} /></FormField>
            <FormField label="Дата увольнения"><input type="date" value={editForm.end_date} onChange={(e) => setEditForm((f) => ({ ...f, end_date: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }} /></FormField>
            <FormField label="Партия">
              <select value={editForm.batch_id} onChange={(e) => setEditForm((f) => ({ ...f, batch_id: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }}>
                <option value="">— Без партии —</option>
                {activeBatches.map((b) => <option key={b.id} value={b.id}>{b.batch_name}</option>)}
              </select>
            </FormField>
            <FormField label="Основная ставка/день"><input type="number" step="0.01" value={editForm.rate} onChange={(e) => setEditForm((f) => ({ ...f, rate: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }} /></FormField>
            <FormField label="Дней отсутствия"><input type="number" value={editForm.absent_days} onChange={(e) => setEditForm((f) => ({ ...f, absent_days: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }} /></FormField>
            <TiersEditor tiers={editForm.tiers} setTiers={(tiers) => setEditForm((f) => ({ ...f, tiers }))} baseRate={editForm.rate} />
            <button type="button" onClick={saveEdit} disabled={saving} className="rounded-xl px-4 py-3 text-base font-semibold bg-tg-button text-tg-button-text disabled:opacity-60" style={{ minHeight: 48 }}>
              {saving ? 'Сохранение…' : 'Сохранить'}
            </button>
          </div>
        )}
      </BottomSheet>

      <BottomSheet open={addPeriodOpen} onClose={() => setAddPeriodOpen(false)} title="Добавить новый период">
        {addPeriodForm && (
          <div className="flex flex-col gap-3">
            <FormField label="Должность"><input value={addPeriodForm.position} onChange={(e) => setAddPeriodForm((f) => ({ ...f, position: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }} /></FormField>
            <FormField label="Дата начала"><input type="date" value={addPeriodForm.start_date} onChange={(e) => setAddPeriodForm((f) => ({ ...f, start_date: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }} /></FormField>
            <FormField label="Дата окончания"><input type="date" value={addPeriodForm.end_date} onChange={(e) => setAddPeriodForm((f) => ({ ...f, end_date: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }} /></FormField>
            <FormField label="Партия">
              <select value={addPeriodForm.batch_id} onChange={(e) => setAddPeriodForm((f) => ({ ...f, batch_id: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }}>
                <option value="">— Без партии —</option>
                {activeBatches.map((b) => <option key={b.id} value={b.id}>{b.batch_name}</option>)}
              </select>
            </FormField>
            <FormField label="Основная ставка/день"><input type="number" step="0.01" value={addPeriodForm.rate} onChange={(e) => setAddPeriodForm((f) => ({ ...f, rate: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }} /></FormField>
            <TiersEditor tiers={addPeriodForm.tiers} setTiers={(tiers) => setAddPeriodForm((f) => ({ ...f, tiers }))} baseRate={addPeriodForm.rate} />
            <button type="button" onClick={saveAddPeriod} disabled={saving} className="rounded-xl px-4 py-3 text-base font-semibold text-white disabled:opacity-60" style={{ minHeight: 48, background: '#059669' }}>
              {saving ? 'Сохранение…' : 'Сохранить период'}
            </button>
          </div>
        )}
      </BottomSheet>

      <BottomSheet open={rehireOpen} onClose={() => setRehireOpen(false)} title="Принять заново">
        {rehireForm && (
          <div className="flex flex-col gap-3">
            <FormField label="Должность"><input value={rehireForm.position} onChange={(e) => setRehireForm((f) => ({ ...f, position: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }} /></FormField>
            <FormField label="Дата начала работы"><input type="date" value={rehireForm.start_date} onChange={(e) => setRehireForm((f) => ({ ...f, start_date: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }} /></FormField>
            <FormField label="Партия / цех">
              <select value={rehireForm.batch_id} onChange={(e) => setRehireForm((f) => ({ ...f, batch_id: e.target.value }))} className={fieldClass} style={{ minHeight: 44 }}>
                <option value="">— Без партии —</option>
                {activeBatches.map((b) => <option key={b.id} value={b.id}>{b.batch_name}</option>)}
              </select>
            </FormField>
            <p className="text-xs text-tg-hint">Ставка и ступени оплаты подтянутся из последнего периода автоматически.</p>
            <button type="button" onClick={confirmRehire} disabled={saving} className="rounded-xl px-4 py-3 text-base font-semibold text-white disabled:opacity-60" style={{ minHeight: 48, background: '#28a745' }}>
              {saving ? 'Сохранение…' : 'Принять на работу'}
            </button>
          </div>
        )}
      </BottomSheet>

      <BottomSheet open={mergeOpen} onClose={() => setMergeOpen(false)} title="Объединить с другим физлицом">
        <div className="flex flex-col gap-3">
          <p className="text-sm text-tg-hint">Вся история работы дубля переедет в текущую карточку, а дубль будет удалён.</p>
          <NamePicker
            items={persons}
            value={mergeSearchText}
            onChange={(text) => { setMergeSearchText(text); setMergeTarget(null); }}
            onSelectExisting={(p) => { setMergeTarget(p); setMergeSearchText(p.full_name); }}
            excludeId={selectedPerson?.id}
            placeholder="Введите ФИО дубля..."
          />
          {mergeTarget && (
            <p className="text-xs" style={{ color: '#9333ea' }}>✓ Выбран дубль: «{mergeTarget.full_name}» ({mergeTarget.employees?.length || 0} период(ов) будет перенесено)</p>
          )}
          <button type="button" onClick={confirmMerge} disabled={!mergeTarget || saving} className="rounded-xl px-4 py-3 text-base font-semibold text-white disabled:opacity-60" style={{ minHeight: 48, background: '#9333ea' }}>
            {saving ? 'Объединение…' : 'Объединить'}
          </button>
        </div>
      </BottomSheet>

      <ConfirmSheet
        open={confirmDeleteOpen}
        title="Удалить сотрудника?"
        message="Будут удалены все периоды работы и история выплат."
        onConfirm={deletePerson}
        onClose={() => setConfirmDeleteOpen(false)}
      />

      <ConfirmSheet
        open={confirmFireOpen}
        title="Уволить сотрудника?"
        message={selectedPerson ? `${selectedPerson.full_name} будет отмечен уволенным сегодняшним числом.` : undefined}
        confirmLabel="Уволить"
        onConfirm={fireEmployee}
        onClose={() => setConfirmFireOpen(false)}
      />
    </div>
  );
}
