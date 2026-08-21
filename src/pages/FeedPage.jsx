// src/pages/FeedPage.jsx

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';

const KG_PER_BAG = 40;

function FeedPage() {
    const [allDeliveries, setAllDeliveries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeBatches, setActiveBatches] = useState([]);

    // Состояние для фильтра архивных
    const [showArchived, setShowArchived] = useState(false);


    const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
    const [feedType, setFeedType] = useState('старт');
    const [bags, setBags] = useState('');
    const [selectedBatchId, setSelectedBatchId] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [editingId, setEditingId] = useState(null);
    const [editFormData, setEditFormData] = useState({});

    const [pricePerKg, setPricePerKg] = useState('');
    const [transactionType, setTransactionType] = useState('purchase');
    const [company, setCompany] = useState('');

    const formatCurrency = (value) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'TJS' }).format(value || 0);

    // 1. Загрузка данных
    const fetchData = async () => {
        setLoading(true);
        const [deliveriesRes, batchesRes] = await Promise.all([
            supabase.rpc('get_feed_deliveries'),
            supabase.from('broiler_batches').select('id, batch_name').eq('is_active', true).or('is_summary.eq.false,is_summary.is.null')
        ]);

        if (deliveriesRes.error) {
            console.error('Ошибка:', deliveriesRes.error);
            alert('Не удалось загрузить данные о корме.');
        } else {
            setAllDeliveries(deliveriesRes.data);
        }

        if (batchesRes.error) {
            console.error("Ошибка:", batchesRes.error);
        } else {
            setActiveBatches(batchesRes.data);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchData();
    }, []);

    // 2. Логика фильтрации и расчетов
    const filteredDeliveries = useMemo(() => {
        return allDeliveries.filter(delivery => {
            if (showArchived) return true;
            return !delivery.batch_id || delivery.batch_is_active === true;
        });
    }, [allDeliveries, showArchived]);

    // Сводка: кг и мешки
    const { feedTotalsKg, feedTotalsBags, totalFeedKg, totalFeedBags, feedCosts, totalFeedCost } = useMemo(() => {
        const kg = filteredDeliveries.reduce((acc, d) => {
            if (d.feed_type === 'старт') acc.start += d.quantity_kg;
            else if (d.feed_type === 'рост') acc.growth += d.quantity_kg;
            else if (d.feed_type === 'финиш') acc.finish += d.quantity_kg;
            return acc;
        }, { start: 0, growth: 0, finish: 0 });
        const b = { start: kg.start / KG_PER_BAG, growth: kg.growth / KG_PER_BAG, finish: kg.finish / KG_PER_BAG };
        const costs = filteredDeliveries.reduce((acc, d) => {
            const key = d.feed_type === 'старт' ? 'start' : d.feed_type === 'рост' ? 'growth' : 'finish';
            acc[key] += Number(d.amount) || 0;
            return acc;
        }, { start: 0, growth: 0, finish: 0 });
        const totalKg = kg.start + kg.growth + kg.finish;
        const totalCost = costs.start + costs.growth + costs.finish;
        return { feedTotalsKg: kg, feedTotalsBags: b, totalFeedKg: totalKg, totalFeedBags: totalKg / KG_PER_BAG, feedCosts: costs, totalFeedCost: totalCost };
    }, [filteredDeliveries]);


    // 3. CRUD функции
    const handleSubmit = async (e) => {
        e.preventDefault();
        const bagsNum = Number(bags);
        if (bagsNum <= 0) { alert('Количество мешков должно быть больше нуля.'); return; }
        const priceNum = Number(pricePerKg);
        const quantityKg = bagsNum * KG_PER_BAG;
        setIsSubmitting(true);
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase.from('feed_deliveries').insert([{
            delivery_date: date, feed_type: feedType, quantity_kg: quantityKg,
            user_id: user.id, batch_id: selectedBatchId || null,
            price_per_kg: priceNum || null,
            amount: priceNum > 0 ? quantityKg * priceNum : null,
            transaction_type: priceNum > 0 ? transactionType : null,
            company: company || null
        }]);
        if (error) { alert(error.message); }
        else {
            setBags(''); setSelectedBatchId(''); setPricePerKg(''); setCompany('');
            await fetchData();
        }
        setIsSubmitting(false);
    };

    const handleEditClick = (delivery) => { setEditingId(delivery.id); setEditFormData({ delivery_date: delivery.delivery_date, feed_type: delivery.feed_type, bags: delivery.quantity_kg / KG_PER_BAG, batch_id: delivery.batch_id || '' }); };
    const handleUpdate = async (deliveryId) => {
        const { delivery_date, feed_type, bags: editBags, batch_id } = editFormData;
        const { error } = await supabase.from('feed_deliveries').update({ delivery_date, feed_type, quantity_kg: Number(editBags) * KG_PER_BAG, batch_id: batch_id || null }).eq('id', deliveryId);
        if (error) { alert(error.message); }
        else { setEditingId(null); await fetchData(); }
    };
    const handleDelete = async (deliveryId) => { if (window.confirm("Удалить запись?")) { await supabase.from('feed_deliveries').delete().eq('id', deliveryId); await fetchData(); } };

    return (
        <div>
            <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">Учет корма</h1>
                <label className="flex items-center text-sm text-gray-600 cursor-pointer">
                    <input type="checkbox" checked={showArchived} onChange={() => setShowArchived(!showArchived)} className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"/>
                    <span className="ml-2">Показать поставки для архивных партий</span>
                </label>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-md mb-8">
                <h2 className="text-xl font-semibold mb-4 text-gray-700">Сводка по корму</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                    <div className="p-3 rounded-lg bg-blue-50">
                        <p className="text-sm text-blue-600 font-medium">Старт</p>
                        <p className="font-bold text-xl md:text-2xl text-blue-700">{feedTotalsBags.start.toFixed(1)} меш.</p>
                        <p className="text-xs text-blue-400">{feedTotalsKg.start} кг</p>
                        {feedCosts.start > 0 && <p className="text-sm font-semibold text-blue-800 mt-1">{formatCurrency(feedCosts.start)}</p>}
                    </div>
                    <div className="p-3 rounded-lg bg-green-50">
                        <p className="text-sm text-green-600 font-medium">Рост</p>
                        <p className="font-bold text-xl md:text-2xl text-green-700">{feedTotalsBags.growth.toFixed(1)} меш.</p>
                        <p className="text-xs text-green-400">{feedTotalsKg.growth} кг</p>
                        {feedCosts.growth > 0 && <p className="text-sm font-semibold text-green-800 mt-1">{formatCurrency(feedCosts.growth)}</p>}
                    </div>
                    <div className="p-3 rounded-lg bg-yellow-50">
                        <p className="text-sm text-yellow-600 font-medium">Финиш</p>
                        <p className="font-bold text-xl md:text-2xl text-yellow-700">{feedTotalsBags.finish.toFixed(1)} меш.</p>
                        <p className="text-xs text-yellow-400">{feedTotalsKg.finish} кг</p>
                        {feedCosts.finish > 0 && <p className="text-sm font-semibold text-yellow-800 mt-1">{formatCurrency(feedCosts.finish)}</p>}
                    </div>
                    <div className="p-3 rounded-lg bg-gray-100">
                        <p className="text-sm font-semibold text-gray-700">Всего</p>
                        <p className="font-bold text-xl md:text-2xl text-gray-900">{totalFeedBags.toFixed(1)} меш.</p>
                        <p className="text-xs text-gray-500">{totalFeedKg} кг</p>
                        {totalFeedCost > 0 && <p className="text-sm font-bold text-gray-900 mt-1">{formatCurrency(totalFeedCost)}</p>}
                    </div>
                </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-md mb-8">
                <h2 className="text-xl font-semibold mb-4 text-gray-700">Добавить приход корма</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-8 gap-4 items-end">
                        <div><label className="block text-sm font-medium">Дата прихода</label><input type="date" value={date} onChange={e => setDate(e.target.value)} required className="mt-1 w-full p-2 border rounded-md"/></div>
                        <div><label className="block text-sm font-medium">Тип корма</label><select value={feedType} onChange={e => setFeedType(e.target.value)} required className="mt-1 w-full p-2 border rounded-md bg-white"><option value="старт">Старт</option><option value="рост">Рост</option><option value="финиш">Финиш</option></select></div>
                        <div>
                            <label className="block text-sm font-medium">Мешки (1 меш. = {KG_PER_BAG} кг)</label>
                            <input type="number" step="0.5" placeholder="10" value={bags} onChange={e => setBags(e.target.value)} required className="mt-1 w-full p-2 border rounded-md"/>
                        </div>
                        <div className="md:col-span-1"><label className="block text-sm font-medium">Привязать к партии</label>
                            <select value={selectedBatchId} onChange={e => setSelectedBatchId(e.target.value)} className="mt-1 w-full p-2 border rounded-md bg-white">
                                <option value="">-- Не привязывать --</option>
                                {activeBatches.map(b => <option key={b.id} value={b.id}>{b.batch_name}</option>)}
                            </select>
                        </div>
                        <div><label className="block text-sm font-medium">Цена за кг</label><input type="number" step="0.01" placeholder="5.00" value={pricePerKg} onChange={e => setPricePerKg(e.target.value)} className="mt-1 w-full p-2 border rounded-md"/></div>
                        <div><label className="block text-sm font-medium">Тип оплаты</label><select value={transactionType} onChange={e => setTransactionType(e.target.value)} className="mt-1 w-full p-2 border rounded-md bg-white"><option value="purchase">Сразу</option><option value="debt">В долг</option></select></div>
                        <div><label className="block text-sm font-medium">Фирма</label><input type="text" placeholder="(необязательно)" value={company} onChange={e => setCompany(e.target.value)} className="mt-1 w-full p-2 border rounded-md"/></div>
                        <button type="submit" disabled={isSubmitting} className="w-full bg-indigo-600 text-white p-2 rounded-md hover:bg-indigo-700 disabled:bg-gray-400">{isSubmitting ? 'Добавление...' : 'Добавить'}</button>
                    </div>
                    {bags && (
                        <div className="text-sm text-gray-600">
                            = <strong className="text-lg">{(Number(bags) * KG_PER_BAG).toFixed(0)} кг</strong>
                            <span className="ml-2 text-gray-400">({bags} меш. × {KG_PER_BAG} кг)</span>
                        </div>
                    )}
                </form>
            </div>

            <div className="bg-white rounded-lg shadow-md overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 text-xs text-gray-700 uppercase">
                        <tr>
                            <th className="px-6 py-3">Дата / Время</th><th className="px-6 py-3">Тип корма</th>
                            <th className="px-6 py-3">Мешки</th><th className="px-6 py-3">Кг</th><th className="px-6 py-3">Сумма</th><th className="px-6 py-3">Партия</th>
                            <th className="px-6 py-3 text-right">Действия</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? ( <tr><td colSpan="6" className="text-center py-4">Загрузка...</td></tr> ) :
                        filteredDeliveries.map(d => (
                            <tr key={d.id} className="border-b hover:bg-gray-50">
                                {editingId === d.id ? (
                                    <>
                                        <td className="p-2"><input type="date" value={editFormData.delivery_date} onChange={e => setEditFormData({...editFormData, delivery_date: e.target.value})} className="p-1 border rounded w-full"/></td>
                                        <td className="p-2"><select value={editFormData.feed_type} onChange={e => setEditFormData({...editFormData, feed_type: e.target.value})} className="p-1 border rounded w-full bg-white"><option value="старт">Старт</option><option value="рост">Рост</option><option value="финиш">Финиш</option></select></td>
                                        <td className="p-2"><input type="number" step="0.5" value={editFormData.bags} onChange={e => setEditFormData({...editFormData, bags: e.target.value})} className="p-1 border rounded w-24" placeholder="меш."/></td>
                                        <td className="p-2 text-xs text-gray-500">{((Number(editFormData.bags) || 0) * KG_PER_BAG).toFixed(0)} кг</td>
                                        <td className="p-2"></td>
                                        <td className="p-2"><select value={editFormData.batch_id} onChange={e => setEditFormData({...editFormData, batch_id: e.target.value})} className="p-1 border rounded w-full bg-white"><option value="">-- Не привязывать --</option>{activeBatches.map(b => <option key={b.id} value={b.id}>{b.batch_name}</option>)}</select></td>
                                        <td className="px-6 py-4 text-right flex gap-1 justify-end"><button onClick={() => handleUpdate(d.id)} className="font-medium text-green-600 px-2 py-2">Сохранить</button><button onClick={() => setEditingId(null)} className="font-medium text-gray-500 px-2 py-2">Отмена</button></td>
                                    </>
                                ) : (
                                    <>
                                        <td className="px-6 py-4"><p className="font-medium">{new Date(d.delivery_date).toLocaleDateString()}</p><p className="text-xs text-gray-400">{new Date(d.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</p></td>
                                        <td className="px-6 py-4 font-medium text-gray-900">{d.feed_type.charAt(0).toUpperCase() + d.feed_type.slice(1)}</td>
                                        <td className="px-6 py-4 font-semibold">{(d.quantity_kg / KG_PER_BAG).toFixed(1)} меш.</td>
                                        <td className="px-6 py-4 text-gray-500">{d.quantity_kg} кг</td>
                                        <td className="px-6 py-4 font-medium text-gray-800">
                                            {d.amount > 0 ? formatCurrency(d.amount) : '–'}
                                        </td>
                                        <td className="px-6 py-4">{d.batch_name ? <span className={`text-xs rounded-full px-2 py-1 ${d.batch_is_active ? 'bg-blue-100 text-blue-800' : 'bg-gray-200 text-gray-600'}`}>{d.batch_name}</span> : '–'}</td>
                                        <td className="px-6 py-4 text-right flex gap-1 justify-end"><button onClick={() => handleEditClick(d)} className="font-medium text-blue-600 hover:underline px-2 py-2">Редактировать</button><button onClick={() => handleDelete(d.id)} className="font-medium text-red-600 hover:underline px-2 py-2">Удалить</button></td>
                                    </>
                                )}
                            </tr>
                        ))}
                         { !loading && filteredDeliveries.length === 0 && (<tr><td colSpan="6" className="text-center py-4 text-gray-500">Записей о приходе корма не найдено.</td></tr>) }
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default FeedPage;