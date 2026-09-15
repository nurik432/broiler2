// src/pages/employees/SalaryTab.jsx

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { calculateSalary } from '../../utils/calculateSalary';
import EmployeeCard from '../../components/EmployeeCard';

export default function SalaryTab({ selectedPerson, setSelectedPerson, activeBatches, persons }) {
    const [editingPayment, setEditingPayment] = useState(null);
    const [editPaymentDate, setEditPaymentDate] = useState('');
    const [editPaymentAmount, setEditPaymentAmount] = useState('');
    const [editPaymentType, setEditPaymentType] = useState('аванс');
    const [isSavingPayment, setIsSavingPayment] = useState(false);
    const [isAddingPayment, setIsAddingPayment] = useState(false);
    const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
    const [paymentAmount, setPaymentAmount] = useState('');
    const [paymentType, setPaymentType] = useState('аванс');
    const [allSalaries, setAllSalaries] = useState([]);
    const [showPastPeriods, setShowPastPeriods] = useState(false);

    const loadSalaries = async () => {
        if (!selectedPerson) {
            setAllSalaries([]);
            return;
        }
        
        // Collect all employee_ids belonging to this person
        const employeeIds = (selectedPerson.employees || []).map(emp => emp.id);
        
        if (employeeIds.length === 0) {
            setAllSalaries([]);
            return;
        }
        
        const { data, error } = await supabase
            .from('salaries')
            .select(`*`) 
            .in('employee_id', employeeIds)
            .order('payment_date', { ascending: false });
        
        if (error) {
            console.error('Ошибка загрузки выплат:', error);
            setAllSalaries([]);
        } else {
            const formatted = (data || []).map(s => {
                let batchName = null;
                let batchIsActive = true;
                if (s.batch_id) {
                    const batch = activeBatches.find(b => b.id === s.batch_id);
                    if (batch) {
                        batchName = batch.batch_name;
                        batchIsActive = true;
                    } else {
                        selectedPerson.employees?.forEach(emp => {
                            if (emp.broiler_batches?.id === s.batch_id) {
                                batchName = emp.broiler_batches.batch_name;
                                batchIsActive = emp.broiler_batches.is_active;
                            }
                        });
                    }
                }
                return {
                    ...s,
                    batch_name: batchName,
                    batch_is_active: batchIsActive,
                };
            });
            setAllSalaries(formatted);
        }
    };

    useEffect(() => {
        loadSalaries();
    }, [selectedPerson]);

    // Только работающие сотрудники — для карточек
    const activePersons = useMemo(() => {
        return (persons || []).filter(p => {
            const latest = p.employees?.[0];
            if (!latest) return false;
            const isFired = latest.is_active === false || !!latest.end_date;
            return !isFired;
        });
    }, [persons]);

    // Current (most recent) employment
    const recentEmployment = selectedPerson?.employees?.[0];
    const currentEmployeeId = recentEmployment?.id;

    // Split salaries into current period and past periods
    const { currentPeriodSalaries, pastPeriodSalaries } = useMemo(() => {
        const current = [];
        const past = [];
        allSalaries.forEach(salary => {
            if (salary.employee_id === currentEmployeeId) {
                current.push(salary);
            } else {
                past.push(salary);
            }
        });
        return { currentPeriodSalaries: current, pastPeriodSalaries: past };
    }, [allSalaries, currentEmployeeId]);

    // Calculate accrued salary ONLY for the current/active period
    const currentAccruedData = useMemo(() => {
        if (!recentEmployment) return { salary: 0, effectiveDays: 0, breakdown: [] };
        
        const batch = recentEmployment.broiler_batches || {};
        const res = calculateSalary(recentEmployment, batch);
        return res;
    }, [selectedPerson, recentEmployment]);

    // Calculate totals for current period payments only
    const currentTotals = useMemo(() => {
        const totals = { totalAdvance: 0, totalSalary: 0, totalAll: 0, byBatch: {} };
        currentPeriodSalaries.forEach(salary => {
            const amount = Number(salary.amount) || 0;
            totals.totalAll += amount;
            if (salary.payment_type === 'аванс') totals.totalAdvance += amount;
            else if (salary.payment_type === 'зарплата') totals.totalSalary += amount;
            
            if (salary.batch_id && salary.batch_name) {
                if (!totals.byBatch[salary.batch_id]) {
                    totals.byBatch[salary.batch_id] = {
                        name: salary.batch_name,
                        total: 0,
                        isActive: salary.batch_is_active,
                    };
                }
                totals.byBatch[salary.batch_id].total += amount;
            }
        });
        return totals;
    }, [currentPeriodSalaries]);

    // Calculate totals for past periods
    const pastTotals = useMemo(() => {
        let total = 0;
        pastPeriodSalaries.forEach(s => { total += Number(s.amount) || 0; });
        return total;
    }, [pastPeriodSalaries]);

    // Group past salaries by employee period for display
    const pastPeriodGroups = useMemo(() => {
        if (!selectedPerson?.employees) return [];
        const pastEmployees = selectedPerson.employees.slice(1); // all except the first (current)
        
        return pastEmployees.map(emp => {
            const empSalaries = pastPeriodSalaries.filter(s => s.employee_id === emp.id);
            const empTotal = empSalaries.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
            const batch = emp.broiler_batches || {};
            const accrued = calculateSalary(emp, batch);
            
            return {
                employee: emp,
                salaries: empSalaries,
                total: empTotal,
                accrued,
                periodLabel: `${new Date(emp.start_date).toLocaleDateString()} — ${emp.end_date ? new Date(emp.end_date).toLocaleDateString() : 'По н.в.'}`,
            };
        }).filter(g => g.salaries.length > 0 || g.accrued.salary > 0);
    }, [selectedPerson, pastPeriodSalaries]);

    const handleAddPayment = async e => {
        e.preventDefault();
        if (!selectedPerson) return;
        
        setIsAddingPayment(true);
        try {
            const { data: { user }, error: authError } = await supabase.auth.getUser();
            
            const batchId = recentEmployment?.batch_id || null;
            
            const insertData = {
                employee_id: recentEmployment?.id || null, 
                amount: Number(paymentAmount),
                payment_type: paymentType,
                payment_date: paymentDate,
                batch_id: batchId,
            };
            if (user?.id) {
                insertData.user_id = user.id;
            }
            
            const { error } = await supabase.from('salaries').insert([insertData]);
            
            if (error) {
                console.error('Insert error:', error);
                alert('Ошибка: ' + error.message);
            } else {
                setPaymentAmount('');
                await loadSalaries();
            }
        } catch (err) {
            console.error('Unexpected error:', err);
            alert('Произошла непредвиденная ошибка: ' + err.message);
        } finally {
            setIsAddingPayment(false);
        }
    };

    const handleStartEditPayment = payment => {
        setEditingPayment(payment.id);
        setEditPaymentDate(payment.payment_date);
        setEditPaymentAmount(payment.amount);
        setEditPaymentType(payment.payment_type);
    };

    const handleCancelEditPayment = () => {
        setEditingPayment(null);
    };

    const handleSavePayment = async paymentId => {
        setIsSavingPayment(true);
        const { error } = await supabase
            .from('salaries')
            .update({
                payment_date: editPaymentDate,
                amount: Number(editPaymentAmount),
                payment_type: editPaymentType,
            })
            .eq('id', paymentId);
            
        if (error) alert('Ошибка при сохранении: ' + error.message);
        else {
            await loadSalaries();
            setEditingPayment(null);
        }
        setIsSavingPayment(false);
    };

    const handleDeletePayment = async paymentId => {
        if (!window.confirm('Удалить эту выплату?')) return;
        const { error } = await supabase.from('salaries').delete().eq('id', paymentId);
        if (error) alert('Ошибка при удалении: ' + error.message);
        else await loadSalaries();
    };

    const formatCurrency = amount => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'TJS' }).format(amount);

    const isEmployeeFired = !recentEmployment || recentEmployment.is_active === false || !!recentEmployment.end_date;
    const remainingToPay = Math.max(currentAccruedData.salary - currentTotals.totalAll, 0);
    const isModalOpen = !!selectedPerson && !isEmployeeFired;
    const closeModal = () => setSelectedPerson(null);

    // Helper to render a payment table
    const renderPaymentTable = (salaries, allowEdit = true) => (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="min-w-full text-left border-collapse">
                <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Дата</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Тип</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Сумма</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Партия</th>
                        {allowEdit && <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Действия</th>}
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {salaries.map(pay => (
                        <tr key={pay.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3 text-sm text-gray-800">
                                {editingPayment === pay.id ? (
                                    <input type="date" value={editPaymentDate} onChange={e => setEditPaymentDate(e.target.value)} className="w-full p-1 border rounded text-sm" required />
                                ) : new Date(pay.payment_date).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-800 capitalize">
                                {editingPayment === pay.id ? (
                                    <select value={editPaymentType} onChange={e => setEditPaymentType(e.target.value)} className="w-full p-1 border rounded text-sm">
                                        <option value="аванс">аванс</option>
                                        <option value="зарплата">зарплата</option>
                                    </select>
                                ) : pay.payment_type}
                            </td>
                            <td className="px-4 py-3 text-sm font-medium text-gray-800">
                                {editingPayment === pay.id ? (
                                    <input type="number" step="0.01" value={editPaymentAmount} onChange={e => setEditPaymentAmount(e.target.value)} className="w-24 p-1 border rounded text-sm" required />
                                ) : formatCurrency(pay.amount)}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-500">{pay.batch_name || 'Без партии'}</td>
                            {allowEdit && (
                                <td className="px-4 py-3 text-sm text-right">
                                    {editingPayment === pay.id ? (
                                        <div className="flex justify-end gap-2">
                                            <button onClick={() => handleSavePayment(pay.id)} disabled={isSavingPayment} className="text-green-600 hover:text-green-800 font-medium">Сохранить</button>
                                            <button onClick={handleCancelEditPayment} className="text-gray-500 hover:text-gray-700">Отмена</button>
                                        </div>
                                    ) : (
                                        <div className="flex justify-end gap-3">
                                            <button onClick={() => handleStartEditPayment(pay)} className="text-indigo-600 font-medium">Изменить</button>
                                            <button onClick={() => handleDeletePayment(pay.id)} className="text-red-500 font-medium">Удалить</button>
                                        </div>
                                    )}
                                </td>
                            )}
                        </tr>
                    ))}
                    {salaries.length === 0 && (
                        <tr><td colSpan={allowEdit ? 5 : 4} className="px-4 py-8 text-center text-gray-500 bg-gray-50/50">Нет выплат</td></tr>
                    )}
                </tbody>
            </table>
        </div>
    );

    return (
        <div>
            <div className="mb-6">
                <h2 className="text-xl font-bold text-gray-800">Сотрудники</h2>
                <p className="text-sm text-gray-500 mt-1">Выберите сотрудника, чтобы записать аванс или выплатить зарплату</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {activePersons.map(p => (
                    <EmployeeCard
                        key={p.id}
                        person={p}
                        employment={p.employees?.[0]}
                        isSelected={selectedPerson?.id === p.id}
                        onClick={() => setSelectedPerson(p)}
                    />
                ))}
                {activePersons.length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-12 col-span-full">Нет работающих сотрудников</p>
                )}
            </div>

            {isModalOpen && (
                <div
                    className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
                    onClick={closeModal}
                >
                    <div
                        className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="p-6">
                            <div className="flex flex-wrap justify-between items-start mb-6 gap-4">
                                <div>
                                    <h2 className="text-2xl font-semibold">{selectedPerson.full_name}</h2>
                                    <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-700">
                                        🟢 Работает {recentEmployment?.start_date && `(c ${new Date(recentEmployment.start_date).toLocaleDateString()})`}
                                    </div>
                                </div>
                                <button
                                    onClick={closeModal}
                                    className="text-gray-400 hover:text-gray-700 text-2xl leading-none px-2"
                                    aria-label="Закрыть"
                                >
                                    ×
                                </button>
                            </div>

                            {/* CURRENT PERIOD ACCRUAL WIDGET */}
                            <div className="mb-8 p-5 bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-100 rounded-2xl shadow-sm">
                                <h3 className="text-lg font-bold text-indigo-900 mb-1">Начисление за текущий период</h3>
                                {recentEmployment && (
                                    <p className="text-sm text-indigo-600 mb-4">
                                        📅 {new Date(recentEmployment.start_date).toLocaleDateString()} — {recentEmployment.end_date ? new Date(recentEmployment.end_date).toLocaleDateString() : 'По настоящее время'}
                                        {recentEmployment.broiler_batches && (
                                            <span className="ml-2 px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">
                                                {recentEmployment.broiler_batches.batch_name}
                                            </span>
                                        )}
                                    </p>
                                )}

                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div className="bg-white p-4 rounded-xl shadow-sm border border-indigo-50">
                                        <p className="text-xs text-gray-500 mb-1">Отработано дней</p>
                                        <p className="font-bold text-xl text-gray-800">{currentAccruedData.effectiveDays} дн.</p>
                                    </div>
                                    <div className="bg-white p-4 rounded-xl shadow-sm border border-indigo-50">
                                        <p className="text-xs text-gray-500 mb-1">Начислено по ставке</p>
                                        <p className="font-bold text-xl text-indigo-600">{formatCurrency(currentAccruedData.salary)}</p>
                                    </div>
                                    <div className="bg-white p-4 rounded-xl shadow-sm border border-indigo-50">
                                        <p className="text-xs text-gray-500 mb-1">Выплачено (тек. период)</p>
                                        <p className="font-bold text-xl text-green-600">{formatCurrency(currentTotals.totalAll)}</p>
                                    </div>
                                    <div className="bg-white p-4 rounded-xl shadow-sm border border-indigo-50">
                                        <p className="text-xs text-gray-500 mb-1">Остаток к выплате</p>
                                        <p className={`font-bold text-xl ${remainingToPay > 0 ? 'text-red-600' : 'text-gray-800'}`}>
                                            {formatCurrency(remainingToPay)}
                                        </p>
                                    </div>
                                </div>

                                {currentAccruedData.breakdown && currentAccruedData.breakdown.length > 0 && (
                                    <div className="mt-4 pt-4 border-t border-indigo-100/50">
                                        <p className="text-xs font-semibold text-indigo-800 mb-2 uppercase tracking-wider">Детализация расчета:</p>
                                        <ul className="text-sm text-gray-600 space-y-1 ml-2">
                                            {currentAccruedData.breakdown.map((item, idx) => (
                                                <li key={idx} className="flex items-center gap-2">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-300"></span>
                                                    <span>{item.label} = <strong>{formatCurrency(item.sum)}</strong></span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>

                            {/* Current period summary cards */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                                <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 shadow-sm">
                                    <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">Авансы (тек. период)</p>
                                    <p className="font-bold text-lg text-gray-800">{formatCurrency(currentTotals.totalAdvance)}</p>
                                </div>
                                <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 shadow-sm">
                                    <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">Зарплаты (тек. период)</p>
                                    <p className="font-bold text-lg text-gray-800">{formatCurrency(currentTotals.totalSalary)}</p>
                                </div>
                                {Object.entries(currentTotals.byBatch).map(([batchId, info]) => (
                                    <div key={batchId} className={`p-4 rounded-xl border shadow-sm ${info.isActive ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                                        <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">Партия: {info.name} {info.isActive ? '' : '(архив)'} </p>
                                        <p className="font-bold text-lg text-gray-800">{formatCurrency(info.total)}</p>
                                    </div>
                                ))}
                            </div>

                            {/* Current period payments */}
                            <div className="mb-4 flex items-center justify-between">
                                <h3 className="text-lg font-bold text-gray-800">Выплаты текущего периода</h3>
                            </div>

                            <form onSubmit={handleAddPayment} className="bg-gray-50 p-4 rounded-xl border border-gray-200 mb-6 flex flex-wrap items-end gap-4">
                                <div className="flex-1 min-w-[150px]">
                                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">Дата</label>
                                    <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" required />
                                </div>
                                <div className="flex-1 min-w-[150px]">
                                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">Сумма</label>
                                    <input type="number" step="0.01" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} placeholder="0.00" className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" required />
                                </div>
                                <div className="flex-1 min-w-[150px]">
                                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">Тип</label>
                                    <select value={paymentType} onChange={e => setPaymentType(e.target.value)} className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500">
                                        <option value="аванс">Аванс</option>
                                        <option value="зарплата">Зарплата (остаток)</option>
                                    </select>
                                </div>
                                <div className="w-full md:w-auto mt-2 md:mt-0">
                                    <button type="submit" disabled={isAddingPayment} className="w-full md:w-auto px-6 py-2.5 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors shadow-sm">
                                        {isAddingPayment ? 'Добавление...' : '+ Выплатить'}
                                    </button>
                                </div>
                            </form>

                            {renderPaymentTable(currentPeriodSalaries, true)}

                            {/* PAST PERIODS SECTION */}
                            {pastPeriodGroups.length > 0 && (
                                <div className="mt-10">
                                    <button
                                        onClick={() => setShowPastPeriods(!showPastPeriods)}
                                        className="w-full flex items-center justify-between px-5 py-4 bg-gradient-to-r from-gray-50 to-gray-100 border border-gray-200 rounded-2xl hover:from-gray-100 hover:to-gray-150 transition-all shadow-sm group"
                                    >
                                        <div className="flex items-center gap-3">
                                            <span className="text-lg">📂</span>
                                            <span className="text-base font-bold text-gray-700">Выплаты прошлых периодов</span>
                                            <span className="text-sm text-gray-500 font-medium bg-white px-2.5 py-0.5 rounded-full border border-gray-200">
                                                {pastPeriodSalaries.length} выплат · {formatCurrency(pastTotals)}
                                            </span>
                                        </div>
                                        <span className={`text-gray-400 transition-transform duration-200 ${showPastPeriods ? 'rotate-180' : ''}`}>
                                            ▼
                                        </span>
                                    </button>

                                    {showPastPeriods && (
                                        <div className="mt-4 space-y-6">
                                            {pastPeriodGroups.map((group) => (
                                                <div key={group.employee.id} className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
                                                    <div className="px-5 py-3 bg-gray-100 border-b border-gray-200 flex flex-wrap justify-between items-center gap-2">
                                                        <div>
                                                            <p className="font-semibold text-gray-700 text-sm">
                                                                📅 {group.periodLabel}
                                                            </p>
                                                            <p className="text-xs text-gray-500 mt-0.5">
                                                                {group.employee.position || 'Должность не указана'}
                                                                {group.employee.broiler_batches && (
                                                                    <span className="ml-2 px-2 py-0.5 bg-purple-100 text-purple-600 rounded-full text-xs">
                                                                        {group.employee.broiler_batches.batch_name}
                                                                    </span>
                                                                )}
                                                            </p>
                                                        </div>
                                                        <div className="text-right text-sm">
                                                            <p className="text-gray-500">Начислено: <strong className="text-indigo-600">{formatCurrency(group.accrued.salary)}</strong></p>
                                                            <p className="text-gray-500">Выплачено: <strong className="text-green-600">{formatCurrency(group.total)}</strong></p>
                                                        </div>
                                                    </div>
                                                    <div className="p-3">
                                                        {renderPaymentTable(group.salaries, true)}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
