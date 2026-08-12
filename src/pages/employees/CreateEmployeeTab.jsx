// src/pages/employees/CreateEmployeeTab.jsx

import { useState } from 'react';
import { supabase } from '../../supabaseClient';
import PersonAutocomplete from '../../components/PersonAutocomplete';

export default function CreateEmployeeTab({ activeBatches, fetchPersons, persons }) {
    const [nameInput, setNameInput] = useState('');
    const [personChoice, setPersonChoice] = useState(null); // { mode: 'existing', person } | { mode: 'new', name }
    const [newPosition, setNewPosition] = useState('');
    const [newStartDate, setNewStartDate] = useState(new Date().toISOString().slice(0, 10));
    const [newBatchId, setNewBatchId] = useState(''); // optional
    const [isAdding, setIsAdding] = useState(false);
    const [success, setSuccess] = useState(false);

    const handleNameInputChange = (text) => {
        setNameInput(text);
        setPersonChoice(null); // любое ручное изменение текста сбрасывает предыдущий выбор
    };

    const handleSelectExisting = (person) => {
        setNameInput(person.full_name);
        setPersonChoice({ mode: 'existing', person });
    };

    const handleCreateNew = (name) => {
        setPersonChoice({ mode: 'new', name });
    };

    const handleAddEmployee = async (e) => {
        e.preventDefault();
        if (!personChoice) {
            alert('Выберите физлицо из списка или нажмите «Создать новое физлицо «...»» под полем ФИО.');
            return;
        }
        setIsAdding(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();

            let personId;
            let fullName;

            if (personChoice.mode === 'existing') {
                personId = personChoice.person.id;
                fullName = personChoice.person.full_name;

                // Предварительная проверка ради понятной ошибки — окончательная защита
                // от гонки на уровне БД (уникальный индекс employees_one_active_period_per_person)
                const { data: openPeriods, error: checkError } = await supabase
                    .from('employees')
                    .select('id')
                    .eq('person_id', personId)
                    .eq('is_active', true)
                    .is('end_date', null);
                if (checkError) throw checkError;
                if (openPeriods && openPeriods.length > 0) {
                    alert('У этого физлица уже есть активный период работы. Сначала уволить его в разделе «Принятие и увольнение».');
                    setIsAdding(false);
                    return;
                }
            } else {
                fullName = personChoice.name;
                const { data: newPersonData, error: personError } = await supabase.from('persons').insert([
                    {
                        full_name: fullName,
                        user_id: user.id
                    }
                ]).select().single();

                if (personError) throw personError;
                personId = newPersonData.id;
            }

            const { error: employeeError } = await supabase.from('employees').insert([
                {
                    full_name: fullName,
                    person_id: personId,
                    position: newPosition,
                    start_date: newStartDate,
                    batch_id: newBatchId || null,
                    is_active: true,
                    user_id: user.id,
                },
            ]);

            if (employeeError) {
                if (employeeError.code === '23505') {
                    throw new Error('У этого физлица уже есть активный период работы. Сначала уволить его в разделе «Принятие и увольнение».');
                }
                throw employeeError;
            }

            setNameInput('');
            setPersonChoice(null);
            setNewPosition('');
            setNewStartDate(new Date().toISOString().slice(0, 10));
            setNewBatchId('');
            setSuccess(true);
            setTimeout(() => setSuccess(false), 3000);
            await fetchPersons();
        } catch (error) {
            alert('Ошибка: ' + error.message);
        } finally {
            setIsAdding(false);
        }
    };

    return (
        <div className="max-w-xl mx-auto">
            <div className="bg-white p-8 rounded-2xl shadow-lg border border-gray-100">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-xl">👤</div>
                    <div>
                        <h2 className="text-2xl font-bold text-gray-800">Новый сотрудник</h2>
                        <p className="text-sm text-gray-500">Заполните данные для приёма на работу</p>
                    </div>
                </div>

                {success && (
                    <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3">
                        <span className="text-2xl">✅</span>
                        <div>
                            <p className="font-semibold text-green-800">Сотрудник добавлен!</p>
                            <p className="text-sm text-green-600">Вы можете перейти к начислению зарплаты.</p>
                        </div>
                    </div>
                )}

                <form onSubmit={handleAddEmployee} className="space-y-5">
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">ФИО</label>
                        <PersonAutocomplete
                            persons={persons || []}
                            value={nameInput}
                            onChange={handleNameInputChange}
                            onSelectExisting={handleSelectExisting}
                            onCreateNew={handleCreateNew}
                            placeholder="Начните вводить имя..."
                        />
                        {personChoice?.mode === 'existing' && (
                            <p className="text-xs text-indigo-600 mt-1.5">✓ Выбрано существующее физлицо — будет добавлен новый период работы</p>
                        )}
                        {personChoice?.mode === 'new' && (
                            <p className="text-xs text-emerald-600 mt-1.5">✓ Будет создано новое физлицо «{personChoice.name}»</p>
                        )}
                        {!personChoice && nameInput.trim() && (
                            <p className="text-xs text-gray-400 mt-1.5">Выберите физлицо из списка ниже или создайте новое</p>
                        )}
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Должность</label>
                        <input
                            type="text"
                            value={newPosition}
                            onChange={e => setNewPosition(e.target.value)}
                            placeholder="Например: рабочий, сторож, водитель"
                            className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Дата начала работы</label>
                        <input
                            type="date"
                            value={newStartDate}
                            onChange={e => setNewStartDate(e.target.value)}
                            required
                            className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-indigo-700 mb-1.5">Партия (опционально)</label>
                        <select
                            value={newBatchId}
                            onChange={e => setNewBatchId(e.target.value)}
                            className="w-full p-3 border-2 border-indigo-200 rounded-xl bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow"
                        >
                            <option value="">— Без партии —</option>
                            {activeBatches.map(b => (
                                <option key={b.id} value={b.id}>{b.batch_name}</option>
                            ))}
                        </select>
                        {activeBatches.length === 0 && (
                            <p className="text-xs text-red-500 mt-2 flex items-center gap-1">
                                <span>⚠️</span> Нет активных партий. Вы можете добавить сотрудника без партии.
                            </p>
                        )}
                    </div>

                    <button
                        type="submit"
                        disabled={isAdding}
                        className="w-full bg-indigo-600 text-white p-3 rounded-xl font-semibold hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors shadow-sm hover:shadow-md"
                    >
                        {isAdding ? (
                            <span className="flex items-center justify-center gap-2">
                                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                                Добавление...
                            </span>
                        ) : '✨ Принять на работу'}
                    </button>
                </form>
            </div>
        </div>
    );
}
