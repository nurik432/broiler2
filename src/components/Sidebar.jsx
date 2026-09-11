// src/components/Sidebar.jsx

import { NavLink } from 'react-router-dom';

function Sidebar({ isOpen, setIsOpen }) {
  const linkClass = "flex items-center px-4 py-2 mt-5 text-gray-700 rounded-lg";
  const activeLinkClass = "bg-indigo-100 text-indigo-700";

  return (
    <>
      {/* --- ОВЕРЛЕЙ ДЛЯ ЗАТЕМНЕНИЯ КОНТЕНТА НА МОБИЛЬНЫХ --- */}
      <div
        onClick={() => setIsOpen(false)}
        className={`fixed inset-0 z-20 bg-black opacity-50 transition-opacity lg:hidden ${isOpen ? 'block' : 'hidden'}`}
      />

      {/* --- САМА БОКОВАЯ ПАНЕЛЬ --- */}
      <div
        className={`fixed inset-y-0 left-0 z-30 w-64 px-4 py-8 overflow-y-auto bg-white border-r transform transition-transform duration-300 ease-in-out 
                   lg:relative lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-3xl font-semibold text-center text-indigo-600">Ферма</h2>
          {/* Кнопка закрытия, видна только на мобильных */}
          <button className="lg:hidden" onClick={() => setIsOpen(false)}>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav className="mt-8">
          <NavLink to="/" end className={({ isActive }) => `${linkClass} ${isActive ? activeLinkClass : 'hover:bg-gray-100'}`} onClick={() => setIsOpen(false)}>
            <span className="mx-4 font-medium">Партии бройлеров</span>
          </NavLink>
          <NavLink to="/medicines" className={({ isActive }) => `${linkClass} ${isActive ? activeLinkClass : 'hover:bg-gray-100'}`} onClick={() => setIsOpen(false)}>
            <span className="mx-4 font-medium">💊 Лекарства</span>
          </NavLink>
          <NavLink to="/expenses" className={({ isActive }) => `${linkClass} ${isActive ? activeLinkClass : 'hover:bg-gray-100'}`} onClick={() => setIsOpen(false)}>
            <span className="mx-4 font-medium">Расходы</span>
          </NavLink>
          <NavLink to="/salaries" className={({ isActive }) => `${linkClass} ${isActive ? activeLinkClass : 'hover:bg-gray-100'}`} onClick={() => setIsOpen(false)}>
            <span className="mx-4 font-medium">Сотрудники и ЗП</span>
          </NavLink>
          <NavLink to="/debts" className={({ isActive }) => `${linkClass} ${isActive ? activeLinkClass : 'hover:bg-gray-100'}`} onClick={() => setIsOpen(false)}>
            <span className="mx-4 font-medium">💰 Долги</span>
          </NavLink>
          <NavLink to="/notes" className={({ isActive }) => `${linkClass} ${isActive ? activeLinkClass : 'hover:bg-gray-100'}`} onClick={() => setIsOpen(false)}>
            <span className="mx-4 font-medium">Заметки</span>
          </NavLink>
          <NavLink to="/sales" className={({ isActive }) => `${linkClass} ${isActive ? activeLinkClass : 'hover:bg-gray-100'}`} onClick={() => setIsOpen(false)}>
            <span className="mx-4 font-medium">Продажи</span>
          </NavLink>
          <NavLink to="/feed" className={({ isActive }) => `${linkClass} ${isActive ? activeLinkClass : 'hover:bg-gray-100'}`} onClick={() => setIsOpen(false)}>
            <span className="mx-4 font-medium">Корм</span>
          </NavLink>
          <NavLink to="/coal" className={({ isActive }) => `${linkClass} ${isActive ? activeLinkClass : 'hover:bg-gray-100'}`} onClick={() => setIsOpen(false)}>
            <span className="mx-4 font-medium">🔥 Уголь</span>
          </NavLink>
          <NavLink to="/gas" className={({ isActive }) => `${linkClass} ${isActive ? activeLinkClass : 'hover:bg-gray-100'}`} onClick={() => setIsOpen(false)}>
            <span className="mx-4 font-medium">⛽ Газ</span>
          </NavLink>
          <NavLink to="/workshops" className={({ isActive }) => `${linkClass} ${isActive ? activeLinkClass : 'hover:bg-gray-100'}`} onClick={() => setIsOpen(false)}>
            <span className="mx-4 font-medium">🏭 Учёт по цехам</span>
          </NavLink>
          <NavLink to="/daily-entry" className={({ isActive }) => `${linkClass} ${isActive ? activeLinkClass : 'hover:bg-gray-100'}`} onClick={() => setIsOpen(false)}>
            <span className="mx-4 font-medium">📝 Дневной ввод</span>
          </NavLink>
          <NavLink to="/tasks" className={({ isActive }) => `${linkClass} ${isActive ? activeLinkClass : 'hover:bg-gray-100'}`} onClick={() => setIsOpen(false)}>
            <span className="mx-4 font-medium">✅ Задачи</span>
          </NavLink>
        </nav>
      </div>
    </>
  );
}

export default Sidebar;