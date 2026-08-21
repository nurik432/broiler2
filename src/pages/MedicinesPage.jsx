// src/pages/MedicinesPage.jsx

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import MedicineCatalog from '../components/MedicineCatalog';

function MedicinesPage() {
    // --- Данные ---
    const [transactions, setTransactions] = useState([]);
    const [medicines, setMedicines] = useState([]);
    const [activeBatches, setActiveBatches] = useState([]);
    const [loading, setLoading] = useState(true);

    // --- Вкладки: purchase / debt / payment / catalog ---
    const [activeTab, setActiveTab] = useState('purchase');

    // --- Показать скрытые ---
    const [showHidden, setShowHidden] = useState(false);

    // --- Форма покупки/долга ---
    const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
    const [medicineId, setMedicineId] = useState('');
    const [quantity, setQuantity] = useState('');
    const [unit, setUnit] = useState('шт');
    const [pricePerUnit, setPricePerUnit] = useState('');
    const [description, setDescription] = useState('');
    const [company, setCompany] = useState('');
    const [selectedBatchId, setSelectedBatchId] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // --- Фильтр по фирме ---
    const [filterCompany, setFilterCompany] = useState('');

    // --- Форма платежа ---
    const [paymentAmount, setPaymentAmount] = useState('');
    const [paymentDescription, setPaymentDescription] = useState('');
    const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
    const [paymentMedicineId, setPaymentMedicineId] = useState('');

    // --- Загрузка данных ---
    const fetchData = async () => {
        setLoading(true);
        const [transRes, medsRes, batchesRes] = await Promise.all([
            supabase
                .from('medicine_transactions')
                .select('*, medicine:medicines(name)')
                .order('transaction_date', { ascending: false })
                .order('created_at', { ascending: false }),
            supabase.from('medicines').select('id, name').order('name'),
            supabase.from('broiler_batches').select('id, batch_name').eq('is_active', true).or('is_summary.eq.false,is_summary.is.null')
        ]);

        if (transRes.error) console.error('Ошибка транзакций:', transRes.error);
        else setTransactions(transRes.data);

        if (medsRes.error) console.error('Ошибка лекарств:', medsRes.error);
        else setMedicines(medsRes.data);

        if (batchesRes.error) console.error('Ошибка партий:', batchesRes.error);
        else {
            const batches = batchesRes.data || [];
            setActiveBatches(batches);
            if (batches.length === 1) {
                setSelectedBatchId(prev => prev || batches[0].id);
            }
        }

        setLoading(false);
    };

    useEffect(() => { fetchData(); }, []);

    // --- Фильтрованные транзакции ---
    const filteredTransactions = useMemo(() => {
        return transactions.filter(t => {
            if (!showHidden && t.is_hidden) return false;
            if (filterCompany && (t.company || '') !== filterCompany) return false;
            return true;
        });
    }, [transactions, showHidden, filterCompany]);

    // --- Уникальные фирмы ---
    const uniqueCompanies = useMemo(() => {
        const set = new Set();
        transactions.forEach(t => { if (t.company) set.add(t.company); });
        return Array.from(set).sort();
    }, [transactions]);

    // --- Дашборд считается из видимых записей ---
    const summary = useMemo(() => {
        const s = { total_purchased: 0, total_debt: 0, total_paid: 0, current_balance: 0 };
        filteredTransactions.forEach(t => {
            const amt = Number(t.amount) || 0;
            if (t.transaction_type === 'purchase') s.total_purchased += amt;
            else if (t.transaction_type === 'debt') s.total_debt += amt;
            else if (t.transaction_type === 'payment') s.total_paid += amt;
        });
        s.current_balance = s.total_debt - s.total_paid;
        return s;
    }, [filteredTransactions]);

    // --- Вычислим итого по каждому лекарству для дашборда ---
    const perMedicineSummary = useMemo(() => {
        const map = {};
        filteredTransactions.forEach(t => {
            const name = t.medicine?.name || 'Без лекарства';
            if (!map[name]) map[name] = { purchased: 0, debt: 0, paid: 0 };
            if (t.transaction_type === 'purchase') map[name].purchased += Number(t.amount);
            else if (t.transaction_type === 'debt') map[name].debt += Number(t.amount);
            else if (t.transaction_type === 'payment') map[name].paid += Number(t.amount);
        });
        return Object.entries(map).map(([name, data]) => ({
            name,
            ...data,
            balance: data.debt - data.paid
        }));
    }, [filteredTransactions]);

    // --- Добавление покупки / долга ---
    const handleAddTransaction = async (e, type) => {
        e.preventDefault();
        setIsSubmitting(true);
        const qty = Number(quantity);
        const price = Number(pricePerUnit);
        const totalAmount = qty * price;

        if (totalAmount <= 0) {
            alert('Сумма должна быть больше нуля.');
            setIsSubmitting(false);
            return;
        }

        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase.from('medicine_transactions').insert([{
            transaction_date: date,
            transaction_type: type,
            medicine_id: medicineId || null,
            quantity: qty,
            unit,
            price_per_unit: price,
            amount: totalAmount,
            description: description || null,
            company: company || null,
            batch_id: selectedBatchId || null,
            user_id: user.id
        }]);

        if (error) {
            alert('Ошибка: ' + error.message);
        } else {
            setQuantity(''); setPricePerUnit(''); setDescription(''); setMedicineId(''); setCompany('');
            await fetchData();
        }
        setIsSubmitting(false);
    };

    // --- Добавление платежа ---
    const handleAddPayment = async (e) => {
        e.preventDefault();
        const amountToPay = Number(paymentAmount);
        if (amountToPay <= 0) {
            alert('Сумма платежа должна быть больше нуля.');
            return;
        }

        setIsSubmitting(true);
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase.from('medicine_transactions').insert([{
            transaction_date: paymentDate,
            transaction_type: 'payment',
            medicine_id: paymentMedicineId || null,
            quantity: null,
            unit: null,
            price_per_unit: null,
            amount: amountToPay,
            description: paymentDescription || 'Оплата за лекарства',
            user_id: user.id
        }]);

        if (error) {
            alert('Ошибка: ' + error.message);
        } else {
            setPaymentAmount(''); setPaymentDescription(''); setPaymentMedicineId('');
            await fetchData();
        }
        setIsSubmitting(false);
    };

    // --- Скрыть/показать позицию ---
    const handleToggleHidden = async (id, currentHidden) => {
        const { error } = await supabase
            .from('medicine_transactions')
            .update({ is_hidden: !currentHidden })
            .eq('id', id);
        if (error) alert('Ошибка: ' + error.message);
        else fetchData();
    };

    // --- Удалить транзакцию ---
    const handleDelete = async (id) => {
        if (window.confirm('Удалить эту запись? Это повлияет на общий баланс.')) {
            await supabase.from('medicine_transactions').delete().eq('id', id);
            fetchData();
        }
    };

    const formatCurrency = (value) =>
        new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'TJS' }).format(value || 0);

    const typeLabels = {
        purchase: { label: 'Покупка', color: 'text-blue-600', bg: 'bg-blue-50' },
        debt: { label: 'В долг', color: 'text-orange-600', bg: 'bg-orange-50' },
        payment: { label: 'Оплата', color: 'text-green-600', bg: 'bg-green-50' }
    };

    const unitOptions = ['шт', 'мл', 'л', 'гр', 'кг', 'доза', 'упак', 'флакон'];

    // Inline helper for rendering purchase/debt form fields
    const renderPurchaseDebtFields = (type) => (
        <form onSubmit={(e) => handleAddTransaction(e, type)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700">Дата</label>
                    <input type="date" value={date} onChange={e => setDate(e.target.value)}
                        required className="mt-1 w-full p-2 border rounded-md" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Лекарство</label>
                    <select value={medicineId} onChange={e => setMedicineId(e.target.value)}
                        className="mt-1 w-full p-2 border rounded-md bg-white">
                        <option value="">-- Выберите --</option>
                        {medicines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Количество</label>
                    <input type="number" step="0.01" placeholder="10"
                        value={quantity} onChange={e => setQuantity(e.target.value)}
                        required className="mt-1 w-full p-2 border rounded-md" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Ед. измерения</label>
                    <select value={unit} onChange={e => setUnit(e.target.value)}
                        className="mt-1 w-full p-2 border rounded-md bg-white">
                        {unitOptions.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Цена за ед.</label>
                    <input type="number" step="0.01" placeholder="150"
                        value={pricePerUnit} onChange={e => setPricePerUnit(e.target.value)}
                        required className="mt-1 w-full p-2 border rounded-md" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Описание</label>
                    <input type="text" placeholder="(необязательно)"
                        value={description} onChange={e => setDescription(e.target.value)}
                        className="mt-1 w-full p-2 border rounded-md" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Фирма</label>
                    <input type="text" placeholder="Название фирмы"
                        value={company} onChange={e => setCompany(e.target.value)}
                        list="company-suggestions"
                        className="mt-1 w-full p-2 border rounded-md" />
                    <datalist id="company-suggestions">
                        {uniqueCompanies.map(c => <option key={c} value={c} />)}
                    </datalist>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Партия</label>
                    <select value={selectedBatchId} onChange={e => setSelectedBatchId(e.target.value)}
                        className="mt-1 w-full p-2 border rounded-md bg-white">
                        <option value="">-- Не привязывать --</option>
                        {activeBatches.map(b => <option key={b.id} value={b.id}>{b.batch_name}</option>)}
                    </select>
                </div>
            </div>
            {quantity && pricePerUnit && (
                <div className="text-sm text-gray-600">
                    Итого: <strong className="text-lg">{formatCurrency(Number(quantity) * Number(pricePerUnit))}</strong>
                </div>
            )}
            <button type="submit" disabled={isSubmitting}
                className={`w-full py-2 px-4 rounded-md text-white font-medium transition-colors ${
                    type === 'purchase'
                        ? 'bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300'
                        : 'bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300'
                }`}>
                {isSubmitting ? 'Сохранение...' : (type === 'purchase' ? '📦 Записать покупку' : '📋 Записать в долг')}
            </button>
        </form>
    );

    // --- Если показываем каталог ---
    if (activeTab === 'catalog') {
        return (
            <div>
                <div className="flex flex-wrap gap-2 mb-6">
                    {['purchase', 'debt', 'payment', 'catalog'].map(tab => (
                        <button key={tab} onClick={() => setActiveTab(tab)}
                            className={`py-2 px-4 rounded-lg font-medium transition-colors ${
                                activeTab === tab
                                    ? 'bg-indigo-600 text-white shadow-md'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}>
                            {tab === 'purchase' ? '📦 Покупка' :
                             tab === 'debt' ? '📋 В долг' :
                             tab === 'payment' ? '💰 Оплата' : '📚 Каталог'}
                        </button>
                    ))}
                </div>
                <MedicineCatalog />
            </div>
        );
    }

    return (
        <div>
            {/* Заголовок + переключатель скрытых */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-3">
                <h1 className="text-3xl font-bold text-gray-800">💊 Учёт лекарств</h1>
                <label className="flex items-center text-sm text-gray-600 cursor-pointer select-none">
                    <input type="checkbox" checked={showHidden} onChange={() => setShowHidden(!showHidden)}
                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                    <span className="ml-2">Показать скрытые позиции</span>
                </label>
                {uniqueCompanies.length > 0 && (
                    <select
                        value={filterCompany}
                        onChange={e => setFilterCompany(e.target.value)}
                        className="p-2 border border-gray-300 rounded-lg text-sm bg-white"
                    >
                        <option value="">Все фирмы</option>
                        {uniqueCompanies.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                )}
            </div>

            {/* === ДАШБОРД === */}
            {summary && (
                <div className="bg-white p-6 rounded-lg shadow-md mb-8">
                    <h2 className="text-xl font-semibold mb-4 text-gray-700">Общая сводка</h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                        <div className="p-4 rounded-lg bg-blue-50">
                            <p className="text-sm text-blue-600 font-medium">Куплено</p>
                            <p className="font-bold text-xl md:text-2xl text-blue-700">{formatCurrency(summary.total_purchased)}</p>
                        </div>
                        <div className="p-4 rounded-lg bg-orange-50">
                            <p className="text-sm text-orange-600 font-medium">Взято в долг</p>
                            <p className="font-bold text-xl md:text-2xl text-orange-700">{formatCurrency(summary.total_debt)}</p>
                        </div>
                        <div className="p-4 rounded-lg bg-green-50">
                            <p className="text-sm text-green-600 font-medium">Оплачено</p>
                            <p className="font-bold text-xl md:text-2xl text-green-700">{formatCurrency(summary.total_paid)}</p>
                        </div>
                        <div className={`p-4 rounded-lg ${summary.current_balance > 0 ? 'bg-red-50' : 'bg-gray-100'}`}>
                            <p className={`text-sm font-medium ${summary.current_balance > 0 ? 'text-red-600' : 'text-gray-600'}`}>
                                Остаток долга
                            </p>
                            <p className={`font-bold text-xl md:text-2xl ${summary.current_balance > 0 ? 'text-red-600' : 'text-gray-700'}`}>
                                {formatCurrency(summary.current_balance)}
                            </p>
                        </div>
                    </div>

                    {/* Детализация по лекарствам */}
                    {perMedicineSummary.length > 0 && (
                        <div className="mt-6">
                            <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">По лекарствам</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {perMedicineSummary.map((item, idx) => (
                                    <div key={idx} className="border rounded-lg p-3 bg-gray-50">
                                        <p className="font-semibold text-gray-800 mb-1">{item.name}</p>
                                        <div className="text-xs text-gray-600 space-y-0.5">
                                            <p>Куплено: <span className="text-blue-600 font-medium">{formatCurrency(item.purchased)}</span></p>
                                            <p>В долг: <span className="text-orange-600 font-medium">{formatCurrency(item.debt)}</span></p>
                                            <p>Оплачено: <span className="text-green-600 font-medium">{formatCurrency(item.paid)}</span></p>
                                            <p className="pt-1 border-t mt-1">
                                                Баланс: <span className={`font-bold ${item.balance > 0 ? 'text-red-600' : 'text-gray-700'}`}>
                                                    {formatCurrency(item.balance)}
                                                </span>
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* === ВКЛАДКИ === */}
            <div className="flex flex-wrap gap-2 mb-6">
                {['purchase', 'debt', 'payment', 'catalog'].map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)}
                        className={`py-2 px-4 rounded-lg font-medium transition-colors ${
                            activeTab === tab
                                ? 'bg-indigo-600 text-white shadow-md'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}>
                        {tab === 'purchase' ? '📦 Покупка' :
                         tab === 'debt' ? '📋 В долг' :
                         tab === 'payment' ? '💰 Оплата' : '📚 Каталог'}
                    </button>
                ))}
            </div>

            {/* === ФОРМЫ === */}
            <div className="bg-white p-6 rounded-lg shadow-md mb-8">
                {activeTab === 'purchase' && (
                    <>
                        <h2 className="text-xl font-semibold mb-4 text-gray-700">Добавить покупку</h2>
                        {renderPurchaseDebtFields('purchase')}
                    </>
                )}
                {activeTab === 'debt' && (
                    <>
                        <h2 className="text-xl font-semibold mb-4 text-gray-700">Взять в долг</h2>
                        {renderPurchaseDebtFields('debt')}
                    </>
                )}
                {activeTab === 'payment' && (
                    <>
                        <h2 className="text-xl font-semibold mb-4 text-gray-700">Добавить оплату</h2>
                        <form onSubmit={handleAddPayment} className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Дата</label>
                                    <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)}
                                        required className="mt-1 w-full p-2 border rounded-md" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Лекарство</label>
                                    <select value={paymentMedicineId} onChange={e => setPaymentMedicineId(e.target.value)}
                                        className="mt-1 w-full p-2 border rounded-md bg-white">
                                        <option value="">-- Общая оплата --</option>
                                        {medicines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Сумма</label>
                                    <input type="number" step="0.01" placeholder="5000"
                                        value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)}
                                        required className="mt-1 w-full p-2 border rounded-md" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Описание</label>
                                    <input type="text" placeholder="Оплата за лекарства"
                                        value={paymentDescription} onChange={e => setPaymentDescription(e.target.value)}
                                        className="mt-1 w-full p-2 border rounded-md" />
                                </div>
                            </div>
                            <button type="submit" disabled={isSubmitting}
                                className="w-full py-2 px-4 rounded-md text-white font-medium bg-green-600 hover:bg-green-700 disabled:bg-green-300 transition-colors">
                                {isSubmitting ? 'Сохранение...' : '💰 Записать оплату'}
                            </button>
                        </form>
                    </>
                )}
            </div>

            {/* === ТАБЛИЦА ИСТОРИИ === */}
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
                <div className="p-6 pb-3">
                    <h2 className="text-xl font-semibold text-gray-700">История операций</h2>
                    <p className="text-sm text-gray-500 mt-1">
                        Всего записей: {filteredTransactions.length}
                        {showHidden && <span className="ml-2 text-orange-500">(включая скрытые)</span>}
                    </p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-xs text-gray-600 uppercase">
                            <tr>
                                <th className="px-4 py-3">Дата</th>
                                <th className="px-4 py-3">Тип</th>
                                <th className="px-4 py-3">Лекарство</th>
                                <th className="px-4 py-3">Кол-во</th>
                                <th className="px-4 py-3">Цена за ед.</th>
                                <th className="px-4 py-3">Сумма</th>
                                <th className="px-4 py-3">Фирма</th>
                                <th className="px-4 py-3">Описание</th>
                                <th className="px-4 py-3 text-right">Действия</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan="8" className="text-center py-8 text-gray-400">Загрузка...</td></tr>
                            ) : filteredTransactions.length === 0 ? (
                                <tr><td colSpan="9" className="text-center py-8 text-gray-400">Операций пока нет.</td></tr>
                            ) : filteredTransactions.map(t => {
                                const typeInfo = typeLabels[t.transaction_type] || {};
                                return (
                                    <tr key={t.id} className={`border-b transition-colors ${t.is_hidden ? 'opacity-50 bg-gray-50' : 'hover:bg-gray-50'}`}>
                                        <td className="px-4 py-3">
                                            <p className="font-medium">{new Date(t.transaction_date).toLocaleDateString('ru-RU')}</p>
                                            <p className="text-xs text-gray-400">
                                                {new Date(t.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-block px-2 py-1 text-xs font-semibold rounded-full ${typeInfo.bg} ${typeInfo.color}`}>
                                                {typeInfo.label}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 font-medium text-gray-800">
                                            {t.medicine?.name || '–'}
                                        </td>
                                        <td className="px-4 py-3">
                                            {t.quantity ? `${t.quantity} ${t.unit || ''}` : '–'}
                                        </td>
                                        <td className="px-4 py-3">
                                            {t.price_per_unit ? formatCurrency(t.price_per_unit) : '–'}
                                        </td>
                                        <td className={`px-4 py-3 font-semibold ${
                                            t.transaction_type === 'payment' ? 'text-green-600' :
                                            t.transaction_type === 'debt' ? 'text-orange-600' : 'text-blue-600'
                                        }`}>
                                            {t.transaction_type === 'payment' ? '−' : '+'}{formatCurrency(t.amount)}
                                        </td>
                                        <td className="px-4 py-3 text-gray-600 text-xs max-w-[120px] truncate" title={t.company}>
                                            {t.company || '–'}
                                        </td>
                                        <td className="px-4 py-3 text-gray-600 text-xs max-w-[150px] truncate" title={t.description}>
                                            {t.description || '–'}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <div className="flex gap-2 justify-end">
                                                <button
                                                    onClick={() => handleToggleHidden(t.id, t.is_hidden)}
                                                    title={t.is_hidden ? 'Показать' : 'Скрыть'}
                                                    className="text-gray-400 hover:text-gray-700 transition-colors px-2 py-2 -my-2">
                                                    {t.is_hidden ? '👁️' : '🙈'}
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(t.id)}
                                                    className="text-red-400 hover:text-red-600 transition-colors px-2 py-2 -my-2">
                                                    🗑️
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

export default MedicinesPage;