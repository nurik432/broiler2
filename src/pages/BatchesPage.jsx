// src/pages/BatchesPage.jsx

import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { syncSummaryBatchLog } from '../utils/summaryBatchSync';

function BatchesPage() {
    const [view, setView] = useState('active');
    const [batches, setBatches] = useState([]);
    const [isFetching, setIsFetching] = useState(true);

    const [batchName, setBatchName] = useState('');
    const [initialQuantity, setInitialQuantity] = useState('');
    const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
    const [selectedWorkshopId, setSelectedWorkshopId] = useState('');
    const [workshops, setWorkshops] = useState([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Загрузка списка цехов
    const fetchWorkshops = async () => {
        const { data } = await supabase
            .from('workshops')
            .select('id, name')
            .eq('is_active', true)
            .order('name');
        setWorkshops(data || []);
    };

    const fetchBatches = async () => {
        setIsFetching(true);
        const rpc_function = view === 'active'
            ? 'get_batches_with_stats'
            : 'get_archived_batches_with_stats';

        const { data, error } = await supabase.rpc(rpc_function);

        if (error) {
            console.error(`Ошибка при загрузке партий (${view}):`, error);
            alert('Не удалось загрузить список партий.');
            setBatches([]);
        } else {
            // RPC может не возвращать workshop_id — подтянем его отдельно
            if (data && data.length > 0) {
                const ids = data.map(b => b.id);
                const { data: workshopData } = await supabase
                    .from('broiler_batches')
                    .select('id, workshop_id')
                    .in('id', ids);
                const wsMap = {};
                (workshopData || []).forEach(w => { wsMap[w.id] = w.workshop_id; });
                const enriched = data.map(b => ({ ...b, workshop_id: wsMap[b.id] || b.workshop_id || null }));
                setBatches(enriched);
            } else {
                setBatches(data || []);
            }
        }
        setIsFetching(false);
    };

    useEffect(() => {
        fetchBatches();
    }, [view]);

    useEffect(() => {
        fetchWorkshops();
    }, []);

    const exportBatchToXLSX = async (batchId) => {
        try {
            const [
                batchRes, logsRes, medicinesRes,
                expensesRes, salesRes, feedRes, salariesRes,
            ] = await Promise.all([
                supabase.from('broiler_batches').select('*').eq('id', batchId).single(),
                supabase.from('daily_logs').select('*, medicine:medicines(name)').eq('batch_id', batchId).order('log_date', { ascending: false }),
                supabase.from('medicines').select('id, name'),
                supabase.rpc('get_expenses_by_batch', { batch_uuid: batchId }),
                supabase.rpc('get_sales_by_batch', { batch_uuid: batchId }),
                supabase.rpc('get_feed_by_batch', { batch_uuid: batchId }),
                supabase.rpc('get_salaries_by_batch', { batch_uuid: batchId }),
            ]);

            if (batchRes.error) throw batchRes.error;
            if (logsRes.error) throw logsRes.error;
            if (expensesRes.error) throw expensesRes.error;
            if (salesRes.error) throw salesRes.error;
            if (feedRes.error) throw feedRes.error;
            if (salariesRes.error) throw salariesRes.error;

            const wb = XLSX.utils.book_new();

            const batchData = [
                ['batch_name', 'start_date', 'initial_quantity', 'is_active'],
                [batchRes.data.batch_name, batchRes.data.start_date, batchRes.data.initial_quantity, batchRes.data.is_active],
            ];
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(batchData), 'Партия');

            const logsHeader = ['log_date', 'age', 'mortality', 'weight', 'daily_feed', 'medicine', 'dosage', 'water_consumption'];
            const logsBody = logsRes.data.map(l => [l.log_date, l.age, l.mortality, l.weight ?? '', l.daily_feed ?? '', l.medicine?.name ?? '', l.dosage ?? '', l.water_consumption ?? '']);
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([logsHeader, ...logsBody]), 'Журнал');

            const expBody = expensesRes.data.map(e => [e.expense_date, e.description, e.amount]);
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['expense_date', 'description', 'amount'], ...expBody]), 'Расходы');

            const salesBody = salesRes.data.map(s => [s.sale_date, s.customer_name, s.weight_kg, s.price_per_kg]);
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['sale_date', 'customer_name', 'weight_kg', 'price_per_kg'], ...salesBody]), 'Продажи');

            const feedBody = feedRes.data.map(f => [f.delivery_date, f.feed_type, f.quantity_kg]);
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['delivery_date', 'feed_type', 'quantity_kg'], ...feedBody]), 'Корм');

            const salBody = salariesRes.data.map(s => [s.payment_date, s.employee_name, s.payment_type, s.amount]);
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['payment_date', 'employee_name', 'payment_type', 'amount'], ...salBody]), 'Зарплаты');

            const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
            const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.setAttribute('download', `batch_${batchId}_data.xlsx`);
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('❌ Ошибка экспорта в XLSX', err);
            alert('Не удалось экспортировать данные. Смотрите консоль браузера.');
        }
    };

    /**
     * Архивация партии + автоматическое увольнение всех её сотрудников.
     * Восстановление партии НЕ восстанавливает сотрудников автоматически
     * (их нужно перевести в новую партию вручную).
     */
    const handleToggleBatchStatus = async (batchId, newStatus) => {
        const confirmMessage = newStatus
            ? "Вы уверены, что хотите восстановить эту партию?\n\nСотрудники, привязанные к этой партии, не будут восстановлены автоматически. Переназначьте их вручную в разделе «Сотрудники»."
            : "Вы уверены, что хотите завершить эту партию?\n\nВсе сотрудники, привязанные к этой партии, будут автоматически уволены, а их платежи — архивированы.";

        if (!window.confirm(confirmMessage)) return;

        // 1. Меняем статус партии
        const { error: batchError } = await supabase
            .from('broiler_batches')
            .update({ is_active: newStatus })
            .eq('id', batchId);

        if (batchError) {
            alert('Ошибка при изменении статуса партии: ' + batchError.message);
            return;
        }

        // 2. Если архивируем — увольняем всех сотрудников этой партии
        if (!newStatus) {
            const today = new Date().toISOString().slice(0, 10);
const { error: employeesError } = await supabase
    .from('employees')
    .update({
        is_active: false,
        end_date: today  // <-- дата увольнения
    })
    .eq('batch_id', batchId)
    .eq('is_active', true); // не трогаем уже закрытые ранее карточки этой же партии

            if (employeesError) {
                console.error('Ошибка при обновлении сотрудников:', employeesError);
                alert('Партия архивирована, но не удалось обновить статус сотрудников: ' + employeesError.message);
            } else {
                // Считаем сколько сотрудников уволили в рамках этой архивации
                const { count } = await supabase
                    .from('employees')
                    .select('id', { count: 'exact', head: true })
                    .eq('batch_id', batchId)
                    .eq('end_date', today);

                if (count > 0) {
                    alert(`✅ Партия завершена. Уволено сотрудников: ${count}.\nВыплаты по ним переведены в архив автоматически.`);
                }
            }
        }

        await fetchBatches();
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        const { data: { user } } = await supabase.auth.getUser();

        const { error } = await supabase.from('broiler_batches').insert([{
            batch_name: batchName,
            initial_quantity: Number(initialQuantity),
            start_date: startDate,
            workshop_id: selectedWorkshopId || null,
            user_id: user.id
        }]);

        if (error) {
            alert(error.message);
        } else {
            setBatchName('');
            setInitialQuantity('');
            setSelectedWorkshopId('');
            await fetchBatches();
        }
        setIsSubmitting(false);
    };

    const handleWorkshopChange = async (batchId, workshopId) => {
        const { error } = await supabase
            .from('broiler_batches')
            .update({ workshop_id: workshopId || null })
            .eq('id', batchId);
        if (error) {
            alert('Ошибка при смене цеха: ' + error.message);
        } else {
            await fetchBatches();
        }
    };

    const [isSyncingHistory, setIsSyncingHistory] = useState(false);

    const handleSyncHistory = async () => {
        setIsSyncingHistory(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const { data: activeBatches } = await supabase
                .from('broiler_batches')
                .select('id')
                .eq('is_active', true)
                .or('is_summary.eq.false,is_summary.is.null');
                
            if (!activeBatches || activeBatches.length === 0) {
                alert('Нет активных нормальных партий для синхронизации.');
                setIsSyncingHistory(false);
                return;
            }
            
            const batchIds = activeBatches.map(b => b.id);
            const { data: logs } = await supabase
                .from('daily_logs')
                .select('log_date')
                .in('batch_id', batchIds);

            if (logs && logs.length > 0) {
                const uniqueDates = [...new Set(logs.map(l => l.log_date))];
                for (const date of uniqueDates) {
                    await syncSummaryBatchLog(date, user.id);
                }
                alert('✅ Исторические данные успешно синхронизированы!');
                await fetchBatches();
            } else {
                alert('В активных партиях нет ни одной записи журнала.');
            }
        } catch (error) {
            console.error('Ошибка синхронизации', error);
            alert('Ошибка синхронизации: ' + error.message);
        } finally {
            setIsSyncingHistory(false);
        }
    };

    return (
        <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-6">Партии бройлеров</h1>

            <div className="bg-white p-6 rounded-lg shadow-md mb-8">
                <h2 className="text-2xl font-semibold mb-4">Добавить новую партию</h2>
                <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Название партии</label>
                        <input type="text" placeholder="Партия #1" value={batchName} onChange={e => setBatchName(e.target.value)} required className="mt-1 block w-full p-2 border rounded-md" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Начальное поголовье</label>
                        <input type="number" placeholder="500" value={initialQuantity} onChange={e => setInitialQuantity(e.target.value)} required className="mt-1 block w-full p-2 border rounded-md" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Дата начала</label>
                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required className="mt-1 block w-full p-2 border rounded-md" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-indigo-700 font-semibold">Цех</label>
                        <select value={selectedWorkshopId} onChange={e => setSelectedWorkshopId(e.target.value)} className="mt-1 block w-full p-2 border-2 border-indigo-300 rounded-md bg-white focus:border-indigo-500">
                            <option value="">— Без цеха —</option>
                            {workshops.map(w => (
                                <option key={w.id} value={w.id}>{w.name}</option>
                            ))}
                        </select>
                        {workshops.length === 0 && (
                            <p className="text-xs text-gray-400 mt-1">Нет цехов. Создайте в разделе «Учёт по цехам».</p>
                        )}
                    </div>
                    <div className="md:col-span-4">
                        <button type="submit" disabled={isSubmitting} className="w-full justify-center py-2 px-4 text-white bg-indigo-600 hover:bg-indigo-700 rounded-md disabled:bg-gray-400">
                            {isSubmitting ? 'Добавление...' : 'Добавить партию'}
                        </button>
                    </div>
                </form>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-md">
                <div className="flex border-b mb-4 justify-between items-center flex-wrap gap-4">
                    <div>
                        <button onClick={() => setView('active')} className={`py-2 px-4 font-semibold ${view === 'active' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-gray-500'}`}>
                            Активные
                        </button>
                        <button onClick={() => setView('archived')} className={`py-2 px-4 font-semibold ${view === 'archived' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-gray-500'}`}>
                            Архивные
                        </button>
                    </div>
                    {view === 'active' && (
                        <button 
                            onClick={handleSyncHistory} 
                            disabled={isSyncingHistory}
                            className="text-xs px-3 py-1 bg-yellow-100 text-yellow-700 hover:bg-yellow-200 rounded border border-yellow-300 font-medium disabled:opacity-50"
                        >
                            {isSyncingHistory ? 'Синхронизация...' : '🔄 Синхронизировать прошлые дни'}
                        </button>
                    )}
                </div>

                {isFetching ? (
                    <p className="text-center text-gray-500 py-4">Загрузка партий...</p>
                ) : batches.length === 0 ? (
                    <p className="text-center text-gray-500 py-4">Здесь пока нет партий.</p>
                ) : (
                    <div className="space-y-4">
                        {batches.map(batch => (
                            <div key={batch.id} className={`p-4 border rounded-lg flex flex-col sm:flex-row justify-between sm:items-center gap-4 ${batch.is_summary ? 'bg-yellow-50 border-yellow-300' : ''}`}>
                                <div>
                                    <p className="font-bold text-lg text-gray-800">
                                        {batch.batch_name} {batch.is_summary && <span className="text-xs bg-yellow-200 text-yellow-800 px-2 py-1 rounded ml-2">Автоматическая</span>}
                                    </p>
                                    <p className="text-sm text-gray-500">Начало: {new Date(batch.start_date).toLocaleDateString()}</p>
                                    {!batch.is_summary && (
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-xs text-gray-400">Цех:</span>
                                            <select
                                                value={batch.workshop_id || ''}
                                                onChange={(e) => handleWorkshopChange(batch.id, e.target.value)}
                                                onClick={(e) => e.stopPropagation()}
                                                className="text-xs p-1 border rounded bg-white text-indigo-700 font-medium"
                                            >
                                                <option value="">— Не привязан —</option>
                                                {workshops.map(w => (
                                                    <option key={w.id} value={w.id}>{w.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-center gap-4 sm:gap-6">
                                    <div className="text-center">
                                        <span className="text-xs sm:text-sm text-gray-500">Итоговое поголовье</span>
                                        <p className="font-bold text-xl sm:text-2xl text-green-600">{batch.current_quantity}</p>
                                    </div>
                                    <div className="text-center">
                                        <span className="text-xs sm:text-sm text-gray-500">Общий падеж</span>
                                        <p className="font-bold text-xl sm:text-2xl text-red-600">{batch.total_mortality}</p>
                                    </div>
                                    <div className="flex flex-col sm:flex-row gap-2">
                                        <Link to={`/batch/${batch.id}`} className="px-4 py-2 text-sm text-center font-medium text-white bg-gray-500 rounded-md hover:bg-gray-600">
                                            Журнал
                                        </Link>
                                        {view === 'active' ? (
                                            batch.is_summary ? (
                                                <Link to={`/batch/${batch.id}/report`} className="px-4 py-2 text-sm text-center font-medium text-white bg-blue-500 rounded-md hover:bg-blue-600">
                                                    Отчет
                                                </Link>
                                            ) : (
                                                <button
                                                    onClick={() => handleToggleBatchStatus(batch.id, false)}
                                                    className="px-4 py-2 text-sm font-medium text-white bg-red-500 rounded-md hover:bg-red-600"
                                                >
                                                    Завершить
                                                </button>
                                            )
                                        ) : (
                                            <>
                                                <Link to={`/batch/${batch.id}/report`} className="px-4 py-2 text-sm text-center font-medium text-white bg-blue-500 rounded-md hover:bg-blue-600">
                                                    Отчет
                                                </Link>
                                                <button
                                                    onClick={() => handleToggleBatchStatus(batch.id, true)}
                                                    className="px-4 py-2 text-sm font-medium text-white bg-green-500 rounded-md hover:bg-green-600"
                                                >
                                                    Восстановить
                                                </button>
                                                <button
                                                    onClick={() => exportBatchToXLSX(batch.id)}
                                                    className="px-4 py-2 text-sm font-medium text-white bg-gray-700 rounded-md hover:bg-gray-800"
                                                >
                                                    Экспортировать (XLSX)
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

export default BatchesPage;