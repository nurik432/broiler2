// src/pages/SalesPage.jsx

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';

function SalesPage() {
    // --- ОСНОВНЫЕ СОСТОЯНИЯ ---
    const [allSales, setAllSales] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeBatches, setActiveBatches] = useState([]);

    // --- Состояние для фильтра архивных ---
    const [showArchived, setShowArchived] = useState(false);

    // --- Состояния для формы ДОБАВЛЕНИЯ ---
    const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
    const [customer, setCustomer] = useState('');
    const [weight, setWeight] = useState('');
    const [price, setPrice] = useState('');
    const [selectedBatchId, setSelectedBatchId] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // --- Состояния для РЕДАКТИРОВАНИЯ ПРОДАЖИ ---
    const [editingSaleId, setEditingSaleId] = useState(null);
    const [editSaleFormData, setEditSaleFormData] = useState({});

    // --- Состояния для МОДАЛЬНОГО ОКНА ПЛАТЕЖЕЙ ---
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedSale, setSelectedSale] = useState(null);
    const [modalPayments, setModalPayments] = useState([]);
    const [paymentAmount, setPaymentAmount] = useState('');
    const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));

    // --- Состояния для РЕДАКТИРОВАНИЯ ПЛАТЕЖА ---
    const [editingPaymentId, setEditingPaymentId] = useState(null);
    const [editPaymentFormData, setEditPaymentFormData] = useState({});

    // --- Состояния для ФИЛЬТРА И ОТЧЕТА ---
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [reportData, setReportData] = useState(null);

    // --- ФУНКЦИИ ---

    const fetchAllData = async () => {
        setLoading(true);
        const [salesResponse, batchesResponse] = await Promise.all([
            supabase.rpc('get_sales_with_stats'),
            supabase.from('broiler_batches').select('id, batch_name').eq('is_active', true).or('is_summary.eq.false,is_summary.is.null')
        ]);

        if (salesResponse.error) { console.error('Ошибка загрузки продаж:', salesResponse.error); }
        else { setAllSales(salesResponse.data); }

        if (batchesResponse.error) { console.error("Ошибка загрузки партий:", batchesResponse.error); }
        else { setActiveBatches(batchesResponse.data); }

        setLoading(false);
    };

    useEffect(() => {
        const today = new Date();
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
        const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);
        setStartDate(firstDay);
        setEndDate(lastDay);
        fetchAllData();
    }, []);

    const filteredSales = useMemo(() => {
        return allSales.filter(sale => {
            if (showArchived) return true;
            return !sale.batch_id || sale.batch_is_active === true;
        });
    }, [allSales, showArchived]);

    const handleGenerateReport = () => {
        if (!startDate || !endDate) { alert("Выберите даты."); return; }
        const reportFiltered = filteredSales.filter(sale => sale.sale_date >= startDate && sale.sale_date <= endDate);
        const totals = reportFiltered.reduce((acc, sale) => {
            acc.totalSales += sale.total_amount;
            acc.totalPayments += sale.total_paid;
            acc.totalBalance += sale.balance;
            return acc;
        }, { totalSales: 0, totalPayments: 0, totalBalance: 0 });
        setReportData(totals);
    };

    const handleResetFilter = () => setReportData(null);

    const handleSubmitSale = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase.from('sales').insert([{ sale_date: date, customer_name: customer, weight_kg: Number(weight), price_per_kg: Number(price), user_id: user.id, batch_id: selectedBatchId || null }]);
        if (error) { alert(error.message); }
        else {
            setDate(new Date().toISOString().slice(0, 10)); setCustomer(''); setWeight(''); setPrice(''); setSelectedBatchId('');
            await fetchAllData();
            handleResetFilter();
        }
        setIsSubmitting(false);
    };

    const handleEditSaleClick = (sale) => { setEditingSaleId(sale.id); setEditSaleFormData({ sale_date: sale.sale_date, customer_name: sale.customer_name || '', weight_kg: sale.weight_kg, price_per_kg: sale.price_per_kg, batch_id: sale.batch_id || '' }); };
    const handleUpdateSale = async (saleId) => {
        const { error } = await supabase.from('sales').update({ ...editSaleFormData, weight_kg: Number(editSaleFormData.weight_kg), price_per_kg: Number(editSaleFormData.price_per_kg), batch_id: editSaleFormData.batch_id || null }).eq('id', saleId);
        if (error) { alert(error.message); }
        else { setEditingSaleId(null); await fetchAllData(); handleResetFilter(); }
    };
    const handleDeleteSale = async (saleId) => {
        if (window.confirm("Удалить продажу и все связанные платежи?")) {
            const { error } = await supabase.from('sales').delete().eq('id', saleId);
            if (error) { alert(error.message); }
            else { await fetchAllData(); handleResetFilter(); }
        }
    };

    const openPaymentsModal = async (sale) => {
        setSelectedSale(sale);
        setIsModalOpen(true);
        const { data, error } = await supabase.from('payments').select('*').eq('sale_id', sale.id).order('payment_date', { ascending: false });
        if (error) { setModalPayments([]); } else { setModalPayments(data); }
    };

    const handleAddPayment = async (e) => {
        e.preventDefault();
        if (!paymentAmount || !selectedSale) return;
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase.from('payments').insert([{ sale_id: selectedSale.id, payment_date: paymentDate, amount: Number(paymentAmount), user_id: user.id }]);
        if (error) { alert(error.message); }
        else {
            setPaymentAmount('');
            await fetchAllData();
            handleResetFilter();
            const { data: updatedPayments } = await supabase.from('payments').select('*').eq('sale_id', selectedSale.id).order('payment_date', { ascending: false });
            setModalPayments(updatedPayments);
            const salesResponse = await supabase.rpc('get_sales_with_stats');
            const updatedSaleData = salesResponse.data.find(s => s.id === selectedSale.id);
            setSelectedSale(updatedSaleData);
        }
    };

    const handleEditPaymentClick = (payment) => { setEditingPaymentId(payment.id); setEditPaymentFormData({ payment_date: payment.payment_date, amount: payment.amount }); };
    const handleUpdatePayment = async (paymentId) => {
        const { error } = await supabase.from('payments').update({ ...editPaymentFormData, amount: Number(editPaymentFormData.amount) }).eq('id', paymentId);
        if (error) { alert(error.message); }
        else {
            setEditingPaymentId(null);
            await fetchAllData();
            handleResetFilter();
            const { data: updatedPayments } = await supabase.from('payments').select('*').eq('sale_id', selectedSale.id).order('payment_date', { ascending: false });
            setModalPayments(updatedPayments);
            const salesResponse = await supabase.rpc('get_sales_with_stats');
            const updatedSaleData = salesResponse.data.find(s => s.id === selectedSale.id);
            setSelectedSale(updatedSaleData);
        }
    };
    const handleDeletePayment = async (paymentId) => {
        if (window.confirm("Удалить этот платеж?")) {
            const { error } = await supabase.from('payments').delete().eq('id', paymentId);
            if (error) { alert(error.message); }
            else {
                await fetchAllData();
                handleResetFilter();
                const { data: updatedPayments } = await supabase.from('payments').select('*').eq('sale_id', selectedSale.id).order('payment_date', { ascending: false });
                setModalPayments(updatedPayments);
                const salesResponse = await supabase.rpc('get_sales_with_stats');
                const updatedSaleData = salesResponse.data.find(s => s.id === selectedSale.id);
                setSelectedSale(updatedSaleData);
            }
        }
    };

    return (
        <div>
            <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">Учет продаж и поступлений</h1>
                <label className="flex items-center text-sm text-gray-600 cursor-pointer">
                    <input type="checkbox" checked={showArchived} onChange={() => setShowArchived(!showArchived)} className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"/>
                    <span className="ml-2">Показать продажи архивных партий</span>
                </label>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-md mb-8">
                <h2 className="text-2xl font-semibold mb-4">Отчет по продажам</h2>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    <div><label className="block text-sm font-medium">С</label><input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="mt-1 w-full p-2 border rounded-md"/></div>
                    <div><label className="block text-sm font-medium">По</label><input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="mt-1 w-full p-2 border rounded-md"/></div>
                    <div className="flex gap-2"><button onClick={handleGenerateReport} className="w-full bg-blue-600 text-white p-2 rounded-md hover:bg-blue-700">Сформировать</button><button onClick={handleResetFilter} title="Сбросить фильтр" className="bg-gray-200 text-gray-700 p-2 rounded-md hover:bg-gray-300">✕</button></div>
                </div>
                {reportData && (
                    <div className="mt-4 p-4 bg-indigo-50 rounded-lg grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                        <div><p className="text-sm text-gray-500">Общая сумма продаж</p><p className="font-bold text-lg">{new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'TJS' }).format(reportData.totalSales)}</p></div>
                        <div><p className="text-sm text-gray-500">Всего получено платежей</p><p className="font-bold text-lg text-green-600">{new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'TJS' }).format(reportData.totalPayments)}</p></div>
                        <div><p className="text-sm text-gray-500">Общий остаток</p><p className="font-bold text-lg text-red-600">{new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'TJS' }).format(reportData.totalBalance)}</p></div>
                    </div>
                )}
            </div>

            <div className="bg-white p-6 rounded-lg shadow-md mb-8">
                <h2 className="text-2xl font-semibold mb-4">Добавить продажу</h2>
                <form onSubmit={handleSubmitSale} className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                    <div><label className="block text-sm font-medium">Дата</label><input type="date" value={date} onChange={e => setDate(e.target.value)} required className="mt-1 w-full p-2 border rounded-md"/></div>
                    <div className="md:col-span-1"><label className="block text-sm font-medium">Покупатель</label><input type="text" value={customer} onChange={e => setCustomer(e.target.value)} className="mt-1 w-full p-2 border rounded-md"/></div>
                    <div><label className="block text-sm font-medium">Вес (кг)</label><input type="number" step="0.01" value={weight} onChange={e => setWeight(e.target.value)} required className="mt-1 w-full p-2 border rounded-md"/></div>
                    <div><label className="block text-sm font-medium">Цена за кг</label><input type="number" step="0.01" value={price} onChange={e => setPrice(e.target.value)} required className="mt-1 w-full p-2 border rounded-md"/></div>
                    <div className="md:col-span-1"><label className="block text-sm font-medium">К Партии</label>
                        <select value={selectedBatchId} onChange={e => setSelectedBatchId(e.target.value)} className="mt-1 w-full p-2 border rounded bg-white">
                            <option value="">-- Не привязывать --</option>
                            {activeBatches.map(b => <option key={b.id} value={b.id}>{b.batch_name}</option>)}
                        </select>
                    </div>
                    <button type="submit" disabled={isSubmitting} className="w-full bg-indigo-600 text-white p-2 rounded-md md:col-span-5">{isSubmitting ? 'Добавление...' : 'Добавить'}</button>
                </form>
            </div>

            <div className="bg-white rounded-lg shadow-md overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 text-xs uppercase">
                        <tr>
                            <th className="px-6 py-3">Дата/Время/Партия</th><th className="px-6 py-3">Покупатель</th>
                            <th className="px-6 py-3">Вес/Цена</th><th className="px-6 py-3">Сумма</th>
                            <th className="px-6 py-3">Оплачено</th><th className="px-6 py-3">Статус</th>
                            <th className="px-6 py-3 text-right">Действия</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? ( <tr><td colSpan="7" className="text-center py-4">Загрузка...</td></tr> ) :
                        filteredSales.map(sale => (
                            <tr key={sale.id} className="border-b">
                                {editingSaleId === sale.id ? (
                                    <>
                                        <td className="p-2"><input type="date" value={editSaleFormData.sale_date} onChange={e => setEditSaleFormData({...editSaleFormData, sale_date: e.target.value})} className="p-1 border rounded w-full"/></td>
                                        <td className="p-2"><input type="text" value={editSaleFormData.customer_name} onChange={e => setEditSaleFormData({...editSaleFormData, customer_name: e.target.value})} className="p-1 border rounded w-full"/></td>
                                        <td className="p-2">
                                            <input type="number" step="0.01" value={editSaleFormData.weight_kg} onChange={e => setEditSaleFormData({...editSaleFormData, weight_kg: e.target.value})} className="p-1 border rounded w-24 mb-1"/>
                                            <input type="number" step="0.01" value={editSaleFormData.price_per_kg} onChange={e => setEditSaleFormData({...editSaleFormData, price_per_kg: e.target.value})} className="p-1 border rounded w-24"/>
                                        </td>
                                        <td className="p-2" colSpan="2">
                                            <select value={editSaleFormData.batch_id} onChange={e => setEditSaleFormData({...editSaleFormData, batch_id: e.target.value})} className="p-1 border rounded w-full bg-white">
                                                <option value="">-- Не привязывать --</option>
                                                {activeBatches.map(b => <option key={b.id} value={b.id}>{b.batch_name}</option>)}
                                            </select>
                                        </td>
                                        <td className="px-6 py-4" colSpan="2">
                                            <div className="flex gap-2 justify-end">
                                                <button onClick={() => handleUpdateSale(sale.id)} className="font-medium text-green-600 hover:underline px-2 py-2">Сохранить</button>
                                                <button onClick={() => setEditingSaleId(null)} className="font-medium text-gray-500 hover:underline px-2 py-2">Отмена</button>
                                            </div>
                                        </td>
                                    </>
                                ) : (
                                    <>
                                        <td className="px-6 py-4"><p>{new Date(sale.sale_date).toLocaleDateString()} <span className="text-gray-400">{new Date(sale.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span></p>{sale.batch_name && <span className={`text-xs rounded-full px-2 py-1 ${sale.batch_is_active ? 'bg-blue-100 text-blue-800' : 'bg-gray-200 text-gray-600'}`}>{sale.batch_name}</span>}</td>
                                        <td className="px-6 py-4">{sale.customer_name || '–'}</td>
                                        <td className="px-6 py-4"><p>{sale.weight_kg} кг</p><p className="text-xs text-gray-500">@ {sale.price_per_kg}</p></td>
                                        <td className="px-6 py-4 font-semibold">{new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'TJS' }).format(sale.total_amount)}</td>
                                        <td className="px-6 py-4 font-semibold text-green-600">{new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'TJS' }).format(sale.total_paid)}</td>
                                        <td className="px-6 py-4">{sale.balance <= 0 ? (<span className="px-3 py-1 text-xs font-semibold text-green-800 bg-green-100 rounded-full">Выплачено</span>) : (<span className="px-3 py-1 text-xs font-semibold text-red-800 bg-red-100 rounded-full">Остаток: {new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'TJS' }).format(sale.balance)}</span>)}</td>
                                        <td className="px-6 py-4 text-right flex flex-col sm:flex-row gap-2 sm:gap-4 justify-end">
                                            <button onClick={() => openPaymentsModal(sale)} className="font-medium text-blue-600 hover:underline">Платежи</button>
                                            <button onClick={() => handleEditSaleClick(sale)} className="font-medium text-yellow-600 hover:underline">Изменить</button>
                                            <button onClick={() => handleDeleteSale(sale.id)} className="font-medium text-red-600 hover:underline">Удалить</button>
                                        </td>
                                    </>
                                )}
                            </tr>
                        ))}
                        { !loading && filteredSales.length === 0 && (<tr><td colSpan="7" className="text-center py-4 text-gray-500">Записей о продажах не найдено.</td></tr>) }
                    </tbody>
                </table>
            </div>

            {isModalOpen && selectedSale && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                   <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
                        <div className="p-6 border-b"><h3 className="text-xl font-semibold">Платежи по продаже</h3><p className="text-sm text-gray-500">от {new Date(selectedSale.sale_date).toLocaleDateString()} (Покупатель: {selectedSale.customer_name || 'Не указан'})</p></div>
                        <div className="p-6 grid grid-cols-1 sm:grid-cols-3 gap-4 text-center border-b">
                            <div><p className="text-sm text-gray-500">Всего к оплате</p><p className="font-bold text-lg">{new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'TJS' }).format(selectedSale.total_amount)}</p></div>
                            <div><p className="text-sm text-gray-500">Оплачено</p><p className="font-bold text-lg text-green-600">{new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'TJS' }).format(selectedSale.total_paid)}</p></div>
                            <div><p className="text-sm text-gray-500">Остаток</p><p className="font-bold text-lg text-red-600">{new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'TJS' }).format(selectedSale.balance)}</p></div>
                        </div>
                        <div className="p-6">
                            <form onSubmit={handleAddPayment} className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end mb-4">
                                <div className="sm:col-span-1"><label className="text-sm">Дата</label><input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} required className="w-full p-2 border rounded"/></div>
                                <div><label className="text-sm">Сумма</label><input type="number" step="0.01" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} required className="w-full p-2 border rounded"/></div>
                                <button type="submit" className="bg-green-600 text-white p-2 rounded hover:bg-green-700">Добавить</button>
                            </form>
                            {selectedSale.balance > 0 && (
                                <div className="text-right -mt-2 mb-4">
                                    <button onClick={() => setPaymentAmount(selectedSale.balance)} className="text-xs text-blue-600 hover:underline">внести остаток ({selectedSale.balance} TJS)</button>
                                </div>
                            )}
                            <h4 className="font-semibold mt-6 mb-2">История платежей:</h4>
                            <div className="space-y-2 max-h-48 overflow-y-auto border rounded p-2">
                                {modalPayments.map(p => (
                                    <div key={p.id} className="p-2 bg-gray-50 rounded">
                                        {editingPaymentId === p.id ? (
                                            <div className="flex items-center gap-2">
                                                <input type="date" value={editPaymentFormData.payment_date} onChange={e => setEditPaymentFormData({...editPaymentFormData, payment_date: e.target.value})} className="p-1 border rounded w-full"/>
                                                <input type="number" step="0.01" value={editPaymentFormData.amount} onChange={e => setEditPaymentFormData({...editPaymentFormData, amount: e.target.value})} className="p-1 border rounded w-full"/>
                                                <button onClick={() => handleUpdatePayment(p.id)} className="text-green-600 px-2 py-2">✓</button>
                                                <button onClick={() => setEditingPaymentId(null)} className="text-gray-500 px-2 py-2">✕</button>
                                            </div>
                                        ) : (
                                            <div className="flex justify-between items-center">
                                                <div><span>{new Date(p.payment_date).toLocaleDateString()}</span><span className="font-semibold ml-4">{new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'TJS' }).format(p.amount)}</span></div>
                                                <div className="flex gap-1"><button onClick={() => handleEditPaymentClick(p)} className="text-xs text-yellow-600 hover:underline px-2 py-2">Изм.</button><button onClick={() => handleDeletePayment(p.id)} className="text-xs text-red-600 hover:underline px-2 py-2">Удал.</button></div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                                {modalPayments.length === 0 && <p className="text-gray-500 text-center py-4">Платежей пока нет.</p>}
                            </div>
                        </div>
                        <div className="p-4 bg-gray-50 text-right rounded-b-lg"><button onClick={() => setIsModalOpen(false)} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300">Закрыть</button></div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default SalesPage;