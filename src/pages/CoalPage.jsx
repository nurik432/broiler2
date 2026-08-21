// src/pages/CoalPage.jsx

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';

function CoalPage() {
    // --- Данные ---
    const [transactions, setTransactions] = useState([]);
    const [activeBatches, setActiveBatches] = useState([]);
    const [loading, setLoading] = useState(true);

    // --- Вкладки: purchase / debt / payment ---
    const [activeTab, setActiveTab] = useState('purchase');

    // --- Показать скрытые ---
    const [showHidden, setShowHidden] = useState(false);

    // --- Форма покупки / долга ---
    const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
    const [quantity, setQuantity] = useState('');
    const [price, setPrice] = useState('');
    const [description, setDescription] = useState('');
    const [selectedBatchId, setSelectedBatchId] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // --- Форма платежа ---
    const [paymentAmount, setPaymentAmount] = useState('');
    const [paymentDescription, setPaymentDescription] = useState('');
    const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));

    // --- Загрузка данных ---
    const fetchData = async () => {
        setLoading(true);
        const [transRes, batchesRes] = await Promise.all([
            supabase
                .from('coal_transactions').select('*')
                .order('transaction_date', { ascending: false })
                .order('created_at', { ascending: false }),
            supabase.from('broiler_batches').select('id, batch_name').eq('is_active', true).or('is_summary.eq.false,is_summary.is.null')
        ]);

        if (transRes.error) console.error('Ошибка транзакций:', transRes.error);
        else setTransactions(transRes.data);

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
        return transactions.filter(t => showHidden ? true : !t.is_hidden);
    }, [transactions, showHidden]);

    // --- Дашборд считается из видимых записей ---
    const summary = useMemo(() => {
        const s = { total_kg: 0, total_purchased: 0, total_debt: 0, total_paid: 0, current_balance: 0 };
        filteredTransactions.forEach(t => {
            const amt = Number(t.amount) || 0;
            const kg = Number(t.quantity_kg) || 0;
            if (t.transaction_type === 'purchase') { s.total_purchased += amt; s.total_kg += kg; }
            else if (t.transaction_type === 'debt') { s.total_debt += amt; s.total_kg += kg; }
            else if (t.transaction_type === 'payment') { s.total_paid += amt; }
        });
        s.current_balance = s.total_debt - s.total_paid;
        return s;
    }, [filteredTransactions]);

    // --- Добавление покупки / долга ---
    const handleAddTransaction = async (e, type) => {
        e.preventDefault();
        const qty = Number(quantity);
        const priceVal = Number(price);
        const totalAmount = qty * priceVal;

        if (totalAmount <= 0) {
            alert('Сумма должна быть больше нуля.');
            return;
        }

        setIsSubmitting(true);
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase.from('coal_transactions').insert([{
            transaction_date: date,
            transaction_type: type,
            quantity_kg: qty,
            price_per_kg: priceVal,
            amount: totalAmount,
            description: description || null,
            batch_id: selectedBatchId || null,
            user_id: user.id
        }]);

        if (error) {
            alert('Ошибка: ' + error.message);
        } else {
            setQuantity(''); setPrice(''); setDescription('');
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
        const { error } = await supabase.from('coal_transactions').insert([{
            transaction_date: paymentDate,
            transaction_type: 'payment',
            quantity_kg: null,
            price_per_kg: null,
            amount: amountToPay,
            description: paymentDescription || 'Платеж за уголь',
            user_id: user.id
        }]);

        if (error) {
            alert('Ошибка: ' + error.message);
        } else {
            setPaymentAmount(''); setPaymentDescription('');
            await fetchData();
        }
        setIsSubmitting(false);
    };

    // --- Скрыть/показать позицию ---
    const handleToggleHidden = async (id, currentHidden) => {
        const { error } = await supabase
            .from('coal_transactions')
            .update({ is_hidden: !currentHidden })
            .eq('id', id);
        if (error) alert('Ошибка: ' + error.message);
        else fetchData();
    };

    // --- Удалить транзакцию ---
    const handleDelete = async (id) => {
        if (window.confirm('Удалить эту запись? Это повлияет на общий баланс.')) {
            await supabase.from('coal_transactions').delete().eq('id', id);
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

    // --- Форма покупки / долга (общая) ---
    // Inline helper for rendering purchase/debt form fields
    const renderPurchaseDebtFields = (type) => (
        <form onSubmit={(e) => handleAddTransaction(e, type)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700">Дата</label>
                    <input type="date" value={date} onChange={e => setDate(e.target.value)}
                        required className="mt-1 w-full p-2 border rounded-md" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Кол-во (кг)</label>
                    <input type="number" step="0.1" placeholder="1000"
                        value={quantity} onChange={e => setQuantity(e.target.value)}
                        required className="mt-1 w-full p-2 border rounded-md" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Цена за кг</label>
                    <input type="number" step="0.01" placeholder="3.50"
                        value={price} onChange={e => setPrice(e.target.value)}
                        required className="mt-1 w-full p-2 border rounded-md" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Описание</label>
                    <input type="text" placeholder="(необязательно)"
                        value={description} onChange={e => setDescription(e.target.value)}
                        className="mt-1 w-full p-2 border rounded-md" />
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
            {quantity && price && (
                <div className="text-sm text-gray-600">
                    Итого: <strong className="text-lg">{formatCurrency(Number(quantity) * Number(price))}</strong>
                    <span className="ml-2 text-gray-400">({quantity} кг × {price} за кг)</span>
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

    return (
        <div>
            {/* Заголовок + переключатель скрытых */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-3">
                <h1 className="text-3xl font-bold text-gray-800">🔥 Учёт угля</h1>
                <label className="flex items-center text-sm text-gray-600 cursor-pointer select-none">
                    <input type="checkbox" checked={showHidden} onChange={() => setShowHidden(!showHidden)}
                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                    <span className="ml-2">Показать скрытые позиции</span>
                </label>
            </div>

            {/* === ДАШБОРД === */}
            {summary && (
                <div className="bg-white p-6 rounded-lg shadow-md mb-8">
                    <h2 className="text-xl font-semibold mb-4 text-gray-700">Общая сводка</h2>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
                        <div className="p-4 rounded-lg bg-gray-50">
                            <p className="text-sm text-gray-600 font-medium">Всего (кг)</p>
                            <p className="font-bold text-xl md:text-2xl text-gray-800">{summary.total_kg || 0} кг</p>
                        </div>
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
                </div>
            )}

            {/* === ВКЛАДКИ === */}
            <div className="flex flex-wrap gap-2 mb-6">
                {['purchase', 'debt', 'payment'].map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)}
                        className={`py-2 px-4 rounded-lg font-medium transition-colors ${
                            activeTab === tab
                                ? 'bg-indigo-600 text-white shadow-md'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}>
                        {tab === 'purchase' ? '📦 Покупка' :
                         tab === 'debt' ? '📋 В долг' : '💰 Оплата'}
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
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Дата</label>
                                    <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)}
                                        required className="mt-1 w-full p-2 border rounded-md" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Сумма</label>
                                    <input type="number" step="0.01" placeholder="5000"
                                        value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)}
                                        required className="mt-1 w-full p-2 border rounded-md" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Описание</label>
                                    <input type="text" placeholder="Платёж за уголь"
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
                                <th className="px-4 py-3">Описание</th>
                                <th className="px-4 py-3">Кол-во / Цена</th>
                                <th className="px-4 py-3">Сумма</th>
                                <th className="px-4 py-3 text-right">Действия</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan="6" className="text-center py-8 text-gray-400">Загрузка...</td></tr>
                            ) : filteredTransactions.length === 0 ? (
                                <tr><td colSpan="6" className="text-center py-8 text-gray-400">Операций пока нет.</td></tr>
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
                                        <td className="px-4 py-3 text-gray-600">
                                            {t.description || '–'}
                                        </td>
                                        <td className="px-4 py-3">
                                            {t.quantity_kg ? (
                                                <p>{t.quantity_kg} кг <span className="text-gray-400">@ {t.price_per_kg}</span></p>
                                            ) : '–'}
                                        </td>
                                        <td className={`px-4 py-3 font-semibold ${
                                            t.transaction_type === 'payment' ? 'text-green-600' :
                                            t.transaction_type === 'debt' ? 'text-orange-600' : 'text-blue-600'
                                        }`}>
                                            {t.transaction_type === 'payment' ? '−' : '+'}{formatCurrency(t.amount)}
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

export default CoalPage;