// src/pages/BatchLogPage.jsx

import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import NormIndicator from '../components/NormIndicator';
import DashboardNormFact from '../components/DashboardNormFact';
import { compareWithNorm } from '../utils/normComparison';
import { getWeekMortalityNorm, FEED_BAG_WEIGHT_G } from '../constants/broilerStandards';
import { syncSummaryBatchLog } from '../utils/summaryBatchSync';

// --- Утилита: поголовье на момент каждой записи ---
function buildFlockSizeMap(logs, initialQuantity) {
    const sortedAsc = [...logs].sort((a, b) => new Date(a.log_date) - new Date(b.log_date));
    let cumMort = 0;
    const map = {};
    for (const log of sortedAsc) {
        map[log.id] = initialQuantity - cumMort; // поголовье до падежа этого дня
        cumMort += log.mortality;
    }
    return map;
}

// --- КОМПОНЕНТЫ-ТАБЛИЦЫ ---
const JournalTable = ({ logs, batch, medicines, fetchData }) => {
    const [editingId, setEditingId] = useState(null);
    const [editFormData, setEditFormData] = useState({});

    const flockSizeMap = useMemo(
        () => buildFlockSizeMap(logs, batch.initial_quantity),
        [logs, batch.initial_quantity]
    );

    const calculateAge = (startDate, currentDate) => {
        const start = new Date(startDate);
        const current = new Date(currentDate);
        return Math.ceil(Math.abs(current - start) / (1000 * 60 * 60 * 24));
    };
    const handleEditClick = (log) => {
        setEditingId(log.id);
        setEditFormData({
            log_date: log.log_date,
            mortality_natural: log.mortality_natural || '',
            mortality_halal: log.mortality_halal || '',
            water_consumption: log.water_consumption || '',
            medicine_id: log.medicine_id || '',
            dosage: log.dosage || '',
            weight: log.weight ?? '',
            daily_feed: log.daily_feed ?? '',
        });
    };
    const handleUpdate = async (logId) => {
        const age = calculateAge(batch.start_date, editFormData.log_date);
        const { error } = await supabase.from('daily_logs').update({
            ...editFormData,
            age,
            mortality: (Number(editFormData.mortality_natural) || 0) + (Number(editFormData.mortality_halal) || 0),
            mortality_natural: Number(editFormData.mortality_natural) || 0,
            mortality_halal: Number(editFormData.mortality_halal) || 0,
            water_consumption: Number(editFormData.water_consumption) || null,
            weight: editFormData.weight ? parseFloat(editFormData.weight) : null,
            daily_feed: editFormData.daily_feed ? parseFloat(editFormData.daily_feed) : null,
        }).eq('id', logId);
        if (error) { alert(error.message); }
        else { setEditingId(null); await fetchData(); }
    };
    const handleDelete = async (logId) => {
        if (window.confirm("Удалить запись?")) {
            const { error } = await supabase.from('daily_logs').delete().eq('id', logId);
            if (error) { alert(error.message); } else { await fetchData(); }
        }
    };

    // Расчёт на голову
    const perHeadWater = (log) => {
        const flock = flockSizeMap[log.id];
        if (!flock || !log.water_consumption) return null;
        return Math.round((log.water_consumption * 1000) / flock);
    };
    const perHeadFeed = (log) => {
        const flock = flockSizeMap[log.id];
        if (!flock || !log.daily_feed) return null;
        return Math.round((log.daily_feed * FEED_BAG_WEIGHT_G) / flock);
    };

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-gray-500 min-w-[1000px]">
                <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                    <tr>
                        <th className="px-3 py-3">Дата / Время</th>
                        <th className="px-3 py-3">Возр.</th>
                        <th className="px-3 py-3">Падеж (Ест/Хал)</th>
                        <th className="px-3 py-3">Масса, г</th>
                        <th className="px-3 py-3">Вода, л (мл/гол)</th>
                        <th className="px-3 py-3">Корм, мешк. (г/гол)</th>
                        <th className="px-3 py-3">Лекарство</th>
                        <th className="px-3 py-3">Доза</th>
                        <th className="px-3 py-3 text-right">Действия</th>
                    </tr>
                </thead>
                <tbody>
                    {logs.map(log => (
                        <tr key={log.id} className="bg-white border-b hover:bg-gray-50">
                            {editingId === log.id && batch.is_active ? (
                                <>
                                    <td className="p-2"><input type="date" value={editFormData.log_date} onChange={e => setEditFormData({...editFormData, log_date: e.target.value})} className="p-1 border rounded w-full"/></td>
                                    <td className="px-3 py-4">{calculateAge(batch.start_date, editFormData.log_date)}</td>
                                    <td className="p-2">
                                        <div className="flex gap-1">
                                            <input type="number" inputMode="numeric" value={editFormData.mortality_natural} onChange={e => setEditFormData({...editFormData, mortality_natural: e.target.value})} placeholder="Ест" className="p-1 border rounded w-12 text-sm" />
                                            <input type="number" inputMode="numeric" value={editFormData.mortality_halal} onChange={e => setEditFormData({...editFormData, mortality_halal: e.target.value})} placeholder="Хал" className="p-1 border rounded w-12 text-sm" />
                                        </div>
                                    </td>
                                    <td className="p-2"><input type="number" inputMode="decimal" value={editFormData.weight} onChange={e => setEditFormData({...editFormData, weight: e.target.value})} placeholder="г/гол" className="p-1 border rounded w-20 text-base"/></td>
                                    <td className="p-2"><input type="number" inputMode="decimal" step="0.1" value={editFormData.water_consumption} onChange={e => setEditFormData({...editFormData, water_consumption: e.target.value})} placeholder="литров" className="p-1 border rounded w-20 text-base"/></td>
                                    <td className="p-2"><input type="number" inputMode="decimal" step="0.1" value={editFormData.daily_feed} onChange={e => setEditFormData({...editFormData, daily_feed: e.target.value})} placeholder="мешков" className="p-1 border rounded w-20 text-base"/></td>
                                    <td className="p-2"><select value={editFormData.medicine_id} onChange={e => setEditFormData({...editFormData, medicine_id: e.target.value})} className="p-1 border rounded w-full bg-white"><option value="">--</option>{medicines.map(med => <option key={med.id} value={med.id}>{med.name}</option>)}</select></td>
                                    <td className="p-2"><input type="text" value={editFormData.dosage} onChange={e => setEditFormData({...editFormData, dosage: e.target.value})} className="p-1 border rounded w-20 text-base"/></td>
                                    <td className="px-3 py-4 text-right flex gap-2 justify-end"><button onClick={() => handleUpdate(log.id)} className="font-medium text-green-600 px-2 py-2">✓</button><button onClick={() => setEditingId(null)} className="font-medium text-gray-500 px-2 py-2">✕</button></td>
                                </>
                            ) : (
                                <>
                                    <td className="px-3 py-4"><p className="font-medium">{new Date(log.log_date).toLocaleDateString()}</p><p className="text-xs text-gray-400">{new Date(log.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</p></td>
                                    <td className="px-3 py-4">{log.age}</td>
                                    <td className="px-3 py-4">
                                        <div className="text-red-600 font-semibold">{log.mortality}</div>
                                        {(log.mortality_natural > 0 || log.mortality_halal > 0) && (
                                            <div className="text-xs text-gray-500">Ест: {log.mortality_natural || 0} | Хал: {log.mortality_halal || 0}</div>
                                        )}
                                    </td>
                                    <td className="px-3 py-4">{log.weight ?? '–'}</td>
                                    <td className="px-3 py-4">
                                        {log.water_consumption ? (
                                            <>{log.water_consumption} л<span className="text-xs text-gray-400 ml-1">({perHeadWater(log)} мл/гол)</span></>
                                        ) : '–'}
                                    </td>
                                    <td className="px-3 py-4">
                                        {log.daily_feed ? (
                                            <>{log.daily_feed} мешк.<span className="text-xs text-gray-400 ml-1">({perHeadFeed(log)} г/гол)</span></>
                                        ) : '–'}
                                    </td>
                                    <td className="px-3 py-4">{log.medicine ? log.medicine.name : '–'}</td>
                                    <td className="px-3 py-4">{log.dosage || '–'}</td>
                                    <td className="px-3 py-4 text-right">{batch.is_active && (<div className="flex gap-1 justify-end"><button onClick={() => handleEditClick(log)} className="font-medium text-blue-600 px-2 py-2">Ред.</button><button onClick={() => handleDelete(log.id)} className="font-medium text-red-600 px-2 py-2">Уд.</button></div>)}</td>
                                </>
                            )}
                        </tr>
                    ))}
                    {logs.length === 0 && (<tr><td colSpan="9" className="text-center py-4">Записей нет.</td></tr>)}
                </tbody>
            </table>
        </div>
    );
};
const ExpensesTable = ({ items }) => (<div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left"><th className="py-2">Дата</th><th className="py-2">Описание</th><th className="py-2">Сумма</th></tr></thead><tbody>{items.map(item => (<tr key={item.id} className="border-b"><td className="py-2">{new Date(item.expense_date).toLocaleDateString()}</td><td className="py-2">{item.description}</td><td className="py-2 font-semibold">{new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'TJS' }).format(item.amount)}</td></tr>))}</tbody></table></div>);
const SalesTable = ({ items }) => (<div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left"><th className="py-2">Дата</th><th className="py-2">Покупатель</th><th className="py-2">Вес</th><th className="py-2">Цена/кг</th><th className="py-2">Сумма</th></tr></thead><tbody>{items.map(item => (<tr key={item.id} className="border-b"><td className="py-2">{new Date(item.sale_date).toLocaleDateString()}</td><td className="py-2">{item.customer_name}</td><td className="py-2">{item.weight_kg} кг</td><td className="py-2">{item.price_per_kg}</td><td className="py-2 font-semibold">{new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'TJS' }).format(item.weight_kg * item.price_per_kg)}</td></tr>))}</tbody></table></div>);
const FeedTable = ({ items }) => (<div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left"><th className="py-2">Дата</th><th className="py-2">Тип</th><th className="py-2">Количество</th></tr></thead><tbody>{items.map(item => (<tr key={item.id} className="border-b"><td className="py-2">{new Date(item.delivery_date).toLocaleDateString()}</td><td className="py-2 capitalize">{item.feed_type}</td><td className="py-2 font-semibold">{item.quantity_kg} кг</td></tr>))}</tbody></table></div>);
const SalariesTable = ({ items }) => (<div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left"><th className="py-2">Дата</th><th className="py-2">Сотрудник</th><th className="py-2">Тип</th><th className="py-2">Сумма</th></tr></thead><tbody>{items.map(item => (<tr key={item.id} className="border-b"><td className="py-2">{new Date(item.payment_date).toLocaleDateString()}</td><td className="py-2">{item.employee_name}</td><td className="py-2 capitalize">{item.payment_type}</td><td className="py-2 font-semibold">{new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'TJS' }).format(item.amount)}</td></tr>))}</tbody></table></div>);

// --- Компонент фильтра падежа по периоду ---
const MortalityPeriodFilter = ({ logs }) => {
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    const filtered = useMemo(() => {
        if (!dateFrom && !dateTo) return null;
        return logs.filter(log => {
            if (dateFrom && log.log_date < dateFrom) return false;
            if (dateTo && log.log_date > dateTo) return false;
            return true;
        });
    }, [logs, dateFrom, dateTo]);

    const totalMort = filtered ? filtered.reduce((s, l) => s + l.mortality, 0) : null;
    const daysCount = filtered ? filtered.length : 0;

    return (
        <div className="bg-white p-4 rounded-lg shadow-md border mb-4">
            <h4 className="text-lg font-semibold mb-3">📅 Фильтр падежа по периоду</h4>
            <div className="flex flex-wrap items-end gap-4">
                <div>
                    <label className="block text-sm text-gray-600">С</label>
                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                        className="mt-1 p-2 border rounded" />
                </div>
                <div>
                    <label className="block text-sm text-gray-600">По</label>
                    <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                        className="mt-1 p-2 border rounded" />
                </div>
                {totalMort !== null && (
                    <div className="bg-gray-50 px-4 py-2 rounded-lg border">
                        <p className="text-sm text-gray-600">Записей: <strong>{daysCount}</strong></p>
                        <p className="text-lg font-bold text-red-600">Падёж за период: {totalMort} голов</p>
                    </div>
                )}
                {(dateFrom || dateTo) && (
                    <button onClick={() => { setDateFrom(''); setDateTo(''); }}
                        className="text-sm text-gray-500 hover:text-gray-700 underline">
                        Сбросить
                    </button>
                )}
            </div>
        </div>
    );
};

function BatchLogPage() {
    const { batchId } = useParams();
    const [batch, setBatch] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('journal');
    const [logs, setLogs] = useState([]);
    const [expenses, setExpenses] = useState([]);
    const [sales, setSales] = useState([]);
    const [feed, setFeed] = useState([]);
    const [salaries, setSalaries] = useState([]);
    const [medicines, setMedicines] = useState([]);
    const [historicalBatches, setHistoricalBatches] = useState([]);
    const [historicalLogs, setHistoricalLogs] = useState([]);
    const [logDate, setLogDate] = useState(new Date().toISOString().slice(0, 10));
    const [mortalityNatural, setMortalityNatural] = useState('');
    const [mortalityHalal, setMortalityHalal] = useState('');
    const [medicineId, setMedicineId] = useState('');
    const [dosage, setDosage] = useState('');
    const [water, setWater] = useState('');
    const [weight, setWeight] = useState('');
    const [dailyFeed, setDailyFeed] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const fetchAllBatchData = async () => {
        try {
            const [batchRes, logsRes, medicinesRes, expensesRes, salesRes, feedRes, salariesRes] = await Promise.all([
                supabase.from('broiler_batches').select('*').eq('id', batchId).single(),
                supabase.from('daily_logs').select('*, medicine:medicines(name)').eq('batch_id', batchId).order('log_date', { ascending: false }),
                supabase.from('medicines').select('id, name'),
                supabase.rpc('get_expenses_by_batch', { batch_uuid: batchId }),
                supabase.rpc('get_sales_by_batch', { batch_uuid: batchId }),
                supabase.rpc('get_feed_by_batch', { batch_uuid: batchId }),
                supabase.rpc('get_salaries_by_batch', { batch_uuid: batchId })
            ]);

            if (batchRes.error) throw batchRes.error; setBatch(batchRes.data);
            if (logsRes.error) throw logsRes.error; setLogs(logsRes.data);
            if (medicinesRes.error) throw medicinesRes.error; setMedicines(medicinesRes.data);
            if (expensesRes.error) throw expensesRes.error; setExpenses(expensesRes.data || []);
            if (salesRes.error) throw salesRes.error; setSales(salesRes.data || []);
            if (feedRes.error) throw feedRes.error; setFeed(feedRes.data || []);
            if (salariesRes.error) throw salariesRes.error; setSalaries(salariesRes.data || []);

            // Историческое сравнение падежа: загружаем другие партии
            const otherBatchesRes = await supabase
                .from('broiler_batches')
                .select('id, batch_name, initial_quantity')
                .neq('id', batchId);
            const otherBatches = otherBatchesRes.data || [];
            setHistoricalBatches(otherBatches);

            if (otherBatches.length > 0) {
                const histLogsRes = await supabase
                    .from('daily_logs')
                    .select('batch_id, age, mortality')
                    .in('batch_id', otherBatches.map(b => b.id));
                setHistoricalLogs(histLogsRes.data || []);
            }

        } catch (error) {
            console.error("Ошибка при загрузке данных партии:", error);
            alert("Не удалось загрузить все данные по партии.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (batchId) {
            setLoading(true);
            fetchAllBatchData();
        }
    }, [batchId]);

    // Текущий возраст
    const currentAge = useMemo(() => {
        if (!batch) return 0;
        const age = new Date(logDate).getTime() - new Date(batch.start_date).getTime();
        return Math.ceil(age / (1000 * 3600 * 24));
    }, [batch, logDate]);

    // Текущее поголовье
    const totalMortality = useMemo(() => logs.reduce((sum, log) => sum + log.mortality, 0), [logs]);
    const currentQuantity = batch ? batch.initial_quantity - totalMortality : 0;

    // Авто-расчёт на голову в форме
    const waterPerHead = useMemo(() => {
        if (!water || currentQuantity <= 0) return '';
        return Math.round((parseFloat(water) * 1000) / currentQuantity);
    }, [water, currentQuantity]);

    const feedPerHead = useMemo(() => {
        if (!dailyFeed || currentQuantity <= 0) return '';
        return Math.round((parseFloat(dailyFeed) * FEED_BAG_WEIGHT_G) / currentQuantity);
    }, [dailyFeed, currentQuantity]);

    // Справочный расчёт допустимого суточного падежа
    const getMortalityHint = () => {
        if (!batch || !currentAge || currentAge < 1) return null;
        const currentWeek = Math.ceil(currentAge / 7);
        const normPercent = getWeekMortalityNorm(currentWeek);
        const allowedDaily = Math.round((batch.initial_quantity * normPercent / 100) / (currentWeek * 7));
        const totalM = (Number(mortalityNatural) || 0) + (Number(mortalityHalal) || 0);
        return {
            normLabel: `~${allowedDaily} гол/сут (${normPercent}%/нед)`,
            deviation: null,
            percent: null,
            status: totalM > allowedDaily * 2 ? 'critical' : totalM > allowedDaily ? 'warning' : 'ok',
        };
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);

        // Проверка критических отклонений
        const checks = [
            compareWithNorm(currentAge, 'weight', weight),
            compareWithNorm(currentAge, 'dailyFeed', feedPerHead),
            compareWithNorm(currentAge, 'waterNorm', waterPerHead),
        ];
        const hasCritical = checks.some(r => r?.status === 'critical');
        if (hasCritical) {
            const confirmed = window.confirm(
                '⚠️ Обнаружены критические отклонения от нормы ROSS-308.\nСохранить всё равно?'
            );
            if (!confirmed) { setIsSubmitting(false); return; }
        }

        const age = new Date(logDate).getTime() - new Date(batch.start_date).getTime();
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase.from('daily_logs').insert([{
            batch_id: batchId,
            log_date: logDate,
            age: Math.ceil(age / (1000 * 3600 * 24)),
            mortality: (Number(mortalityNatural) || 0) + (Number(mortalityHalal) || 0),
            mortality_natural: Number(mortalityNatural) || 0,
            mortality_halal: Number(mortalityHalal) || 0,
            medicine_id: medicineId || null,
            dosage,
            water_consumption: Number(water) || null,
            weight: weight ? parseFloat(weight) : null,
            daily_feed: dailyFeed ? parseFloat(dailyFeed) : null,
            user_id: user.id
        }]);
        if (error) { alert(error.message); }
        else { 
            setMortalityNatural(''); setMortalityHalal(''); setMedicineId(''); setDosage(''); setWater(''); setWeight(''); setDailyFeed(''); 
            await fetchAllBatchData(); 
            if (!batch?.is_summary) {
                await syncSummaryBatchLog(logDate, user.id);
            }
        }
        setIsSubmitting(false);
    };

    if (loading) { return <div className="text-center p-8">Загрузка...</div>; }
    if (!batch) { return <div className="text-center p-8">Партия не найдена.</div>; }

    const TabButton = ({ tabName, label, count }) => ( <button onClick={() => setActiveTab(tabName)} className={`py-2 px-4 font-semibold flex items-center gap-2 ${activeTab === tabName ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-gray-500 hover:bg-gray-100'}`}> {label} <span className="text-xs bg-gray-200 rounded-full px-2 py-0.5">{count}</span> </button> );

    return (
        <div>
            <Link to="/" className="text-indigo-600 hover:underline mb-4 inline-block">&larr; Назад ко всем партиям</Link>
            <div className="flex flex-wrap items-center gap-x-4 mb-2"><h2 className="text-3xl font-bold text-gray-800">Журнал партии: "{batch.batch_name}"</h2><span className={`px-3 py-1 text-sm font-semibold rounded-full ${batch.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-700'}`}>{batch.is_active ? 'Активна' : 'Завершена'}</span></div>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-gray-600 mb-6"><span>Начало: {new Date(batch.start_date).toLocaleDateString()}</span><span>Начальное поголовье: {batch.initial_quantity}</span><span className="font-bold text-red-600">Общий падеж: {totalMortality}</span><span className="font-bold text-green-600">Текущее поголовье: {currentQuantity}</span></div>

            {/* Дашборд Норм vs Факт */}
            <DashboardNormFact
                logs={logs}
                initialBirds={batch.initial_quantity}
                historicalBatches={historicalBatches}
                historicalLogs={historicalLogs}
            />

            {/* Фильтр падежа по периоду */}
            <MortalityPeriodFilter logs={logs} />

            <div className="bg-white rounded-lg shadow-md mt-4">
                <div className="flex border-b overflow-x-auto"><TabButton tabName="journal" label="Журнал" count={logs.length} /><TabButton tabName="expenses" label="Расходы" count={expenses.length} /><TabButton tabName="sales" label="Продажи" count={sales.length} /><TabButton tabName="feed" label="Корм" count={feed.length} /><TabButton tabName="salaries" label="Зарплаты" count={salaries.length} /></div>
                <div className="p-4 md:p-6">
                    {activeTab === 'journal' && (<>{batch.is_active && (<div className="bg-gray-50 p-4 rounded-lg mb-6"><h3 className="text-xl font-semibold mb-4">Добавить запись</h3><form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div><label>Дата</label><input type="date" value={logDate} onChange={e => setLogDate(e.target.value)} required className="mt-1 w-full p-2 border rounded"/></div>

                        <div className="flex gap-2">
                            <div className="flex-1">
                                <label className="flex items-center flex-wrap gap-1">Падеж ест. <NormIndicator result={getMortalityHint()} /></label>
                                <input type="number" value={mortalityNatural} onChange={e => setMortalityNatural(e.target.value)} className="mt-1 w-full p-2 border rounded"/>
                            </div>
                            <div className="flex-1">
                                <label className="flex items-center flex-wrap gap-1">Падеж хал.</label>
                                <input type="number" value={mortalityHalal} onChange={e => setMortalityHalal(e.target.value)} className="mt-1 w-full p-2 border rounded"/>
                            </div>
                        </div>

                        <div>
                            <label className="flex items-center flex-wrap gap-1">Живая масса (г/гол) <NormIndicator result={compareWithNorm(currentAge, 'weight', weight)} /></label>
                            <input type="number" value={weight} onChange={e => setWeight(e.target.value)} placeholder="Факт, г" className="mt-1 w-full p-2 border rounded"/>
                        </div>

                        <div>
                            <label className="flex items-center flex-wrap gap-1">
                                Вода (литров, всего)
                                <NormIndicator result={compareWithNorm(currentAge, 'waterNorm', waterPerHead)} />
                            </label>
                            <input type="number" step="0.1" value={water} onChange={e => setWater(e.target.value)} placeholder="Общий расход в литрах" className="mt-1 w-full p-2 border rounded"/>
                            {waterPerHead && <p className="text-xs text-gray-500 mt-1">= {waterPerHead} мл/гол ({currentQuantity} голов)</p>}
                        </div>

                        <div>
                            <label className="flex items-center flex-wrap gap-1">
                                Корм (мешков, 1 мешок = 40 кг)
                                <NormIndicator result={compareWithNorm(currentAge, 'dailyFeed', feedPerHead)} />
                            </label>
                            <input type="number" step="0.1" value={dailyFeed} onChange={e => setDailyFeed(e.target.value)} placeholder="Кол-во мешков" className="mt-1 w-full p-2 border rounded"/>
                            {feedPerHead && <p className="text-xs text-gray-500 mt-1">= {feedPerHead} г/гол ({currentQuantity} голов, {dailyFeed ? (parseFloat(dailyFeed) * 40).toFixed(0) : 0} кг)</p>}
                        </div>

                        <div><label>Доза</label><input type="text" value={dosage} onChange={e => setDosage(e.target.value)} className="mt-1 w-full p-2 border rounded"/></div>

                        <div className="md:col-span-3"><label>Лекарство</label><select value={medicineId} onChange={e => setMedicineId(e.target.value)} className="mt-1 w-full p-2 border rounded bg-white"><option value="">-- Не выбрано --</option>{medicines.map(med => <option key={med.id} value={med.id}>{med.name}</option>)}</select></div>
                        <button type="submit" disabled={isSubmitting} className="md:col-span-3 w-full py-2 text-white bg-indigo-600 rounded hover:bg-indigo-700 disabled:bg-gray-400">{isSubmitting ? '...' : 'Добавить'}</button>
                    </form></div>)}<JournalTable logs={logs} batch={batch} medicines={medicines} fetchData={fetchAllBatchData} /></>)}
                    {activeTab === 'expenses' && <ExpensesTable items={expenses} />}
                    {activeTab === 'sales' && <SalesTable items={sales} />}
                    {activeTab === 'feed' && <FeedTable items={feed} />}
                    {activeTab === 'salaries' && <SalariesTable items={salaries} />}
                </div>
            </div>
        </div>
    );
}

export default BatchLogPage;