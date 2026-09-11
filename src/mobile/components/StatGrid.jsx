// src/mobile/components/StatGrid.jsx
// Сетка карточек-метрик для дашбордов (Долги/Корм/Уголь).
export default function StatGrid({ items }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map((it, idx) => (
        <div
          key={idx}
          className="rounded-xl p-3"
          style={{
            background: `color-mix(in srgb, ${it.color || 'var(--tg-hint)'} 12%, transparent)`,
            border: `1px solid color-mix(in srgb, ${it.color || 'var(--tg-hint)'} 30%, transparent)`,
          }}
        >
          <p className="text-xs" style={{ color: it.color || 'var(--tg-hint)' }}>{it.label}</p>
          <p className="text-lg font-bold" style={{ color: it.color || 'var(--tg-text)' }}>{it.value}</p>
          {it.hint && <p className="text-xs text-tg-hint mt-0.5">{it.hint}</p>}
        </div>
      ))}
    </div>
  );
}
