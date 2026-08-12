// src/layouts/AdminLayout.jsx

import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';

function AdminLayout() {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  const linkClass = ({ isActive }) =>
    `px-4 py-2 rounded-lg font-medium ${isActive ? 'bg-indigo-100 text-indigo-700' : 'text-gray-700 hover:bg-gray-100'}`;

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="flex justify-between items-center p-4 bg-white border-b">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-indigo-600">🛡️ Админ-панель</h1>
          <nav className="flex gap-2 ml-6">
            <NavLink to="/" end className={linkClass}>Дашборд</NavLink>
            <NavLink to="/create-client" className={linkClass}>+ Создать клиента</NavLink>
          </nav>
        </div>
        <button onClick={handleLogout} className="px-4 py-2 text-sm font-medium text-white bg-red-500 rounded-md hover:bg-red-600">
          Выйти
        </button>
      </header>

      <main className="p-4 sm:p-6">
        <Outlet />
      </main>
    </div>
  );
}

export default AdminLayout;
