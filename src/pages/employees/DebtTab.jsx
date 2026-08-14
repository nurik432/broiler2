// src/pages/employees/DebtTab.jsx
// Компонент для учёта долгов цеха (кому должны / за что)

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabaseClient';

export default function DebtTab() {
    const [debts, setDebts] = useState([]);
    const [loading, setLoading] = useState(true);

    // Form: add debt
    const [debtCreditor, setDebtCreditor] = useState('');
    const [debtAmount, setDebtAmount] = useState('');
    const [debtDescription, setDebtDescription] = useState('');
    const [debtDate, setDebtDate] = useState(new Date().toISOString().slice(0, 10));
    const [isAddingDebt, setIsAddingDebt] = useState(false);

    // Form: partial payment
    const [payingDebtId, setPayingDebtId] = useState(null);
    const [payAmount, setPayAmount] = useState('');
    const [payDescription, setPayDescription] = useState('');
    const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
    const [isPayingDebt, setIsPayingDebt] = useState(false);

    // Expanded debt detail
    const [expandedDebtId, setExpandedDebtId] = useState(null);

    // Filters
    const [showSettled, setShowSettled] = useState(false);
    const [filterCreditor, setFilterCreditor] = useState('');

    const fetchDebts = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('debts')
            .select(`*, debt_payments(*)`)
            .order('debt_date', { ascending: false });

        if (error) {
            console.error('Ошибка загрузки долгов:', error);
            setDebts([]);
        } else {
            setDebts(data || []);
        }
        setLoading(false);
    };

    useEffect(() => { fetchDebts(); }, []);

    // Unique creditors for filter & autocomplete
    const uniqueCreditors = useMemo(() => {
        const set = new Set();
        debts.forEach(d => { if (d.creditor_name) set.add(d.creditor_name); });
        return Array.from(set).sort();
    }, [debts]);

    const filteredDebts = useMemo(() => {
        return debts.filter(d => {
            if (!showSettled && d.is_settled) return false;
            if (filterCreditor && d.creditor_name !== filterCreditor) return false;
            return true;
        });
    }, [debts, showSettled, filterCreditor]);

    // Dashboard
    const dashboard = useMemo(() => {
        const totalDebt = debts.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
        const totalPaid = debts.reduce((sum, d) => {
            return sum + (d.debt_payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
        }, 0);
        const activeDebts = debts.filter(d => !d.is_settled).length;
        const settledDebts = debts.filter(d => d.is_settled).length;

        // Per creditor
        const byCreditor = {};
        debts.forEach(d => {
            const name = d.creditor_name || 'Без имени';
            if (!byCreditor[name]) byCreditor[name] = { totalDebt: 0, totalPaid: 0, activeCount: 0 };
            byCreditor[name].totalDebt += Number(d.amount) || 0;
            byCreditor[name].totalPaid += (d.debt_payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
            if (!d.is_settled) byCreditor[name].activeCount++;
        });

        return {
            totalDebt, totalPaid,
            remaining: totalDebt - totalPaid,
            activeDebts, settledDebts,
            byCreditor: Object.entries(byCreditor).map(([name, data]) => ({
                name, ...data, remaining: data.totalDebt - data.totalPaid,
            })).sort((a, b) => b.remaining - a.remaining),
        };
    }, [debts]);

    const getDebtPaid = (debt) => (debt.debt_payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const getDebtRemaining = (debt) => Math.max((Number(debt.amount) || 0) - getDebtPaid(debt), 0);

    const handleAddDebt = async (e) => {
        e.preventDefault();
        if (!debtCreditor.trim() || !debtAmount) return;
        setIsAddingDebt(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const { error } = await supabase.from('debts').insert({
                creditor_name: debtCreditor.trim(),
                amount: Number(debtAmount),
                description: debtDescription || null,
                debt_date: debtDate,
                user_id: user?.id,
            });
            if (error) alert('Ошибка: ' + error.message);
            else { setDebtAmount(''); setDebtDescription(''); setDebtCreditor(''); await fetchDebts(); }
        } catch (err) { alert('Ошибка: ' + err.message); }
        setIsAddingDebt(false);
    };

    const handlePayDebt = async (e, debtId) => {
        e.preventDefault();
        if (!payAmount) return;
        setIsPayingDebt(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const { error } = await supabase.from('debt_payments').insert({
                debt_id: debtId,
                amount: Number(payAmount),
                payment_date: payDate,
                description: payDescription || null,
                user_id: user?.id,
            });
            if (error) { alert('Ошибка: ' + error.message); }
            else {
                const debt = debts.find(d => d.id === debtId);
                if (debt) {
                    const totalPaidNow = getDebtPaid(debt) + Number(payAmount);
                    if (totalPaidNow >= Number(debt.amount)) {
                        await supabase.from('debts').update({ is_settled: true }).eq('id', debtId);
                    }
                }
                setPayAmount(''); setPayDescription(''); setPayingDebtId(null); await fetchDebts();
            }
        } catch (err) { alert('Ошибка: ' + err.message); }
        setIsPayingDebt(false);
    };

    const handleDeleteDebt = async (debtId) => {
        if (!window.confirm('Удалить этот долг и все его погашения?')) return;
        const { error } = await supabase.from('debts').delete().eq('id', debtId);
        if (error) alert('Ошибка: ' + error.message);
        else await fetchDebts();
    };

    const handleDeletePayment = async (paymentId) => {
        if (!window.confirm('Удалить это погашение?')) return;
        await supabase.from('debt_payments').delete().eq('id', paymentId);
        await fetchDebts();
    };

    const handleToggleSettled = async (debtId, currentSettled) => {
        const { error } = await supabase.from('debts').update({ is_settled: !currentSettled }).eq('id', debtId);
        if (error) alert('Ошибка: ' + error.message);
        else await fetchDebts();
    };

    const formatCurrency = (amount) =>
        new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'TJS' }).format(amount || 0);

    if (loading) return <p className="text-gray-500 p-6">Загрузка данных о долгах…</p>;

    return (
        <div className="space-y-8">
            {/* ═══ DASHBOARD ═══ */}
            <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100">
                <h2 className="text-xl font-bold text-gray-800 mb-5">📊 Сводка по долгам цеха</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className="p-4 rounded-xl bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-100">
                        <p className="text-xs text-orange-600 font-semibold uppercase tracking-wider mb-1">Всего долгов</p>
                        <p className="font-bold text-2xl text-orange-700">{formatCurrency(dashboard.totalDebt)}</p>
                    </div>
                    <div className="p-4 rounded-xl bg-gradient-to-br from-green-50 to-emerald-50 border border-green-100">
                        <p className="text-xs text-green-600 font-semibold uppercase tracking-wider mb-1">Оплачено</p>
                        <p className="font-bold text-2xl text-green-700">{formatCurrency(dashboard.totalPaid)}</p>
                    </div>
                    <div className={`p-4 rounded-xl border ${dashboard.remaining > 0 ? 'bg-gradient-to-br from-red-50 to-rose-50 border-red-100' : 'bg-gray-50 border-gray-200'}`}>
                        <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${dashboard.remaining > 0 ? 'text-red-600' : 'text-gray-500'}`}>Остаток</p>
                        <p className={`font-bold text-2xl ${dashboard.remaining > 0 ? 'text-red-600' : 'text-gray-700'}`}>{formatCurrency(dashboard.remaining)}</p>
                    </div>
                    <div className="p-4 rounded-xl bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-100">
                        <p className="text-xs text-indigo-600 font-semibold uppercase tracking-wider mb-1">Активных / Закрытых</p>
                        <p className="font-bold text-2xl text-indigo-700">{dashboard.activeDebts} <span className="text-base text-gray-400 font-normal">/ {dashboard.settledDebts}</span></p>
                    </div>
                </div>

                {dashboard.byCreditor.length > 0 && (
                    <div>
                        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">По кредиторам</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {dashboard.byCreditor.map(c => (
                                <div key={c.name} className={`p-4 rounded-xl border shadow-sm ${c.remaining > 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                                    <div className="flex justify-between items-start mb-2">
                                        <p className="font-bold text-gray-800">{c.name}</p>
                                        {c.activeCount > 0 && (
                                            <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">{c.activeCount} акт.</span>
                                        )}
                                    </div>
                                    <div className="text-xs text-gray-600 space-y-0.5">
                                        <p>Долг: <span className="text-orange-600 font-medium">{formatCurrency(c.totalDebt)}</span></p>
                                        <p>Оплачено: <span className="text-green-600 font-medium">{formatCurrency(c.totalPaid)}</span></p>
                                        <p className="pt-1 border-t mt-1">
                                            Остаток: <span className={`font-bold ${c.remaining > 0 ? 'text-red-600' : 'text-gray-700'}`}>{formatCurrency(c.remaining)}</span>
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* ═══ ADD DEBT FORM ═══ */}
            <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100">
                <h2 className="text-xl font-bold text-gray-800 mb-4">➕ Записать долг</h2>
                <form onSubmit={handleAddDebt} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Кому должны</label>
                            <input
                                type="text"
                                value={debtCreditor}
                                onChange={e => setDebtCreditor(e.target.value)}
                                placeholder="Имя / Фирма"
                                list="creditor-suggestions"
                                required
                                className="w-full p-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500"
                            />
                            <datalist id="creditor-suggestions">
                                {uniqueCreditors.map(c => <option key={c} value={c} />)}
                            </datalist>
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Сумма</label>
                            <input type="number" step="0.01" value={debtAmount} onChange={e => setDebtAmount(e.target.value)}
                                placeholder="0.00" required className="w-full p-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500" />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Дата</label>
                            <input type="date" value={debtDate} onChange={e => setDebtDate(e.target.value)}
                                required className="w-full p-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500" />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">За что</label>
                            <input type="text" value={debtDescription} onChange={e => setDebtDescription(e.target.value)}
                                placeholder="Корм, лекарства, и т.д." className="w-full p-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500" />
                        </div>
                    </div>
                    <button type="submit" disabled={isAddingDebt}
                        className="px-6 py-2.5 bg-orange-600 text-white font-medium rounded-xl hover:bg-orange-700 transition-colors shadow-sm disabled:bg-gray-300">
                        {isAddingDebt ? 'Сохранение...' : '📋 Записать долг'}
                    </button>
                </form>
            </div>

            {/* ═══ DEBT LIST ═══ */}
            <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100">
                <div className="flex flex-wrap justify-between items-center mb-5 gap-3">
                    <h2 className="text-xl font-bold text-gray-800">📃 Список долгов</h2>
                    <div className="flex flex-wrap gap-3 items-center">
                        {uniqueCreditors.length > 0 && (
                            <select value={filterCreditor} onChange={e => setFilterCreditor(e.target.value)}
                                className="p-2 border border-gray-300 rounded-lg text-sm bg-white">
                                <option value="">Все кредиторы</option>
                                {uniqueCreditors.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        )}
                        <label className="flex items-center text-sm text-gray-600 cursor-pointer gap-1.5 select-none bg-gray-50 px-3 py-2 rounded-lg border border-gray-200">
                            <input type="checkbox" checked={showSettled} onChange={() => setShowSettled(!showSettled)}
                                className="h-4 w-4 rounded border-gray-300 text-indigo-600" />
                            <span className="font-medium">Закрытые</span>
                        </label>
                    </div>
                </div>

                <div className="space-y-4">
                    {filteredDebts.length === 0 ? (
                        <p className="text-center text-gray-400 py-8">Нет долгов{!showSettled ? ' (попробуйте включить закрытые)' : ''}</p>
                    ) : filteredDebts.map(debt => {
                        const paid = getDebtPaid(debt);
                        const remaining = getDebtRemaining(debt);
                        const progress = Number(debt.amount) > 0 ? Math.min((paid / Number(debt.amount)) * 100, 100) : 0;
                        const isExpanded = expandedDebtId === debt.id;

                        return (
                            <div key={debt.id} className={`rounded-xl border overflow-hidden transition-all ${debt.is_settled ? 'border-green-200 bg-green-50/50' : 'border-gray-200 bg-white'}`}>
                                <div className="p-4 cursor-pointer hover:bg-gray-50/50 transition-colors"
                                    onClick={() => setExpandedDebtId(isExpanded ? null : debt.id)}>
                                    <div className="flex flex-wrap justify-between items-start gap-3">
                                        <div className="flex-1 min-w-[200px]">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="font-bold text-gray-800">{debt.creditor_name || '—'}</span>
                                                {debt.is_settled ? (
                                                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">✅ Закрыт</span>
                                                ) : (
                                                    <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">⏳ Активный</span>
                                                )}
                                            </div>
                                            <p className="text-sm text-gray-500">
                                                📅 {new Date(debt.debt_date).toLocaleDateString()}
                                                {debt.description && <span className="ml-2">· {debt.description}</span>}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xs text-gray-500">Сумма долга</p>
                                            <p className="font-bold text-lg text-orange-600">{formatCurrency(debt.amount)}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xs text-gray-500">Оплачено</p>
                                            <p className="font-bold text-lg text-green-600">{formatCurrency(paid)}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xs text-gray-500">Остаток</p>
                                            <p className={`font-bold text-lg ${remaining > 0 ? 'text-red-600' : 'text-gray-600'}`}>{formatCurrency(remaining)}</p>
                                        </div>
                                        <span className={`text-gray-400 transition-transform duration-200 self-center ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
                                    </div>
                                    <div className="mt-3 bg-gray-200 rounded-full h-2 overflow-hidden">
                                        <div className={`h-full rounded-full transition-all duration-500 ${progress >= 100 ? 'bg-green-500' : progress > 50 ? 'bg-yellow-500' : 'bg-red-400'}`}
                                            style={{ width: `${progress}%` }}></div>
                                    </div>
                                    <p className="text-xs text-gray-400 mt-1">{Math.round(progress)}% оплачено</p>
                                </div>

                                {isExpanded && (
                                    <div className="border-t border-gray-200 bg-gray-50/50 p-4 space-y-4">
                                        <div>
                                            <h4 className="text-sm font-semibold text-gray-700 mb-2">История оплат</h4>
                                            {(debt.debt_payments || []).length === 0 ? (
                                                <p className="text-sm text-gray-400 py-2">Оплат ещё не было</p>
                                            ) : (
                                                <div className="overflow-x-auto rounded-lg border border-gray-200">
                                                    <table className="min-w-full text-sm">
                                                        <thead className="bg-gray-100 text-xs text-gray-500 uppercase">
                                                            <tr>
                                                                <th className="px-3 py-2 text-left">Дата</th>
                                                                <th className="px-3 py-2 text-left">Сумма</th>
                                                                <th className="px-3 py-2 text-left">Комментарий</th>
                                                                <th className="px-3 py-2 text-right">Действия</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-gray-100 bg-white">
                                                            {debt.debt_payments
                                                                .sort((a, b) => new Date(b.payment_date) - new Date(a.payment_date))
                                                                .map(p => (
                                                                <tr key={p.id} className="hover:bg-gray-50">
                                                                    <td className="px-3 py-2 text-gray-800">{new Date(p.payment_date).toLocaleDateString()}</td>
                                                                    <td className="px-3 py-2 font-medium text-green-600">{formatCurrency(p.amount)}</td>
                                                                    <td className="px-3 py-2 text-gray-500">{p.description || '—'}</td>
                                                                    <td className="px-3 py-2 text-right">
                                                                        <button onClick={(e) => { e.stopPropagation(); handleDeletePayment(p.id); }}
                                                                            className="text-red-400 hover:text-red-600 text-xs font-medium px-2 py-2 -my-2">Удалить</button>
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}
                                        </div>

                                        {!debt.is_settled && (
                                            <div>
                                                {payingDebtId === debt.id ? (
                                                    <form onSubmit={(e) => handlePayDebt(e, debt.id)} className="bg-green-50 p-4 rounded-xl border border-green-200 space-y-3">
                                                        <h4 className="text-sm font-semibold text-green-800">💵 Внести оплату</h4>
                                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                                            <div>
                                                                <label className="block text-xs font-medium text-gray-600 mb-1">Сумма</label>
                                                                <input type="number" step="0.01" value={payAmount} onChange={e => setPayAmount(e.target.value)}
                                                                    placeholder={`Макс. ${remaining}`} required className="w-full p-2 border rounded-lg text-sm" />
                                                            </div>
                                                            <div>
                                                                <label className="block text-xs font-medium text-gray-600 mb-1">Дата</label>
                                                                <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)}
                                                                    required className="w-full p-2 border rounded-lg text-sm" />
                                                            </div>
                                                            <div>
                                                                <label className="block text-xs font-medium text-gray-600 mb-1">Комментарий</label>
                                                                <input type="text" value={payDescription} onChange={e => setPayDescription(e.target.value)}
                                                                    placeholder="(необязательно)" className="w-full p-2 border rounded-lg text-sm" />
                                                            </div>
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <button type="submit" disabled={isPayingDebt}
                                                                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:bg-gray-300">
                                                                {isPayingDebt ? 'Сохранение...' : 'Сохранить'}
                                                            </button>
                                                            <button type="button" onClick={(e) => { e.stopPropagation(); setPayingDebtId(null); }}
                                                                className="px-4 py-2 bg-gray-200 rounded-lg text-sm font-medium">Отмена</button>
                                                        </div>
                                                    </form>
                                                ) : (
                                                    <button onClick={(e) => {
                                                        e.stopPropagation();
                                                        setPayingDebtId(debt.id); setPayAmount(''); setPayDescription('');
                                                        setPayDate(new Date().toISOString().slice(0, 10));
                                                    }} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors shadow-sm">
                                                        💵 Внести часть оплаты
                                                    </button>
                                                )}
                                            </div>
                                        )}

                                        <div className="flex gap-2 pt-2 border-t border-gray-200">
                                            <button onClick={(e) => { e.stopPropagation(); handleToggleSettled(debt.id, debt.is_settled); }}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                                    debt.is_settled ? 'bg-orange-100 text-orange-700 hover:bg-orange-200' : 'bg-green-100 text-green-700 hover:bg-green-200'
                                                }`}>
                                                {debt.is_settled ? '↩ Вернуть в активные' : '✅ Отметить как закрытый'}
                                            </button>
                                            <button onClick={(e) => { e.stopPropagation(); handleDeleteDebt(debt.id); }}
                                                className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-xs font-medium hover:bg-red-200 transition-colors">
                                                🗑 Удалить долг
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
