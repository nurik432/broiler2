// src/pages/GasPage.jsx

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { forecastGasBalance } from '../utils/gasForecast';

function GasPage() {
    // --- Данные ---
    const [readings, setReadings] = useState([]);
    const [topups, setTopups] = useState([]);
    const [priceHistory, setPriceHistory] = useState([]);
    const [loading, setLoading] = useState(true);

    // --- Вкладки: reading / topup / price ---
    const [activeTab, setActiveTab] = useState('reading');

    // --- Показать скрытые ---
    const [showHidden, setShowHidden] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // --- Форма показания счётчика ---
    const [readingDate, setReadingDate] = useState(new Date().toISOString().slice(0, 10));
    const [readingValue, setReadingValue] = useState('');
    const [readingDescription, setReadingDescription] = useState('');

    // --- Форма пополнения баланса ---
    const [topupDate, setTopupDate] = useState(new Date().toISOString().slice(0, 10));
    const [topupAmount, setTopupAmount] = useState('');
    const [topupDescription, setTopupDescription] = useState('');

    // --- Форма изменения цены ---
    const [newPriceDate, setNewPriceDate] = useState(new Date().toISOString().slice(0, 10));
    const [newPrice, setNewPrice] = useState('');

    // --- Загрузка данных ---
    const fetchData = async () => {
        setLoading(true);
        const [readingsRes, topupsRes, priceRes] = await Promise.all([
            supabase.from('gas_meter_readings').select('*')
                .order('reading_date', { ascending: false })
                .order('created_at', { ascending: false }),
            supabase.from('gas_topups').select('*')
                .order('transaction_date', { ascending: false })
                .order('created_at', { ascending: false }),
            supabase.from('gas_price_history').select('*')
                .order('effective_date', { ascending: false })
        ]);

        if (readingsRes.error) console.error('Ошибка показаний:', readingsRes.error);
        else setReadings(readingsRes.data);

        if (topupsRes.error) console.error('Ошибка пополнений:', topupsRes.error);
        else setTopups(topupsRes.data);

        if (priceRes.error) console.error('Ошибка цены:', priceRes.error);
        else setPriceHistory(priceRes.data);

        setLoading(false);
    };

    useEffect(() => { fetchData(); }, []);

    // --- Отфильтрованные по "показать скрытые" ---
    const filteredReadings = useMemo(() =>
        readings.filter(r => showHidden ? true : !r.is_hidden), [readings, showHidden]);
    const filteredTopups = useMemo(() =>
        topups.filter(t => showHidden ? true : !t.is_hidden), [topups, showHidden]);

    // --- Последнее показание (для расчёта расхода) ---
    const previousReading = useMemo(() => {
        const sorted = [...readings].sort((a, b) => new Date(b.reading_date) - new Date(a.reading_date));
        return sorted[0] || null;
    }, [readings]);

    // --- Действующая цена (последняя со вступившей датой) ---
    const currentPrice = useMemo(() => {
        const today = new Date();
        const applicable = priceHistory
            .filter(p => new Date(p.effective_date) <= today)
            .sort((a, b) => new Date(b.effective_date) - new Date(a.effective_date));
        if (applicable.length > 0) return applicable[0];
        const sorted = [...priceHistory].sort((a, b) => new Date(a.effective_date) - new Date(b.effective_date));
        return sorted[0] || null;
    }, [priceHistory]);

    // --- Баланс: пополнения минус списания за расход ---
    const summary = useMemo(() => {
        const totalTopups = filteredTopups.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
        const totalConsumedAmount = filteredReadings.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
        const currentBalance = totalTopups - totalConsumedAmount;
        return { totalTopups, totalConsumedAmount, currentBalance };
    }, [filteredTopups, filteredReadings]);

    const forecast = useMemo(() =>
        forecastGasBalance(filteredReadings, summary.currentBalance), [filteredReadings, summary.currentBalance]);

    // --- Предпросмотр расхода для новой записи показания ---
    const readingPreview = useMemo(() => {
        const value = Number(readingValue);
        if (!readingValue || !value) return null;
        const consumption = previousReading ? value - previousReading.reading_value : null;
        const amount = (consumption != null && currentPrice) ? consumption * currentPrice.price : null;
        return { consumption, amount };
    }, [readingValue, previousReading, currentPrice]);

    // --- Добавление показания счётчика ---
    const handleAddReading = async (e) => {
        e.preventDefault();
        const value = Number(readingValue);
        if (!readingValue || value < 0) {
            alert('Введите корректное показание счётчика.');
            return;
        }
        if (previousReading && value < previousReading.reading_value) {
            alert(`Новое показание (${value}) меньше предыдущего (${previousReading.reading_value}). Проверьте значение.`);
            return;
        }

        setIsSubmitting(true);
        const { data: { user } } = await supabase.auth.getUser();
        const consumption = previousReading ? value - previousReading.reading_value : null;
        const priceVal = currentPrice ? Number(currentPrice.price) : null;
        const amount = (consumption != null && priceVal != null) ? consumption * priceVal : null;

        const { error } = await supabase.from('gas_meter_readings').insert([{
            reading_date: readingDate,
            reading_value: value,
            consumption_m3: consumption,
            price_per_m3: priceVal,
            amount,
            description: readingDescription || null,
            user_id: user.id
        }]);

        if (error) {
            alert('Ошибка: ' + error.message);
        } else {
            setReadingValue(''); setReadingDescription('');
            await fetchData();
        }
        setIsSubmitting(false);
    };

    // --- Добавление пополнения баланса ---
    const handleAddTopup = async (e) => {
        e.preventDefault();
        const amountVal = Number(topupAmount);
        if (amountVal <= 0) {
            alert('Сумма пополнения должна быть больше нуля.');
            return;
        }

        setIsSubmitting(true);
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase.from('gas_topups').insert([{
            transaction_date: topupDate,
            amount: amountVal,
            description: topupDescription || null,
            user_id: user.id
        }]);

        if (error) {
            alert('Ошибка: ' + error.message);
        } else {
            setTopupAmount(''); setTopupDescription('');
            await fetchData();
        }
        setIsSubmitting(false);
    };

    // --- Добавление новой цены ---
    const handleAddPrice = async (e) => {
        e.preventDefault();
        const priceVal = Number(newPrice);
        if (priceVal <= 0) {
            alert('Цена должна быть больше нуля.');
            return;
        }

        setIsSubmitting(true);
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase.from('gas_price_history').insert([{
            price: priceVal,
            effective_date: newPriceDate,
            user_id: user.id
        }]);

        if (error) {
            alert('Ошибка: ' + error.message);
        } else {
            setNewPrice('');
            await fetchData();
        }
        setIsSubmitting(false);
    };

    // --- Скрыть/показать позицию ---
    const handleToggleHidden = async (table, id, currentHidden) => {
        const { error } = await supabase.from(table).update({ is_hidden: !currentHidden }).eq('id', id);
        if (error) alert('Ошибка: ' + error.message);
        else fetchData();
    };

    // --- Удалить запись ---
    const handleDelete = async (table, id, warning) => {
        if (window.confirm(warning)) {
            await supabase.from(table).delete().eq('id', id);
            fetchData();
        }
    };

    const formatCurrency = (value) =>
        new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'TJS' }).format(value || 0);

    const balanceColorClasses = summary.currentBalance <= 0
        ? { bg: 'bg-red-50', text: 'text-red-600', value: 'text-red-700' }
        : (forecast && forecast.daysRemaining != null && forecast.daysRemaining < 7
            ? { bg: 'bg-orange-50', text: 'text-orange-600', value: 'text-orange-700' }
            : { bg: 'bg-green-50', text: 'text-green-600', value: 'text-green-700' });

    return (
        <div>
            {/* Заголовок + переключатель скрытых */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-3">
                <h1 className="text-3xl font-bold text-gray-800">⛽ Учёт газа</h1>
                <label className="flex items-center text-sm text-gray-600 cursor-pointer select-none">
                    <input type="checkbox" checked={showHidden} onChange={() => setShowHidden(!showHidden)}
                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                    <span className="ml-2">Показать скрытые позиции</span>
                </label>
            </div>

            {/* === ДАШБОРД === */}
            <div className="bg-white p-6 rounded-lg shadow-md mb-8">
                <h2 className="text-xl font-semibold mb-4 text-gray-700">Баланс и прогноз</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                    <div className={`p-4 rounded-lg ${balanceColorClasses.bg}`}>
                        <p className={`text-sm font-medium ${balanceColorClasses.text}`}>Текущий баланс</p>
                        <p className={`font-bold text-xl md:text-2xl ${balanceColorClasses.value}`}>{formatCurrency(summary.currentBalance)}</p>
                    </div>
                    <div className="p-4 rounded-lg bg-blue-50">
                        <p className="text-sm text-blue-600 font-medium">Цена газа</p>
                        <p className="font-bold text-xl md:text-2xl text-blue-700">
                            {currentPrice ? `${currentPrice.price} смн/м³` : '—'}
                        </p>
                    </div>
                    <div className="p-4 rounded-lg bg-gray-50">
                        <p className="text-sm text-gray-600 font-medium">Средний расход</p>
                        <p className="font-bold text-xl md:text-2xl text-gray-800">
                            {forecast ? `${forecast.dailyM3} м³/день` : '—'}
                        </p>
                    </div>
                    <div className={`p-4 rounded-lg ${forecast && forecast.daysRemaining != null && forecast.daysRemaining < 7 ? 'bg-red-50' : 'bg-gray-50'}`}>
                        <p className={`text-sm font-medium ${forecast && forecast.daysRemaining != null && forecast.daysRemaining < 7 ? 'text-red-600' : 'text-gray-600'}`}>
                            Хватит на
                        </p>
                        <p className={`font-bold text-xl md:text-2xl ${forecast && forecast.daysRemaining != null && forecast.daysRemaining < 7 ? 'text-red-700' : 'text-gray-800'}`}>
                            {forecast && forecast.daysRemaining != null ? `${forecast.daysRemaining} дн.` : 'нет данных'}
                        </p>
                        {forecast && forecast.projectedEmptyDate && (
                            <p className="text-xs text-gray-400 mt-1">
                                до {forecast.projectedEmptyDate.toLocaleDateString('ru-RU')}
                            </p>
                        )}
                    </div>
                </div>
                {readings.length < 2 && (
                    <p className="text-sm text-gray-400 mt-4">
                        Прогноз появится после второго показания счётчика — нужна хотя бы одна пара точек, чтобы посчитать расход.
                    </p>
                )}
            </div>

            {/* === ВКЛАДКИ === */}
            <div className="flex flex-wrap gap-2 mb-6">
                {['reading', 'topup', 'price'].map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)}
                        className={`py-2 px-4 rounded-lg font-medium transition-colors ${
                            activeTab === tab
                                ? 'bg-indigo-600 text-white shadow-md'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}>
                        {tab === 'reading' ? '🔢 Показания счётчика' :
                         tab === 'topup' ? '💰 Пополнение баланса' : '🏷️ Цена газа'}
                    </button>
                ))}
            </div>

            {/* === ФОРМЫ === */}
            <div className="bg-white p-6 rounded-lg shadow-md mb-8">
                {activeTab === 'reading' && (
                    <>
                        <h2 className="text-xl font-semibold mb-4 text-gray-700">Внести показание счётчика</h2>
                        <form onSubmit={handleAddReading} className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Дата</label>
                                    <input type="date" value={readingDate} onChange={e => setReadingDate(e.target.value)}
                                        required className="mt-1 w-full p-2 border rounded-md" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Показание счётчика (м³)</label>
                                    <input type="number" step="0.001" placeholder={previousReading ? String(previousReading.reading_value) : '0'}
                                        value={readingValue} onChange={e => setReadingValue(e.target.value)}
                                        required className="mt-1 w-full p-2 border rounded-md" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Описание</label>
                                    <input type="text" placeholder="(необязательно)"
                                        value={readingDescription} onChange={e => setReadingDescription(e.target.value)}
                                        className="mt-1 w-full p-2 border rounded-md" />
                                </div>
                            </div>
                            {previousReading && (
                                <p className="text-xs text-gray-400">
                                    Предыдущее показание: {previousReading.reading_value} м³ ({new Date(previousReading.reading_date).toLocaleDateString('ru-RU')})
                                </p>
                            )}
                            {readingPreview && readingPreview.consumption != null && (
                                <div className="text-sm text-gray-600">
                                    Расход: <strong className="text-lg">{readingPreview.consumption} м³</strong>
                                    {readingPreview.amount != null && (
                                        <>
                                            {' '}× {currentPrice.price} смн = <strong className="text-lg">{formatCurrency(readingPreview.amount)}</strong>
                                            <span className="ml-2 text-gray-400">спишется с баланса</span>
                                        </>
                                    )}
                                </div>
                            )}
                            {!previousReading && (
                                <p className="text-sm text-gray-400">Это первое показание — расход посчитается со следующего.</p>
                            )}
                            {!currentPrice && (
                                <p className="text-sm text-orange-500">Цена газа не задана — сначала добавьте её во вкладке «Цена газа».</p>
                            )}
                            <button type="submit" disabled={isSubmitting}
                                className="w-full py-2 px-4 rounded-md text-white font-medium bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 transition-colors">
                                {isSubmitting ? 'Сохранение...' : '🔢 Записать показание'}
                            </button>
                        </form>
                    </>
                )}
                {activeTab === 'topup' && (
                    <>
                        <h2 className="text-xl font-semibold mb-4 text-gray-700">Внести пополнение баланса</h2>
                        <form onSubmit={handleAddTopup} className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Дата</label>
                                    <input type="date" value={topupDate} onChange={e => setTopupDate(e.target.value)}
                                        required className="mt-1 w-full p-2 border rounded-md" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Сумма</label>
                                    <input type="number" step="0.01" placeholder="5000"
                                        value={topupAmount} onChange={e => setTopupAmount(e.target.value)}
                                        required className="mt-1 w-full p-2 border rounded-md" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Описание</label>
                                    <input type="text" placeholder="Предоплата за газ"
                                        value={topupDescription} onChange={e => setTopupDescription(e.target.value)}
                                        className="mt-1 w-full p-2 border rounded-md" />
                                </div>
                            </div>
                            <button type="submit" disabled={isSubmitting}
                                className="w-full py-2 px-4 rounded-md text-white font-medium bg-green-600 hover:bg-green-700 disabled:bg-green-300 transition-colors">
                                {isSubmitting ? 'Сохранение...' : '💰 Записать пополнение'}
                            </button>
                        </form>
                    </>
                )}
                {activeTab === 'price' && (
                    <>
                        <h2 className="text-xl font-semibold mb-4 text-gray-700">Изменить цену газа</h2>
                        <form onSubmit={handleAddPrice} className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Действует с</label>
                                    <input type="date" value={newPriceDate} onChange={e => setNewPriceDate(e.target.value)}
                                        required className="mt-1 w-full p-2 border rounded-md" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Цена за м³</label>
                                    <input type="number" step="0.01" placeholder="2.82"
                                        value={newPrice} onChange={e => setNewPrice(e.target.value)}
                                        required className="mt-1 w-full p-2 border rounded-md" />
                                </div>
                            </div>
                            <p className="text-xs text-gray-400">
                                Новая цена применяется к показаниям счётчика, внесённым после её даты вступления в силу. Старые расчёты не пересчитываются.
                            </p>
                            <button type="submit" disabled={isSubmitting}
                                className="w-full py-2 px-4 rounded-md text-white font-medium bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 transition-colors">
                                {isSubmitting ? 'Сохранение...' : '🏷️ Сохранить цену'}
                            </button>
                        </form>
                    </>
                )}
            </div>

            {/* === ИСТОРИЯ: ПОКАЗАНИЯ === */}
            {activeTab === 'reading' && (
                <div className="bg-white rounded-lg shadow-md overflow-hidden mb-8">
                    <div className="p-6 pb-3">
                        <h2 className="text-xl font-semibold text-gray-700">История показаний</h2>
                        <p className="text-sm text-gray-500 mt-1">Всего записей: {filteredReadings.length}</p>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 text-xs text-gray-600 uppercase">
                                <tr>
                                    <th className="px-4 py-3">Дата</th>
                                    <th className="px-4 py-3">Показание</th>
                                    <th className="px-4 py-3">Расход</th>
                                    <th className="px-4 py-3">Сумма списания</th>
                                    <th className="px-4 py-3">Описание</th>
                                    <th className="px-4 py-3 text-right">Действия</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan="6" className="text-center py-8 text-gray-400">Загрузка...</td></tr>
                                ) : filteredReadings.length === 0 ? (
                                    <tr><td colSpan="6" className="text-center py-8 text-gray-400">Показаний пока нет.</td></tr>
                                ) : filteredReadings.map(r => (
                                    <tr key={r.id} className={`border-b transition-colors ${r.is_hidden ? 'opacity-50 bg-gray-50' : 'hover:bg-gray-50'}`}>
                                        <td className="px-4 py-3 font-medium">{new Date(r.reading_date).toLocaleDateString('ru-RU')}</td>
                                        <td className="px-4 py-3">{r.reading_value} м³</td>
                                        <td className="px-4 py-3">{r.consumption_m3 != null ? `${r.consumption_m3} м³` : '–'}</td>
                                        <td className="px-4 py-3 font-semibold text-red-600">
                                            {r.amount != null ? `−${formatCurrency(r.amount)}` : '–'}
                                        </td>
                                        <td className="px-4 py-3 text-gray-600">{r.description || '–'}</td>
                                        <td className="px-4 py-3 text-right">
                                            <div className="flex gap-2 justify-end">
                                                <button onClick={() => handleToggleHidden('gas_meter_readings', r.id, r.is_hidden)}
                                                    title={r.is_hidden ? 'Показать' : 'Скрыть'}
                                                    className="text-gray-400 hover:text-gray-700 transition-colors px-2 py-2 -my-2">
                                                    {r.is_hidden ? '👁️' : '🙈'}
                                                </button>
                                                <button onClick={() => handleDelete('gas_meter_readings', r.id, 'Удалить это показание? Это повлияет на расчёт расхода и баланс.')}
                                                    className="text-red-400 hover:text-red-600 transition-colors px-2 py-2 -my-2">
                                                    🗑️
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* === ИСТОРИЯ: ПОПОЛНЕНИЯ === */}
            {activeTab === 'topup' && (
                <div className="bg-white rounded-lg shadow-md overflow-hidden mb-8">
                    <div className="p-6 pb-3">
                        <h2 className="text-xl font-semibold text-gray-700">История пополнений</h2>
                        <p className="text-sm text-gray-500 mt-1">Всего записей: {filteredTopups.length}</p>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 text-xs text-gray-600 uppercase">
                                <tr>
                                    <th className="px-4 py-3">Дата</th>
                                    <th className="px-4 py-3">Сумма</th>
                                    <th className="px-4 py-3">Описание</th>
                                    <th className="px-4 py-3 text-right">Действия</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan="4" className="text-center py-8 text-gray-400">Загрузка...</td></tr>
                                ) : filteredTopups.length === 0 ? (
                                    <tr><td colSpan="4" className="text-center py-8 text-gray-400">Пополнений пока нет.</td></tr>
                                ) : filteredTopups.map(t => (
                                    <tr key={t.id} className={`border-b transition-colors ${t.is_hidden ? 'opacity-50 bg-gray-50' : 'hover:bg-gray-50'}`}>
                                        <td className="px-4 py-3 font-medium">{new Date(t.transaction_date).toLocaleDateString('ru-RU')}</td>
                                        <td className="px-4 py-3 font-semibold text-green-600">+{formatCurrency(t.amount)}</td>
                                        <td className="px-4 py-3 text-gray-600">{t.description || '–'}</td>
                                        <td className="px-4 py-3 text-right">
                                            <div className="flex gap-2 justify-end">
                                                <button onClick={() => handleToggleHidden('gas_topups', t.id, t.is_hidden)}
                                                    title={t.is_hidden ? 'Показать' : 'Скрыть'}
                                                    className="text-gray-400 hover:text-gray-700 transition-colors px-2 py-2 -my-2">
                                                    {t.is_hidden ? '👁️' : '🙈'}
                                                </button>
                                                <button onClick={() => handleDelete('gas_topups', t.id, 'Удалить это пополнение? Это повлияет на баланс.')}
                                                    className="text-red-400 hover:text-red-600 transition-colors px-2 py-2 -my-2">
                                                    🗑️
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* === ИСТОРИЯ: ЦЕНЫ === */}
            {activeTab === 'price' && (
                <div className="bg-white rounded-lg shadow-md overflow-hidden mb-8">
                    <div className="p-6 pb-3">
                        <h2 className="text-xl font-semibold text-gray-700">История цен</h2>
                        <p className="text-sm text-gray-500 mt-1">Всего записей: {priceHistory.length}</p>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 text-xs text-gray-600 uppercase">
                                <tr>
                                    <th className="px-4 py-3">Действует с</th>
                                    <th className="px-4 py-3">Цена за м³</th>
                                    <th className="px-4 py-3 text-right">Действия</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan="3" className="text-center py-8 text-gray-400">Загрузка...</td></tr>
                                ) : priceHistory.length === 0 ? (
                                    <tr><td colSpan="3" className="text-center py-8 text-gray-400">Цена ещё не задана.</td></tr>
                                ) : priceHistory.map(p => (
                                    <tr key={p.id} className={`border-b transition-colors hover:bg-gray-50 ${currentPrice && p.id === currentPrice.id ? 'bg-blue-50' : ''}`}>
                                        <td className="px-4 py-3 font-medium">
                                            {new Date(p.effective_date).toLocaleDateString('ru-RU')}
                                            {currentPrice && p.id === currentPrice.id && (
                                                <span className="ml-2 text-xs font-semibold text-blue-600">текущая</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">{p.price} смн</td>
                                        <td className="px-4 py-3 text-right">
                                            <button onClick={() => handleDelete('gas_price_history', p.id, 'Удалить эту цену из истории?')}
                                                className="text-red-400 hover:text-red-600 transition-colors px-2 py-2 -my-2">
                                                🗑️
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

export default GasPage;
