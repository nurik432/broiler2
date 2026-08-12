// src/pages/employees/HireFireTab.jsx

import { useState, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import PersonAutocomplete from '../../components/PersonAutocomplete';

export default function HireFireTab({ persons, activeBatches, fetchPersons }) {
    const [selectedPerson, setSelectedPerson] = useState(null);
    const [showArchived, setShowArchived] = useState(false);

    // Состояния для редактирования (мы редактируем последнюю/активную запись)
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState('');
    const [editPosition, setEditPosition] = useState('');
    const [editStartDate, setEditStartDate] = useState('');
    const [editEndDate, setEditEndDate] = useState('');
    const [editBatchId, setEditBatchId] = useState('');
    const [editRate, setEditRate] = useState('');
    const [editAbsentDays, setEditAbsentDays] = useState('');
    const [editSalaryTiers, setEditSalaryTiers] = useState([]);
    const [isSaving, setIsSaving] = useState(false);

    // Добавление нового периода
    const [isAddingPeriod, setIsAddingPeriod] = useState(false);
    const [newPeriodPosition, setNewPeriodPosition] = useState('');
    const [newPeriodStartDate, setNewPeriodStartDate] = useState(new Date().toISOString().slice(0, 10));
    const [newPeriodEndDate, setNewPeriodEndDate] = useState('');
    const [newPeriodBatchId, setNewPeriodBatchId] = useState('');
    const [newPeriodRate, setNewPeriodRate] = useState('');
    const [newPeriodSalaryTiers, setNewPeriodSalaryTiers] = useState([]);

    // Удаление
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    // Повторный приём
    const [isRehiring, setIsRehiring] = useState(false);
    const [rehirePosition, setRehirePosition] = useState('');
    const [rehireStartDate, setRehireStartDate] = useState(new Date().toISOString().slice(0, 10));
    const [rehireBatchId, setRehireBatchId] = useState('');

    // Объединение дублей физлиц
    const [isMerging, setIsMerging] = useState(false);
    const [mergeSearchText, setMergeSearchText] = useState('');
    const [mergeTarget, setMergeTarget] = useState(null);

    const filteredPersons = useMemo(() => {
        if (!persons) return [];
        return persons.filter(person => {
            if (showArchived) return true;
            if (!person.employees || person.employees.length === 0) return false;
            
            return person.employees.some(emp => {
                const batchIsActive = emp.broiler_batches?.is_active;
                const empIsActive = emp.is_active !== false && !emp.end_date;
                return empIsActive && (batchIsActive === true || batchIsActive === undefined);
            });
        });
    }, [persons, showArchived]);

    // Получаем последнюю запись о работе
    const recentEmployment = selectedPerson?.employees?.[0];
    const isEmployeeFired = !recentEmployment || recentEmployment.is_active === false || !!recentEmployment.end_date;
    const employeeBatch = recentEmployment?.broiler_batches;

    const handleStartEdit = () => {
        if (selectedPerson) {
            setEditName(selectedPerson.full_name);
            if (recentEmployment) {
                setEditPosition(recentEmployment.position || '');
                setEditStartDate(recentEmployment.start_date || new Date().toISOString().slice(0, 10));
                setEditEndDate(recentEmployment.end_date || '');
                setEditBatchId(recentEmployment.batch_id || '');
                setEditRate(recentEmployment.rate ?? '');
                setEditAbsentDays(recentEmployment.absent_days ?? 0);
                const tiers = Array.isArray(recentEmployment.salary_tiers) && recentEmployment.salary_tiers.length > 0
                    ? recentEmployment.salary_tiers
                    : (Number(recentEmployment.first_days_n) > 0 ? [{ days: recentEmployment.first_days_n, rate: recentEmployment.fixed_sum || 0 }] : []);
                setEditSalaryTiers(tiers.map(t => ({ days: String(t.days || ''), rate: String(t.rate || '') })));
            }
            setIsEditing(true);
            setIsRehiring(false);
            setIsMerging(false);
        }
    };

    const handleCancelEdit = () => {
        setIsEditing(false);
    };

    const handleSaveEdit = async (e) => {
        e.preventDefault();
        if (!selectedPerson || !recentEmployment) return;
        setIsSaving(true);
        
        if (editName !== selectedPerson.full_name) {
             await supabase.from('persons').update({ full_name: editName }).eq('id', selectedPerson.id);
        }

        const { error } = await supabase
            .from('employees')
            .update({
                full_name: editName,
                position: editPosition,
                start_date: editStartDate,
                end_date: editEndDate || null,
                batch_id: editBatchId || null,
                rate: Number(editRate) || 0,
                absent_days: Number(editAbsentDays) || 0,
                is_active: !editEndDate,
                salary_tiers: editSalaryTiers.filter(t => Number(t.days) > 0).map(t => ({ days: Number(t.days), rate: Number(t.rate) || 0 }))
            })
            .eq('id', recentEmployment.id);

        if (error) {
            alert('Ошибка при сохранении: ' + error.message);
        } else {
            await fetchPersons();
            setSelectedPerson(null); // Сбросим выделение, чтобы обновить стейт
            setIsEditing(false);
        }
        setIsSaving(false);
    };

    const handleFireEmployee = async () => {
        if (!selectedPerson || !recentEmployment) return;
        const today = new Date().toISOString().slice(0, 10);
        setIsSaving(true);
        const { error } = await supabase
            .from('employees')
            .update({ end_date: today, is_active: false })
            .eq('id', recentEmployment.id);

        if (error) {
            alert('Ошибка: ' + error.message);
        } else {
            await fetchPersons();
            setSelectedPerson(null);
        }
        setIsSaving(false);
    };

    const handleStartRehire = () => {
        setRehirePosition(recentEmployment?.position || '');
        setRehireStartDate(new Date().toISOString().slice(0, 10));
        setRehireBatchId('');
        setIsRehiring(true);
        setIsEditing(false);
        setIsAddingPeriod(false);
    };

    const handleCancelRehire = () => setIsRehiring(false);

    const handleConfirmRehire = async (e) => {
        e.preventDefault();
        if (!selectedPerson) return;
        setIsSaving(true);
        const { data: { user } } = await supabase.auth.getUser();

        const { error } = await supabase
            .from('employees')
            .insert({
                person_id: selectedPerson.id,
                full_name: selectedPerson.full_name,
                position: rehirePosition,
                start_date: rehireStartDate,
                end_date: null,
                batch_id: rehireBatchId || null,
                is_active: true,
                user_id: user?.id,
                rate: recentEmployment?.rate || 0,
                salary_tiers: recentEmployment?.salary_tiers || []
            });

        if (error) {
            if (error.code === '23505') {
                alert('У этого физлица уже есть активный период работы.');
            } else {
                alert('Ошибка: ' + error.message);
            }
        } else {
            await fetchPersons();
            setSelectedPerson(null);
            setIsRehiring(false);
        }
        setIsSaving(false);
    };

    const handleStartMerge = () => {
        setMergeSearchText('');
        setMergeTarget(null);
        setIsMerging(true);
        setIsEditing(false);
        setIsAddingPeriod(false);
        setIsRehiring(false);
    };

    const handleCancelMerge = () => {
        setIsMerging(false);
        setMergeTarget(null);
        setMergeSearchText('');
    };

    const handleConfirmMerge = async () => {
        if (!selectedPerson || !mergeTarget) return;
        if (mergeTarget.id === selectedPerson.id) {
            alert('Нельзя объединить физлицо само с собой.');
            return;
        }

        const targetHasOpenPeriod = mergeTarget.employees?.some(e => e.is_active !== false && !e.end_date);
        const selectedHasOpenPeriod = selectedPerson.employees?.some(e => e.is_active !== false && !e.end_date);
        if (targetHasOpenPeriod && selectedHasOpenPeriod) {
            alert('У обоих физлиц есть активный (неувольненный) период работы. Сначала уволить один из них, потом объединять.');
            return;
        }

        const periodsCount = mergeTarget.employees?.length || 0;
        if (!window.confirm(
            `Объединить «${mergeTarget.full_name}» с «${selectedPerson.full_name}»?\n\n` +
            `Вся история работы «${mergeTarget.full_name}» (${periodsCount} период(ов)) будет перенесена в карточку ` +
            `«${selectedPerson.full_name}», а физлицо «${mergeTarget.full_name}» будет удалено безвозвратно.`
        )) return;

        setIsSaving(true);

        const { error: reparentError } = await supabase
            .from('employees')
            .update({ person_id: selectedPerson.id, full_name: selectedPerson.full_name })
            .eq('person_id', mergeTarget.id);

        if (reparentError) {
            if (reparentError.code === '23505') {
                alert('Не удалось объединить: у обоих физлиц есть активный период работы. Сначала уволить один из них.');
            } else {
                alert('Ошибка при переносе карточек: ' + reparentError.message);
            }
            setIsSaving(false);
            return;
        }

        const { error: deleteError } = await supabase.from('persons').delete().eq('id', mergeTarget.id);
        if (deleteError) {
            alert('Карточки перенесены, но не удалось удалить дубль физлица: ' + deleteError.message);
        }

        await fetchPersons();
        setSelectedPerson(null);
        setIsMerging(false);
        setMergeTarget(null);
        setMergeSearchText('');
        setIsSaving(false);
    };

    const handleDeletePerson = async () => {
        if (!selectedPerson) return;
        setIsDeleting(true);

        // Just delete the person — ON DELETE CASCADE will remove employees and their salaries automatically
        const { error: personError } = await supabase.from('persons').delete().eq('id', selectedPerson.id);
        if (personError) {
            alert('Ошибка при удалении: ' + personError.message);
        } else {
            await fetchPersons();
            setSelectedPerson(null);
            setShowDeleteConfirm(false);
            setIsEditing(false);
        }
        setIsDeleting(false);
    };

    const handleStartAddPeriod = () => {
        setNewPeriodPosition(recentEmployment?.position || '');
        setNewPeriodStartDate(new Date().toISOString().slice(0, 10));
        setNewPeriodEndDate('');
        setNewPeriodBatchId('');
        setNewPeriodRate(recentEmployment?.rate || '');
        const tiers = Array.isArray(recentEmployment?.salary_tiers) ? recentEmployment.salary_tiers.map(t => ({ days: String(t.days || ''), rate: String(t.rate || '') })) : [];
        setNewPeriodSalaryTiers(tiers);
        setIsAddingPeriod(true);
        setIsEditing(false);
        setIsRehiring(false);
        setIsMerging(false);
    };

    const handleCancelAddPeriod = () => {
        setIsAddingPeriod(false);
    };

    const handleSaveNewPeriod = async (e) => {
        e.preventDefault();
        if (!selectedPerson) return;
        setIsSaving(true);

        try {
            const { data: { user } } = await supabase.auth.getUser();

            const { error } = await supabase.from('employees').insert({
                person_id: selectedPerson.id,
                full_name: selectedPerson.full_name,
                position: newPeriodPosition,
                start_date: newPeriodStartDate,
                end_date: newPeriodEndDate || null,
                batch_id: newPeriodBatchId || null,
                rate: Number(newPeriodRate) || 0,
                is_active: !newPeriodEndDate,
                user_id: user?.id,
                salary_tiers: newPeriodSalaryTiers.filter(t => Number(t.days) > 0).map(t => ({ days: Number(t.days), rate: Number(t.rate) || 0 })),
            });

            if (error) {
                if (error.code === '23505') {
                    alert('У этого физлица уже есть активный период работы. Сначала уволить его.');
                } else {
                    alert('Ошибка при добавлении периода: ' + error.message);
                }
            } else {
                await fetchPersons();
                setSelectedPerson(null);
                setIsAddingPeriod(false);
            }
        } catch (err) {
            alert('Произошла ошибка: ' + err.message);
        }
        setIsSaving(false);
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-1">
                <div className="bg-white p-5 rounded-2xl shadow-lg border border-gray-100">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-lg font-bold text-gray-800">Сотрудники</h2>
                        <label className="flex items-center text-xs text-gray-500 cursor-pointer gap-1.5 select-none">
                            <input
                                type="checkbox"
                                checked={showArchived}
                                onChange={() => setShowArchived(!showArchived)}
                                className="rounded border-gray-300 text-indigo-600"
                            />
                            <span>Уволенные</span>
                        </label>
                    </div>
                    <ul className="space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto">
                        {filteredPersons.map(person => {
                            const latestEmp = person.employees?.[0];
                            const batch = latestEmp?.broiler_batches;
                            const isArchived = !latestEmp || latestEmp.is_active === false || batch?.is_active === false;
                            
                            return (
                                <li
                                    key={person.id}
                                    onClick={() => {
                                        setSelectedPerson(person);
                                        setIsEditing(false);
                                        setShowDeleteConfirm(false);
                                        setIsAddingPeriod(false);
                                        setIsRehiring(false);
                                        setIsMerging(false);
                                    }}
                                    className={`p-3 rounded-xl cursor-pointer transition-all border ${
                                        selectedPerson?.id === person.id
                                            ? 'bg-indigo-50 border-indigo-400 shadow-sm'
                                            : isArchived
                                                ? 'bg-gray-50 border-gray-200 opacity-60 hover:opacity-80 hover:bg-gray-100'
                                                : 'border-gray-100 hover:bg-gray-50 hover:border-gray-200'
                                    }`}
                                >
                                    <div className="flex justify-between items-start">
                                        <p className="font-bold text-sm">{person.full_name}</p>
                                        {isArchived && (
                                            <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">уволен</span>
                                        )}
                                    </div>
                                    {latestEmp?.position && <p className="text-xs text-gray-500 mt-0.5">{latestEmp.position}</p>}
                                    {batch && (
                                        <p className={`text-xs mt-1.5 px-2 py-0.5 rounded-full inline-block ${
                                            batch.is_active ? 'bg-purple-100 text-purple-700' : 'bg-gray-200 text-gray-500'
                                        }`}>
                                            {batch.batch_name} {!batch.is_active && '(архив)'}
                                        </p>
                                    )}
                                </li>
                            );
                        })}
                        {filteredPersons.length === 0 && (
                            <p className="text-sm text-gray-400 text-center py-8">Нет сотрудников</p>
                        )}
                    </ul>
                </div>
            </div>

            <div className="md:col-span-2">
                {selectedPerson ? (
                    <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100">
                        <div className="flex flex-wrap justify-between items-start mb-6 gap-4">
                            <div>
                                <h2 className="text-2xl font-bold text-gray-800">
                                    <span className="text-indigo-600">{selectedPerson.full_name}</span>
                                </h2>
                                {recentEmployment?.position && (
                                    <p className="text-sm text-gray-500 mt-0.5">{recentEmployment.position}</p>
                                )}
                                
                                {isEmployeeFired ? (
                                    <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-700">
                                        🔴 В данный момент уволен
                                    </div>
                                ) : (
                                    <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-700">
                                        🟢 Работает (c {new Date(recentEmployment.start_date).toLocaleDateString()})
                                    </div>
                                )}
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={handleStartEdit}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 text-sm font-medium transition-colors shadow-sm"
                                >
                                    ✏️ Редактировать текущий период
                                </button>
                                {isEmployeeFired ? (
                                    <button
                                        onClick={handleStartRehire}
                                        disabled={isSaving}
                                        className="px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 text-sm font-medium transition-colors shadow-sm disabled:bg-gray-300"
                                    >
                                        🔄 Принять заново
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => {
                                            if (confirm('Уволить сотрудника ' + selectedPerson.full_name + '?')) {
                                                handleFireEmployee();
                                            }
                                        }}
                                        disabled={isSaving}
                                        className="px-4 py-2 bg-orange-600 text-white rounded-xl hover:bg-orange-700 text-sm font-medium transition-colors shadow-sm disabled:bg-gray-300"
                                    >
                                        📤 Уволить
                                    </button>
                                )}
                                <button
                                    onClick={() => setShowDeleteConfirm(true)}
                                    className="px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 text-sm font-medium transition-colors shadow-sm"
                                >
                                    🗑 Удалить
                                </button>
                                <button
                                    onClick={handleStartAddPeriod}
                                    className="px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 text-sm font-medium transition-colors shadow-sm"
                                >
                                    ➕ Добавить период
                                </button>
                                <button
                                    onClick={handleStartMerge}
                                    className="px-4 py-2 bg-purple-600 text-white rounded-xl hover:bg-purple-700 text-sm font-medium transition-colors shadow-sm"
                                >
                                    🔗 Объединить с другим физлицом
                                </button>
                            </div>
                        </div>

                        {showDeleteConfirm && (
                            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                                <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl">
                                    <h3 className="text-lg font-bold text-gray-900 mb-2">Удалить сотрудника?</h3>
                                    <p className="text-sm text-gray-600 mb-4">Будут удалены все периоды работы и история выплат.</p>
                                    <div className="flex gap-3">
                                        <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 px-4 py-2 bg-gray-100 rounded-xl">Отмена</button>
                                        <button onClick={handleDeletePerson} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-xl">Удалить</button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {isRehiring && (
                            <form onSubmit={handleConfirmRehire} className="mb-6 pb-6 border-b bg-green-50 p-5 rounded-xl">
                                <h3 className="font-bold mb-4 text-lg text-gray-800">🔄 Принять заново: {selectedPerson.full_name}</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                                    <div>
                                        <label className="text-sm font-semibold">Должность</label>
                                        <input type="text" value={rehirePosition} onChange={e => setRehirePosition(e.target.value)} className="w-full p-2.5 border rounded-xl mt-1" />
                                    </div>
                                    <div>
                                        <label className="text-sm font-semibold">Дата начала работы</label>
                                        <input type="date" value={rehireStartDate} onChange={e => setRehireStartDate(e.target.value)} required className="w-full p-2.5 border rounded-xl mt-1" />
                                    </div>
                                    <div className="sm:col-span-2">
                                        <label className="text-sm font-semibold text-indigo-700">Партия / цех</label>
                                        <select value={rehireBatchId} onChange={e => setRehireBatchId(e.target.value)} className="w-full p-2.5 border-2 border-indigo-200 rounded-xl mt-1">
                                            <option value="">— Без партии —</option>
                                            {activeBatches.map(b => <option key={b.id} value={b.id}>{b.batch_name}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <p className="text-xs text-gray-400 mb-4">Ставка и ступени оплаты подтянутся из последнего периода работы автоматически.</p>
                                <div className="flex gap-3">
                                    <button type="submit" disabled={isSaving} className="bg-green-600 text-white px-5 py-2.5 rounded-xl font-medium shadow-sm disabled:bg-gray-300">
                                        {isSaving ? 'Сохранение...' : 'Принять на работу'}
                                    </button>
                                    <button type="button" onClick={handleCancelRehire} className="bg-gray-200 px-5 py-2.5 rounded-xl font-medium">Отмена</button>
                                </div>
                            </form>
                        )}

                        {isMerging && (
                            <div className="mb-6 pb-6 border-b bg-purple-50 p-5 rounded-xl">
                                <h3 className="font-bold mb-2 text-lg text-gray-800">🔗 Объединить «{selectedPerson.full_name}» с дублем</h3>
                                <p className="text-sm text-gray-600 mb-4">
                                    Найдите физлицо, которое на самом деле является тем же человеком. Вся его история работы
                                    переедет в текущую карточку «{selectedPerson.full_name}», а дубль будет удалён.
                                </p>
                                <PersonAutocomplete
                                    persons={persons}
                                    value={mergeSearchText}
                                    onChange={(text) => { setMergeSearchText(text); setMergeTarget(null); }}
                                    onSelectExisting={(p) => { setMergeTarget(p); setMergeSearchText(p.full_name); }}
                                    excludeId={selectedPerson.id}
                                    placeholder="Введите ФИО дубля..."
                                />
                                {mergeTarget && (
                                    <p className="text-xs text-purple-700 mt-2">
                                        ✓ Выбран дубль: «{mergeTarget.full_name}» ({mergeTarget.employees?.length || 0} период(ов) работы будет перенесено)
                                    </p>
                                )}
                                <div className="flex gap-3 mt-4">
                                    <button
                                        type="button"
                                        onClick={handleConfirmMerge}
                                        disabled={!mergeTarget || isSaving}
                                        className="bg-purple-600 text-white px-5 py-2.5 rounded-xl font-medium shadow-sm disabled:bg-gray-300"
                                    >
                                        {isSaving ? 'Объединение...' : 'Объединить'}
                                    </button>
                                    <button type="button" onClick={handleCancelMerge} className="bg-gray-200 px-5 py-2.5 rounded-xl font-medium">Отмена</button>
                                </div>
                            </div>
                        )}

                        {isEditing && (
                            <form onSubmit={handleSaveEdit} className="mb-6 pb-6 border-b bg-blue-50 p-5 rounded-xl">
                                <h3 className="font-bold mb-4 text-lg text-gray-800">✏️ Редактирование последнего периода работы</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                                    <div><label className="text-sm font-semibold">ФИО</label><input type="text" value={editName} onChange={e => setEditName(e.target.value)} required className="w-full p-2.5 border rounded-xl mt-1" /></div>
                                    <div><label className="text-sm font-semibold">Должность</label><input type="text" value={editPosition} onChange={e => setEditPosition(e.target.value)} className="w-full p-2.5 border rounded-xl mt-1" /></div>
                                    <div><label className="text-sm font-semibold">Дата начала работы</label><input type="date" value={editStartDate} onChange={e => setEditStartDate(e.target.value)} required className="w-full p-2.5 border rounded-xl mt-1" /></div>
                                    <div><label className="text-sm font-semibold text-red-600">Дата увольнения</label><input type="date" value={editEndDate} onChange={e => setEditEndDate(e.target.value)} className="w-full p-2.5 border border-red-200 rounded-xl mt-1" /></div>
                                    <div>
                                        <label className="text-sm font-semibold text-indigo-700">Партия</label>
                                        <select value={editBatchId} onChange={e => setEditBatchId(e.target.value)} className="w-full p-2.5 border-2 border-indigo-200 rounded-xl mt-1">
                                            <option value="">— Без партии —</option>
                                            {activeBatches.map(b => <option key={b.id} value={b.id}>{b.batch_name}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
                                    <div><label className="text-sm font-medium">Основная ставка/день</label><input type="number" step="0.01" value={editRate} onChange={e => setEditRate(e.target.value)} className="w-full p-2.5 border rounded-xl mt-1" /></div>
                                    <div><label className="text-sm font-medium">Дней отсутствия</label><input type="number" value={editAbsentDays} onChange={e => setEditAbsentDays(e.target.value)} className="w-full p-2.5 border rounded-xl mt-1" /></div>
                                </div>

                                {/* Ступени ставок */}
                                <div className="mt-4 p-4 bg-white rounded-xl border border-blue-200">
                                    <div className="flex justify-between items-center mb-3">
                                        <label className="text-sm font-semibold text-indigo-700">📊 Ступени ставок (первые N дней по другой ставке)</label>
                                        <button
                                            type="button"
                                            onClick={() => setEditSalaryTiers([...editSalaryTiers, { days: '', rate: '' }])}
                                            className="text-xs px-3 py-1 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 font-medium"
                                        >
                                            + Добавить ступень
                                        </button>
                                    </div>
                                    {editSalaryTiers.length === 0 ? (
                                        <p className="text-xs text-gray-400">Нет ступеней — все дни по основной ставке ({editRate || 0}/день)</p>
                                    ) : (
                                        <div className="space-y-2">
                                            {editSalaryTiers.map((tier, idx) => (
                                                <div key={idx} className="flex items-center gap-2">
                                                    <span className="text-xs text-gray-500 w-6 text-center font-medium">{idx + 1}.</span>
                                                    <div className="flex-1">
                                                        <input
                                                            type="number"
                                                            placeholder="Дней"
                                                            value={tier.days}
                                                            onChange={e => {
                                                                const updated = [...editSalaryTiers];
                                                                updated[idx] = { ...updated[idx], days: e.target.value };
                                                                setEditSalaryTiers(updated);
                                                            }}
                                                            className="w-full p-2 border rounded-lg text-sm"
                                                        />
                                                    </div>
                                                    <span className="text-xs text-gray-500">дн. по</span>
                                                    <div className="flex-1">
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            placeholder="Ставка"
                                                            value={tier.rate}
                                                            onChange={e => {
                                                                const updated = [...editSalaryTiers];
                                                                updated[idx] = { ...updated[idx], rate: e.target.value };
                                                                setEditSalaryTiers(updated);
                                                            }}
                                                            className="w-full p-2 border rounded-lg text-sm"
                                                        />
                                                    </div>
                                                    <span className="text-xs text-gray-500">/день</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => setEditSalaryTiers(editSalaryTiers.filter((_, i) => i !== idx))}
                                                        className="text-red-400 hover:text-red-600 text-sm"
                                                    >
                                                        ✕
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    <p className="text-xs text-gray-400 mt-2">Остальные дни оплачиваются по основной ставке ({editRate || 0}/день)</p>
                                </div>
                                <div className="flex gap-3 mt-4">
                                    <button type="submit" disabled={isSaving} className="bg-green-600 text-white px-5 py-2.5 rounded-xl font-medium shadow-sm">Сохранить</button>
                                    <button type="button" onClick={handleCancelEdit} className="bg-gray-200 px-5 py-2.5 rounded-xl font-medium">Отмена</button>
                                </div>
                            </form>
                        )}

                        {isAddingPeriod && (
                            <form onSubmit={handleSaveNewPeriod} className="mb-6 pb-6 border-b bg-emerald-50 p-5 rounded-xl">
                                <h3 className="font-bold mb-4 text-lg text-gray-800">➕ Добавить новый период работы</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                                    <div>
                                        <label className="text-sm font-semibold">Должность</label>
                                        <input type="text" value={newPeriodPosition} onChange={e => setNewPeriodPosition(e.target.value)} className="w-full p-2.5 border rounded-xl mt-1" />
                                    </div>
                                    <div>
                                        <label className="text-sm font-semibold">Партия</label>
                                        <select value={newPeriodBatchId} onChange={e => setNewPeriodBatchId(e.target.value)} className="w-full p-2.5 border-2 border-emerald-200 rounded-xl mt-1">
                                            <option value="">— Без партии —</option>
                                            {activeBatches.map(b => <option key={b.id} value={b.id}>{b.batch_name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-sm font-semibold">Дата начала</label>
                                        <input type="date" value={newPeriodStartDate} onChange={e => setNewPeriodStartDate(e.target.value)} required className="w-full p-2.5 border rounded-xl mt-1" />
                                    </div>
                                    <div>
                                        <label className="text-sm font-semibold text-red-600">Дата окончания</label>
                                        <input type="date" value={newPeriodEndDate} onChange={e => setNewPeriodEndDate(e.target.value)} className="w-full p-2.5 border border-red-200 rounded-xl mt-1" />
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium">Основная ставка/день</label>
                                        <input type="number" step="0.01" value={newPeriodRate} onChange={e => setNewPeriodRate(e.target.value)} className="w-full p-2.5 border rounded-xl mt-1" />
                                    </div>
                                </div>

                                {/* Ступени ставок для нового периода */}
                                <div className="mt-4 p-4 bg-white rounded-xl border border-emerald-200">
                                    <div className="flex justify-between items-center mb-3">
                                        <label className="text-sm font-semibold text-emerald-700">📊 Ступени ставок</label>
                                        <button
                                            type="button"
                                            onClick={() => setNewPeriodSalaryTiers([...newPeriodSalaryTiers, { days: '', rate: '' }])}
                                            className="text-xs px-3 py-1 bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 font-medium"
                                        >
                                            + Добавить ступень
                                        </button>
                                    </div>
                                    {newPeriodSalaryTiers.length === 0 ? (
                                        <p className="text-xs text-gray-400">Нет ступеней — все дни по основной ставке</p>
                                    ) : (
                                        <div className="space-y-2">
                                            {newPeriodSalaryTiers.map((tier, idx) => (
                                                <div key={idx} className="flex items-center gap-2">
                                                    <span className="text-xs text-gray-500 w-6 text-center font-medium">{idx + 1}.</span>
                                                    <div className="flex-1">
                                                        <input
                                                            type="number"
                                                            placeholder="Дней"
                                                            value={tier.days}
                                                            onChange={e => {
                                                                const updated = [...newPeriodSalaryTiers];
                                                                updated[idx] = { ...updated[idx], days: e.target.value };
                                                                setNewPeriodSalaryTiers(updated);
                                                            }}
                                                            className="w-full p-2 border rounded-lg text-sm"
                                                        />
                                                    </div>
                                                    <span className="text-xs text-gray-500">дн. по</span>
                                                    <div className="flex-1">
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            placeholder="Ставка"
                                                            value={tier.rate}
                                                            onChange={e => {
                                                                const updated = [...newPeriodSalaryTiers];
                                                                updated[idx] = { ...updated[idx], rate: e.target.value };
                                                                setNewPeriodSalaryTiers(updated);
                                                            }}
                                                            className="w-full p-2 border rounded-lg text-sm"
                                                        />
                                                    </div>
                                                    <span className="text-xs text-gray-500">/день</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => setNewPeriodSalaryTiers(newPeriodSalaryTiers.filter((_, i) => i !== idx))}
                                                        className="text-red-400 hover:text-red-600 text-sm"
                                                    >
                                                        ✕
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    <p className="text-xs text-gray-400 mt-2">Остальные дни оплачиваются по основной ставке ({newPeriodRate || 0}/день)</p>
                                </div>
                                <div className="flex gap-3 mt-4">
                                    <button type="submit" disabled={isSaving} className="bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-medium shadow-sm hover:bg-emerald-700 disabled:bg-gray-300">
                                        {isSaving ? 'Сохранение...' : 'Сохранить период'}
                                    </button>
                                    <button type="button" onClick={handleCancelAddPeriod} className="bg-gray-200 px-5 py-2.5 rounded-xl font-medium">Отмена</button>
                                </div>
                            </form>
                        )}

                        {!isEditing && (
                            <div className="mt-8">
                                <h3 className="text-lg font-bold text-gray-800 mb-4">История работы (Периоды)</h3>
                                {selectedPerson.employees && selectedPerson.employees.length > 0 ? (
                                    <div className="space-y-3">
                                        {selectedPerson.employees.map((emp, index) => (
                                            <div key={emp.id} className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <span className="font-semibold text-indigo-700">
                                                            {emp.position || 'Должность не указана'}
                                                        </span>
                                                        <p className="text-sm text-gray-600 mt-1">
                                                            📅 {new Date(emp.start_date).toLocaleDateString()} — {emp.end_date ? new Date(emp.end_date).toLocaleDateString() : 'По настоящее время'}
                                                        </p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-sm font-medium text-gray-800">Ставка: {emp.rate} TJS/день</p>
                                                        {emp.broiler_batches && (
                                                            <p className="text-xs text-gray-500 mt-1">Партия: {emp.broiler_batches.batch_name}</p>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm text-gray-500">Нет записей о периодах работы.</p>
                                )}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center bg-white p-12 rounded-2xl shadow-lg min-h-[400px]">
                        <p className="text-gray-500 text-lg">Выберите сотрудника</p>
                    </div>
                )}
            </div>
        </div>
    );
}
