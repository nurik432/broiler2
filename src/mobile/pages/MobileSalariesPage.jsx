// src/mobile/pages/MobileSalariesPage.jsx
import { useEffect, useState } from 'react';
import { supabase } from '../../supabaseClient';
import Tabs from '../components/Tabs';
import Spinner from '../components/Spinner';
import MobileCreateEmployeeTab from './salaries/MobileCreateEmployeeTab';
import MobileHireFireTab from './salaries/MobileHireFireTab';
import MobileSalaryTab from './salaries/MobileSalaryTab';

export default function MobileSalariesPage() {
  const [persons, setPersons] = useState([]);
  const [activeBatches, setActiveBatches] = useState([]);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('create');

  async function fetchPersons() {
    const { data, error } = await supabase
      .from('persons')
      .select('*, employees (*, broiler_batches (id, batch_name, is_active, batch_end))')
      .order('full_name');
    if (error) { window.alert('Ошибка: ' + error.message); return; }
    const formatted = (data || []).map((person) => {
      person.employees = (person.employees || []).sort((a, b) => new Date(b.start_date) - new Date(a.start_date));
      return person;
    });
    setPersons(formatted);
  }

  async function fetchActiveBatches() {
    const { data, error } = await supabase.from('broiler_batches').select('id, batch_name, start_date, is_active').order('start_date', { ascending: false });
    if (error) { window.alert('Ошибка: ' + error.message); return; }
    setActiveBatches(data || []);
  }

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchPersons(), fetchActiveBatches()]).then(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  return (
    <div className="flex flex-col gap-3 py-3">
      <Tabs
        tabs={[
          { key: 'create', label: 'Создание' },
          { key: 'hire', label: 'Приём/увольнение' },
          { key: 'salary', label: 'Зарплата' },
        ]}
        active={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === 'create' && <MobileCreateEmployeeTab activeBatches={activeBatches} fetchPersons={fetchPersons} persons={persons} />}
      {activeTab === 'hire' && <MobileHireFireTab persons={persons} activeBatches={activeBatches} fetchPersons={fetchPersons} />}
      {activeTab === 'salary' && <MobileSalaryTab selectedPerson={selectedPerson} setSelectedPerson={setSelectedPerson} activeBatches={activeBatches} persons={persons} />}
    </div>
  );
}
