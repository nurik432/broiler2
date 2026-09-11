// src/mobile/components/NamePicker.jsx
// Универсальный combobox поиска+выбора+создания записи по полю full_name.
// Обобщение десктопного src/components/PersonAutocomplete.jsx — используется
// и для persons (сотрудники), и для customers (клиенты продаж).
import { useState, useRef, useEffect } from 'react';

export default function NamePicker({
  items = [],
  value,
  onChange,
  onSelectExisting,
  onCreateNew, // не передавайте, чтобы скрыть опцию "создать новое"
  excludeId,
  placeholder = 'Введите имя...',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setIsOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const query = (value || '').trim().toLowerCase();
  const matches = query
    ? items.filter((p) => p.id !== excludeId && p.full_name.toLowerCase().includes(query)).slice(0, 8)
    : [];
  const exactMatch = items.some((p) => p.id !== excludeId && p.full_name.trim().toLowerCase() === query);

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => { onChange(e.target.value); setIsOpen(true); }}
        onFocus={() => setIsOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full rounded-xl px-3 bg-tg-secondary text-tg-text"
        style={{ minHeight: 48 }}
      />
      {isOpen && query && (
        <div
          className="absolute z-20 mt-1 w-full rounded-xl shadow-lg max-h-64 overflow-y-auto bg-tg-section"
          style={{ border: '1px solid var(--tg-secondary-bg)' }}
        >
          {matches.length > 0 && (
            <div className="py-1">
              {matches.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { onSelectExisting(p); setIsOpen(false); }}
                  className="w-full text-left px-3 py-2 text-sm text-tg-text active:opacity-70"
                >
                  {p.full_name}
                </button>
              ))}
            </div>
          )}
          {onCreateNew && !exactMatch && value.trim() && (
            <button
              type="button"
              onClick={() => { onCreateNew(value.trim()); setIsOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm font-medium active:opacity-70"
              style={{ color: 'var(--tg-link, #4f46e5)', borderTop: '1px solid var(--tg-secondary-bg)' }}
            >
              ➕ Создать «{value.trim()}»
            </button>
          )}
          {matches.length === 0 && (!onCreateNew || exactMatch) && (
            <p className="px-3 py-2 text-sm text-tg-hint">Ничего не найдено</p>
          )}
        </div>
      )}
    </div>
  );
}
