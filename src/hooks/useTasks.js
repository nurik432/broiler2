import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

export function useTasks(filters = {}) {
  const [tasks,   setTasks]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [JSON.stringify(filters)]);

  async function load() {
    setLoading(true);
    let query = supabase
      .from('tasks')
      .select(`
        *,
        assignee:employees(id, full_name, position),
        workshop:workshops(id, name),
        batch:broiler_batches(id, batch_name)
      `)
      .order('created_at', { ascending: false });

    if (filters.status)      query = query.eq('status', filters.status);
    if (filters.assigneeId)  query = query.eq('assignee_id', filters.assigneeId);
    if (filters.workshopId)  query = query.eq('workshop_id', filters.workshopId);
    if (filters.priority)    query = query.eq('priority', filters.priority);

    const { data } = await query;
    setTasks(data || []);
    setLoading(false);
  }

  async function createTask(taskData) {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('tasks').insert({ ...taskData, user_id: user.id });
    if (!error) load();
    return { error };
  }

  async function updateTask(id, updates) {
    // Если статус меняется на 'done' — записать время завершения
    if (updates.status === 'done') {
      updates.completed_at = new Date().toISOString();
    }
    const { error } = await supabase.from('tasks').update(updates).eq('id', id);
    if (!error) load();
    return { error };
  }

  async function deleteTask(id) {
    const { error } = await supabase.from('tasks').delete().eq('id', id);
    if (!error) load();
    return { error };
  }

  return { tasks, loading, createTask, updateTask, deleteTask, reload: load };
}

export function useEmployees() {
  const [employees, setEmployees] = useState([]);

  useEffect(() => {
    supabase
      .from('employees')
      .select('*')
      .eq('is_active', true)
      .order('full_name')
      .then(({ data }) => setEmployees(data || []));
  }, []);

  return { employees };
}
