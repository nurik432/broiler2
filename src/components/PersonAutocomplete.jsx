// src/components/PersonAutocomplete.jsx
// Комбобокс поиска физлица по подстроке ФИО — чтобы не плодить дубли
// при малейшем отличии в написании имени.

import { useState, useRef, useEffect } from 'react';

export default function PersonAutocomplete({
    persons = [],
    value,
    onChange,
    onSelectExisting,
    onCreateNew, // не передавайте, чтобы скрыть опцию "создать новое"
    excludeId,
    placeholder = 'Введите ФИО...',
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
        ? persons.filter(p => p.id !== excludeId && p.full_name.toLowerCase().includes(query)).slice(0, 8)
        : [];
    const exactMatch = persons.some(p => p.id !== excludeId && p.full_name.trim().toLowerCase() === query);

    return (
        <div ref={containerRef} className="relative">
            <input
                type="text"
                value={value}
                onChange={e => { onChange(e.target.value); setIsOpen(true); }}
                onFocus={() => setIsOpen(true)}
                placeholder={placeholder}
                autoComplete="off"
                className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow"
            />
            {isOpen && query && (
                <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-64 overflow-y-auto">
                    {matches.length > 0 && (
                        <div className="py-1">
                            <p className="px-3 pt-1 pb-0.5 text-xs text-gray-400 font-medium">Существующие физлица</p>
                            {matches.map(p => (
                                <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => { onSelectExisting(p); setIsOpen(false); }}
                                    className="w-full text-left px-3 py-2 hover:bg-indigo-50 text-sm"
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
                            className="w-full text-left px-3 py-2 hover:bg-emerald-50 text-sm text-emerald-700 font-medium border-t border-gray-100"
                        >
                            ➕ Создать новое физлицо «{value.trim()}»
                        </button>
                    )}
                    {matches.length === 0 && (!onCreateNew || exactMatch) && (
                        <p className="px-3 py-2 text-sm text-gray-400">Ничего не найдено</p>
                    )}
                </div>
            )}
        </div>
    );
}
