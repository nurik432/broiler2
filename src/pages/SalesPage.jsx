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
    const [customers, setCustomers] = useState([]);
    const [selectedCustomerId, setSelectedCustomerId] = useState('');
    const [newCustomerName, setNewCustomerName] = useState('');
    const [isAddingCustomer, setIsAddingCustomer] = useState(false);
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

    // --- Состояния для окна "Новое поступление" ---
    const [isNewPaymentModalOpen, setIsNewPaymentModalOpen] = useState(false);
    const [newPaymentCustomerId, setNewPaymentCustomerId] = useState('');
    const [newPaymentAmount, setNewPaymentAmount] = useState('');
    const [newPaymentDate, setNewPaymentDate] = useState(new Date().toISOString().slice(0, 10));
    const [isProcessingPayment, setIsProcessingPayment] = useState(false);

    // --- Состояния для ФИЛЬТРА И ОТЧЕТА ---
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [reportData, setReportData] = useState(null);

    // --- Состояния для массового выделения ---
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [isArchiving, setIsArchiving] = useState(false);

    // --- ФУНКЦИИ ---

    const fetchAllData = async () => {
        setLoading(true);
        const [salesResponse, batchesResponse, customersResponse] = await Promise.all([
            supabase.rpc('get_sales_with_stats'),
            supabase.from('broiler_batches').select('id, batch_name').eq('is_active', true).or('is_summary.eq.false,is_summary.is.null'),
            supabase.from('customers').select('id, full_name').order('full_name')
        ]);

        if (salesResponse.error) { console.error('Ошибка загрузки продаж:', salesResponse.error); }
        else { setAllSales(salesResponse.data); setSelectedIds(new Set()); }

        if (batchesResponse.error) { console.error("Ошибка загрузки партий:", batchesResponse.error); }
        else { setActiveBatches(batchesResponse.data); }

        if (customersResponse.error) { console.error("Ошибка загрузки клиентов:", customersResponse.error); }
        else { setCustomers(customersResponse.data); }

        setLoading(false);
    };

    const handleAddCustomer = async () => {
        const name = newCustomerName.trim();
        if (!name) return;
        setIsAddingCustomer(true);
        const { data: { user } } = await supabase.auth.getUser();
        const { data, error } = await supabase.from('customers').insert([{ full_name: name, user_id: user.id }]).select().single();
        if (error) { alert(error.message); }
        else {
            setCustomers(prev => [...prev, data].sort((a, b) => a.full_name.localeCompare(b.full_name)));
            setSelectedCustomerId(data.id);
            setNewCustomerName('');
        }
        setIsAddingCustomer(false);
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
            if (sale.is_archived) return false;
            return !sale.batch_id || sale.batch_is_active === true;
        });
    }, [allSales, showArchived]);

    const selectedSales = useMemo(() => filteredSales.filter(sale => selectedIds.has(sale.id)), [filteredSales, selectedIds]);
    const isAllSelected = filteredSales.length > 0 && selectedSales.length === filteredSales.length;

    const handleToggleArchived = () => { setShowArchived(!showArchived); setSelectedIds(new Set()); };

    const handleSelect = (saleId) => {
        const newSelectedIds = new Set(selectedIds);
        if (newSelectedIds.has(saleId)) { newSelectedIds.delete(saleId); }
        else { newSelectedIds.add(saleId); }
        setSelectedIds(newSelectedIds);
    };

    const handleSelectAll = () => {
        setSelectedIds(isAllSelected ? new Set() : new Set(filteredSales.map(sale => sale.id)));
    };

    const handleMassArchive = async (archive) => {
        const targets = selectedSales.filter(sale => Boolean(sale.is_archived) !== archive);
        if (targets.length === 0) return;
        if (archive) {
            const unpaid = targets.filter(sale => sale.balance > 0);
            const unpaidTotal = unpaid.reduce((sum, sale) => sum + sale.balance, 0);
            const debtNote = unpaid.length > 0
                ? `\nИз них ${unpaid.length} с непогашенным остатком на сумму ${unpaidTotal.toFixed(2)} TJS — они останутся в расчёте «Нового поступления».`
                : '';
            if (!window.confirm(`Архивировать ${targets.length} продаж?${debtNote}`)) return;
        } else if (!window.confirm(`Вернуть из архива ${targets.length} продаж?`)) {
            return;
        }
        setIsArchiving(true);
        const { error } = await supabase.from('sales').update({ is_archived: archive }).in('id', targets.map(sale => sale.id));
        if (error) { alert("Ошибка: " + error.message); }
        else { await fetchAllData(); handleResetFilter(); }
        setIsArchiving(false);
    };

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
        const { error } = await supabase.from('sales').insert([{ sale_date: date, customer_id: selectedCustomerId || null, weight_kg: Number(weight), price_per_kg: Number(price), user_id: user.id, batch_id: selectedBatchId || null }]);
        if (error) { alert(error.message); }
        else {
            setDate(new Date().toISOString().slice(0, 10)); setSelectedCustomerId(''); setWeight(''); setPrice(''); setSelectedBatchId('');
            await fetchAllData();
            handleResetFilter();
        }
        setIsSubmitting(false);
    };

    const handleEditSaleClick = (sale) => { setEditingSaleId(sale.id); setEditSaleFormData({ sale_date: sale.sale_date, customer_id: sale.customer_id || '', weight_kg: sale.weight_kg, price_per_kg: sale.price_per_kg, batch_id: sale.batch_id || '' }); };
    const handleUpdateSale = async (saleId) => {
        const { error } = await supabase.from('sales').update({ ...editSaleFormData, weight_kg: Number(editSaleFormData.weight_kg), price_per_kg: Number(editSaleFormData.price_per_kg), batch_id: editSaleFormData.batch_id || null, customer_id: editSaleFormData.customer_id || null }).eq('id', saleId);
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

    const handleSubmitNewPayment = async (e) => {
        e.preventDefault();
        if (!newPaymentCustomerId) { alert('Выберите клиента.'); return; }
        const amount = Number(newPaymentAmount);
        if (!(amount > 0)) { alert('Сумма должна быть больше нуля.'); return; }

        setIsProcessingPayment(true);
        const { data: freshSales, error: fetchError } = await supabase.rpc('get_sales_with_stats');
        if (fetchError) { alert(fetchError.message); setIsProcessingPayment(false); return; }

        const unpaidSales = freshSales
            .filter(s => s.customer_id === newPaymentCustomerId && s.balance > 0)
            .sort((a, b) => new Date(a.sale_date) - new Date(b.sale_date));

        const totalOwed = unpaidSales.reduce((sum, s) => sum + s.balance, 0);
        if (amount > totalOwed) {
            alert(`У клиента остаток всего ${totalOwed.toFixed(2)} TJS, введено ${amount.toFixed(2)} TJS.`);
            setIsProcessingPayment(false);
            return;
        }

        const { data: { user } } = await supabase.auth.getUser();
        let remaining = amount;
        const rowsToInsert = [];
        for (const sale of unpaidSales) {
            if (remaining <= 0) break;
            const chunk = Math.min(remaining, sale.balance);
            rowsToInsert.push({ sale_id: sale.id, payment_date: newPaymentDate, amount: chunk, user_id: user.id });
            remaining -= chunk;
        }

        const { error: insertError } = await supabase.from('payments').insert(rowsToInsert);
        if (insertError) { alert(insertError.message); }
        else {
            setNewPaymentCustomerId(''); setNewPaymentAmount('');
            setIsNewPaymentModalOpen(false);
            await fetchAllData();
            handleResetFilter();
        }
        setIsProcessingPayment(false);
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
        <div className={selectedSales.length > 0 ? 'pb-24' : undefined}>
            <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">Учет продаж и поступлений</h1>
                <div className="flex items-center gap-4">
                    <button onClick={() => setIsNewPaymentModalOpen(true)} className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 text-sm font-medium">+ Новое поступление</button>
                    <label className="flex items-center text-sm text-gray-600 cursor-pointer">
                        <input type="checkbox" checked={showArchived} onChange={handleToggleArchived} className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"/>
                        <span className="ml-2">Показать архивные продажи</span>
                    </label>
                </div>
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
                    <div className="md:col-span-1">
                        <label className="block text-sm font-medium">Покупатель</label>
                        <select value={selectedCustomerId} onChange={e => setSelectedCustomerId(e.target.value)} className="mt-1 w-full p-2 border rounded bg-white">
                            <option value="">-- Без клиента --</option>
                            {customers.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                        </select>
                        <div className="mt-1 flex gap-1">
                            <input type="text" placeholder="+ Новый клиент" value={newCustomerName} onChange={e => setNewCustomerName(e.target.value)} className="flex-1 p-1 text-sm border rounded"/>
                            <button type="button" onClick={handleAddCustomer} disabled={isAddingCustomer || !newCustomerName.trim()} className="px-2 text-sm bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50">+</button>
                        </div>
                    </div>
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
                            <th className="p-4"><input type="checkbox" checked={isAllSelected} onChange={handleSelectAll} aria-label="Выбрать все"/></th>
                            <th className="px-6 py-3">Дата/Время/Партия</th><th className="px-6 py-3">Покупатель</th>
                            <th className="px-6 py-3">Вес/Цена</th><th className="px-6 py-3">Сумма</th>
                            <th className="px-6 py-3">Оплачено</th><th className="px-6 py-3">Статус</th>
                            <th className="px-6 py-3 text-right">Действия</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? ( <tr><td colSpan="8" className="text-center py-4">Загрузка...</td></tr> ) :
                        filteredSales.map(sale => (
                            <tr
                                key={sale.id}
                                className={editingSaleId === sale.id ? "border-b" : `border-b cursor-pointer ${selectedIds.has(sale.id) ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}
                                onClick={editingSaleId === sale.id ? undefined : () => openPaymentsModal(sale)}
                            >
                                {editingSaleId === sale.id ? (
                                    <>
                                        <td className="p-4"></td>
                                        <td className="p-2"><input type="date" value={editSaleFormData.sale_date} onChange={e => setEditSaleFormData({...editSaleFormData, sale_date: e.target.value})} className="p-1 border rounded w-full"/></td>
                                        <td className="p-2"><select value={editSaleFormData.customer_id} onChange={e => setEditSaleFormData({...editSaleFormData, customer_id: e.target.value})} className="p-1 border rounded w-full bg-white"><option value="">-- Без клиента --</option>{customers.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}</select></td>
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
                                        <td className="p-4" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectedIds.has(sale.id)} onChange={() => handleSelect(sale.id)} aria-label="Выбрать продажу"/></td>
                                        <td className="px-6 py-4"><p>{new Date(sale.sale_date).toLocaleDateString()} <span className="text-gray-400">{new Date(sale.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span></p>{sale.batch_name && <span className={`text-xs rounded-full px-2 py-1 ${sale.batch_is_active ? 'bg-blue-100 text-blue-800' : 'bg-gray-200 text-gray-600'}`}>{sale.batch_name}</span>}{sale.is_archived && <span className="ml-1 text-xs rounded-full px-2 py-1 bg-gray-200 text-gray-600">Архив</span>}</td>
                                        <td className="px-6 py-4">{sale.customer_name || '–'}</td>
                                        <td className="px-6 py-4"><p>{sale.weight_kg} кг</p><p className="text-xs text-gray-500">@ {sale.price_per_kg}</p></td>
                                        <td className="px-6 py-4 font-semibold">{new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'TJS' }).format(sale.total_amount)}</td>
                                        <td className="px-6 py-4 font-semibold text-green-600">{new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'TJS' }).format(sale.total_paid)}</td>
                                        <td className="px-6 py-4">{sale.balance <= 0 ? (<span className="px-3 py-1 text-xs font-semibold text-green-800 bg-green-100 rounded-full">Выплачено</span>) : (<span className="px-3 py-1 text-xs font-semibold text-red-800 bg-red-100 rounded-full">Остаток: {new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'TJS' }).format(sale.balance)}</span>)}</td>
                                        <td className="px-6 py-4 text-right flex flex-col sm:flex-row gap-2 sm:gap-4 justify-end">
                                            <button onClick={(e) => { e.stopPropagation(); handleEditSaleClick(sale); }} className="font-medium text-yellow-600 hover:underline">Изменить</button>
                                            <button onClick={(e) => { e.stopPropagation(); handleDeleteSale(sale.id); }} className="font-medium text-red-600 hover:underline">Удалить</button>
                                        </td>
                                    </>
                                )}
                            </tr>
                        ))}
                        { !loading && filteredSales.length === 0 && (<tr><td colSpan="8"className="text-center py-4 text-gray-500">Записей о продажах не найдено.</td></tr>) }
                    </tbody>
                </table>
            </div>

            {selectedSales.length > 0 && (
                <div className="fixed bottom-0 left-0 right-0 bg-white shadow-lg p-4 border-t z-40 lg:pl-72 transition-all duration-300">
                    <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
                        <div className="text-sm text-gray-700">
                            <span className="font-semibold">Выбрано: {selectedSales.length}</span>
                            <span className="ml-4">Сумма: <strong>{new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'TJS' }).format(selectedSales.reduce((sum, sale) => sum + sale.total_amount, 0))}</strong></span>
                            <span className="ml-4">Остаток: <strong className="text-red-600">{new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'TJS' }).format(selectedSales.reduce((sum, sale) => sum + Math.max(sale.balance, 0), 0))}</strong></span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {selectedSales.some(sale => !sale.is_archived) && (
                                <button onClick={() => handleMassArchive(true)} disabled={isArchiving} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50">В архив</button>
                            )}
                            {selectedSales.some(sale => sale.is_archived) && (
                                <button onClick={() => handleMassArchive(false)} disabled={isArchiving} className="px-4 py-2 bg-white border border-indigo-600 text-indigo-600 rounded-md hover:bg-indigo-50 disabled:opacity-50">Из архива</button>
                            )}
                            <button onClick={() => setSelectedIds(new Set())} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300">Снять выбор</button>
                        </div>
                    </div>
                </div>
            )}

            {isModalOpen && selectedSale && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                   <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
                        <div className="p-6 border-b"><h3 className="text-xl font-semibold">История платежей по продаже</h3><p className="text-sm text-gray-500">от {new Date(selectedSale.sale_date).toLocaleDateString()} (Покупатель: {selectedSale.customer_name || 'Не указан'})</p></div>
                        <div className="p-6 grid grid-cols-1 sm:grid-cols-3 gap-4 text-center border-b">
                            <div><p className="text-sm text-gray-500">Всего к оплате</p><p className="font-bold text-lg">{new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'TJS' }).format(selectedSale.total_amount)}</p></div>
                            <div><p className="text-sm text-gray-500">Оплачено</p><p className="font-bold text-lg text-green-600">{new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'TJS' }).format(selectedSale.total_paid)}</p></div>
                            <div><p className="text-sm text-gray-500">Остаток</p><p className="font-bold text-lg text-red-600">{new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'TJS' }).format(selectedSale.balance)}</p></div>
                        </div>
                        <div className="p-6">
                            <h4 className="font-semibold mb-2">История платежей:</h4>
                            <div className="space-y-2 max-h-64 overflow-y-auto border rounded p-2">
                                {modalPayments.map(p => (
                                    <div key={p.id} className="p-2 bg-gray-50 rounded flex justify-between items-center">
                                        <div><span>{new Date(p.payment_date).toLocaleDateString()}</span><span className="font-semibold ml-4">{new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'TJS' }).format(p.amount)}</span></div>
                                        <button onClick={() => handleDeletePayment(p.id)} className="text-xs text-red-600 hover:underline px-2 py-2">Удал.</button>
                                    </div>
                                ))}
                                {modalPayments.length === 0 && <p className="text-gray-500 text-center py-4">Платежей пока нет.</p>}
                            </div>
                        </div>
                        <div className="p-4 bg-gray-50 text-right rounded-b-lg"><button onClick={() => setIsModalOpen(false)} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300">Закрыть</button></div>
                    </div>
                </div>
            )}

            {isNewPaymentModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                        <div className="p-6 border-b"><h3 className="text-xl font-semibold">Новое поступление</h3></div>
                        <form onSubmit={handleSubmitNewPayment} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium">Клиент</label>
                                <select value={newPaymentCustomerId} onChange={e => setNewPaymentCustomerId(e.target.value)} required className="mt-1 w-full p-2 border rounded bg-white">
                                    <option value="">-- Выберите клиента --</option>
                                    {customers.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium">Дата</label>
                                <input type="date" value={newPaymentDate} onChange={e => setNewPaymentDate(e.target.value)} required className="mt-1 w-full p-2 border rounded"/>
                            </div>
                            <div>
                                <label className="block text-sm font-medium">Сумма</label>
                                <input type="number" step="0.01" value={newPaymentAmount} onChange={e => setNewPaymentAmount(e.target.value)} required className="mt-1 w-full p-2 border rounded"/>
                            </div>
                            <div className="flex justify-end gap-2 pt-2">
                                <button type="button" onClick={() => setIsNewPaymentModalOpen(false)} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300">Отмена</button>
                                <button type="submit" disabled={isProcessingPayment} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">{isProcessingPayment ? 'Обработка...' : 'Провести'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

export default SalesPage;