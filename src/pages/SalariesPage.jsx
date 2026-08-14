// src/pages/SalariesPage.jsx

import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import CreateEmployeeTab from '../pages/employees/CreateEmployeeTab';
import HireFireTab from '../pages/employees/HireFireTab';
import SalaryTab from '../pages/employees/SalaryTab';

export default function SalariesPage() {
    // Global data
    const [persons, setPersons] = useState([]);
    const [activeBatches, setActiveBatches] = useState([]);
    const [selectedPerson, setSelectedPerson] = useState(null);
    const [showArchivedEmployees, setShowArchivedEmployees] = useState(false);
    const [loading, setLoading] = useState(true);

    const [activeTab, setActiveTab] = useState('create'); // 'create' | 'hire' | 'salary'

    // Fetch helpers
    const fetchPersons = async () => {
        const { data, error } = await supabase
            .from('persons')
            .select(`
                *,
                employees (*, broiler_batches (id, batch_name, is_active, batch_end))
            `)
            .order('full_name');
        if (error) console.error('Ошибка загрузки сотрудников:', error);
        else {
            const formatted = data.map(person => {
                if (person.employees) {
                    person.employees.sort((a, b) => new Date(b.start_date) - new Date(a.start_date));
                } else {
                    person.employees = [];
                }
                return person;
            });
            setPersons(formatted);
        }
    };

    const fetchActiveBatches = async () => {
        const { data, error } = await supabase
            .from('broiler_batches')
            .select('id, batch_name, start_date, is_active')
            .order('start_date', { ascending: false });
        if (error) console.error('Ошибка загрузки партий:', error);
        else setActiveBatches(data);
    };

    useEffect(() => {
        setLoading(true);
        Promise.all([fetchPersons(), fetchActiveBatches()]).then(() => setLoading(false));
    }, []);

    // Tab navigation UI – premium glassmorphism style
    const TabButton = ({ id, label }) => (
        <button
            onClick={() => setActiveTab(id)}
            className={`px-4 py-2.5 rounded-xl transition-all font-medium text-sm sm:text-base whitespace-nowrap ${
                activeTab === id
                    ? 'bg-indigo-600 text-white shadow-lg'
                    : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
            }`}
        >
            {label}
        </button>
    );

    return (
        <div className="p-4 sm:p-6 min-h-screen bg-gradient-to-br from-gray-100 to-gray-200">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-6">Сотрудники и зарплаты</h1>
            <div className="flex flex-wrap gap-2 sm:gap-4 mb-8">
                <TabButton id="create" label="Создание сотрудника" />
                <TabButton id="hire" label="Принятие и увольнение" />
                <TabButton id="salary" label="Начисление зарплаты" />
            </div>

            {loading && <p className="text-gray-500">Загрузка данных…</p>}

            {!loading && (
                <div>
                    {activeTab === 'create' && (
                        <CreateEmployeeTab
                            activeBatches={activeBatches}
                            fetchPersons={fetchPersons}
                            persons={persons}
                        />
                    )}
                    {activeTab === 'hire' && (
                        <HireFireTab
                            persons={persons}
                            activeBatches={activeBatches}
                            fetchPersons={fetchPersons}
                            showArchivedEmployees={showArchivedEmployees}
                            setShowArchivedEmployees={setShowArchivedEmployees}
                            selectedPerson={selectedPerson}
                            setSelectedPerson={setSelectedPerson}
                        />
                    )}
                    {activeTab === 'salary' && (
                        <SalaryTab
                            selectedPerson={selectedPerson}
                            setSelectedPerson={setSelectedPerson}
                            activeBatches={activeBatches}
                            persons={persons}
                        />
                    )}
                </div>
            )}
        </div>
    );
}