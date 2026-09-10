// src/mobile/layouts/MoreSheet.jsx
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import BottomSheet from '../components/BottomSheet';

const GROUPS = [
  { title: 'Финансы', items: [
    ['/expenses', 'Расходы'], ['/sales', 'Продажи'],
    ['/salaries', 'Сотрудники и ЗП'], ['/debts', 'Долги'],
  ] },
  { title: 'Учёт', items: [
    ['/workshops', 'Учёт по цехам'], ['/feed', 'Корм'], ['/coal', 'Уголь'],
  ] },
  { title: 'Справочники', items: [
    ['/medicines', 'Лекарства'], ['/notes', 'Заметки'],
  ] },
];

export default function MoreSheet({ open, onClose }) {
  const navigate = useNavigate();
  const go = (path) => { onClose(); navigate(path); };

  return (
    <BottomSheet open={open} onClose={onClose} title="Ещё">
      <div className="flex flex-col gap-4">
        {GROUPS.map((g) => (
          <div key={g.title}>
            <p className="text-xs uppercase tracking-wide text-tg-hint mb-1">{g.title}</p>
            <div className="rounded-xl overflow-hidden bg-tg-section">
              {g.items.map(([path, label]) => (
                <button
                  key={path}
                  onClick={() => go(path)}
                  className="w-full text-left px-4 py-3 text-base border-b last:border-b-0"
                  style={{ borderColor: 'var(--tg-secondary-bg)', minHeight: 48 }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        ))}
        <button
          onClick={async () => { await supabase.auth.signOut(); onClose(); window.location.reload(); }}
          className="mt-2 w-full rounded-xl px-4 py-3 text-base font-semibold text-tg-destructive bg-tg-section"
          style={{ minHeight: 48 }}
        >
          Выйти
        </button>
      </div>
    </BottomSheet>
  );
}
