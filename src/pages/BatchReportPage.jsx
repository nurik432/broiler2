// src/pages/BatchReportPage.jsx

import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';

function BatchReportPage() {
    const { batchId } = useParams(); // Получаем ID партии из URL
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchReport = async () => {
            setLoading(true);

            const { data: batchRow, error: batchError } = await supabase
                .from('broiler_batches')
                .select('is_summary, batch_name')
                .eq('id', batchId)
                .single();

            if (batchError) {
                console.error("Ошибка при загрузке партии:", batchError);
                setError("Не удалось загрузить партию.");
                setLoading(false);
                return;
            }

            if (batchRow.is_summary) {
                const { data, error: rpcError } = await supabase.rpc('get_active_summary_report');
                if (rpcError) {
                    console.error("Ошибка при генерации сводного отчета:", rpcError);
                    setError("Не удалось сгенерировать сводный отчет.");
                } else {
                    setReport({ ...data[0], batch_name: batchRow.batch_name, is_summary: true });
                }
            } else {
                const { data, error: rpcError } = await supabase.rpc('generate_batch_report', {
                    p_batch_id: batchId
                });
                if (rpcError) {
                    console.error("Ошибка при генерации отчета:", rpcError);
                    setError("Не удалось сгенерировать отчет. Убедитесь, что партия существует и у вас есть к ней доступ.");
                } else {
                    setReport(data);
                }
            }
            setLoading(false);
        };

        if (batchId) {
            fetchReport();
        }
    }, [batchId]);

    // Обработка состояний загрузки и ошибок
    if (loading) {
        return <div className="text-center p-8">Генерация отчета...</div>;
    }
    if (error) {
        return <div className="text-center p-8 text-red-600">{error}</div>;
    }
    if (!report) {
        return <div className="text-center p-8">Данные для отчета не найдены.</div>;
    }

    // Вспомогательная функция для форматирования валюты
    const formatCurrency = (value) => {
        if (value === null || isNaN(value)) return '0 TJS';
        return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'TJS' }).format(value);
    };

    return (
        <div>
            <Link to="/" className="text-indigo-600 hover:underline mb-4 inline-block">&larr; Назад ко всем партиям</Link>

            <div className="bg-white p-6 md:p-8 rounded-lg shadow-md max-w-2xl mx-auto">
                <h1 className="text-3xl font-bold text-gray-800">Финансовый отчет</h1>
                <h2 className="text-xl font-semibold text-indigo-600 mb-2">{report.batch_name}</h2>
                {!report.is_summary && (
                    <p className="text-gray-500 mb-6 border-b pb-4">
                        Период: {new Date(report.start_date).toLocaleDateString()} – {new Date(report.end_date).toLocaleDateString()}
                    </p>
                )}
                {report.is_summary && (
                    <p className="text-gray-500 mb-6 border-b pb-4">Сводка по всем активным партиям</p>
                )}

                <div className="space-y-6">
                    {/* --- ДОХОДЫ --- */}
                    <div>
                        <h3 className="text-lg font-semibold mb-2 text-gray-700">Доходы</h3>
                        <div className="flex justify-between items-center bg-green-50 p-3 rounded-lg">
                            <p>{report.is_summary ? 'Общая сумма продаж:' : 'Общая сумма продаж (привязанных):'}</p>
                            <p className="font-bold text-lg text-green-600">{formatCurrency(report.total_sales)}</p>
                        </div>
                    </div>

                    {/* --- РАСХОДЫ --- */}
                    <div>
                        <h3 className="text-lg font-semibold mb-2 text-gray-700">Расходы</h3>
                        <div className="space-y-2 bg-red-50 p-3 rounded-lg">
                            {report.is_summary && (
                                <>
                                    <div className="flex justify-between items-center">
                                        <p>Корм:</p>
                                        <p className="font-semibold">{formatCurrency(report.total_feed_cost)}</p>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <p>Лекарства:</p>
                                        <p className="font-semibold">{formatCurrency(report.total_medicine_cost)}</p>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <p>Уголь:</p>
                                        <p className="font-semibold">{formatCurrency(report.total_coal_cost)}</p>
                                    </div>
                                </>
                            )}
                            <div className="flex justify-between items-center">
                                <p>{report.is_summary ? 'Расходы:' : 'Расходы (привязанные):'}</p>
                                <p className="font-semibold">{formatCurrency(report.total_expenses)}</p>
                            </div>
                            <div className="flex justify-between items-center">
                                <p>{report.is_summary ? 'Зарплаты:' : 'Зарплаты (привязанные):'}</p>
                                <p className="font-semibold">{formatCurrency(report.total_salaries)}</p>
                            </div>
                        </div>
                    </div>

                    {/* --- ИТОГ --- */}
                    <div className="border-t-2 border-dashed pt-6 mt-6">
                        {report.is_summary && (
                            <div className="flex justify-between items-center text-lg font-semibold p-3 mb-3 rounded-lg bg-gray-50">
                                <p>Итого затрат:</p>
                                <p>{formatCurrency(report.total_cost)}</p>
                            </div>
                        )}
                        <div className="flex justify-between items-center text-xl font-bold p-4 rounded-lg bg-gray-100">
                            <p>Итоговая прибыль:</p>
                            <p className={report.profit >= 0 ? 'text-green-600' : 'text-red-600'}>
                                {formatCurrency(report.profit)}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default BatchReportPage;