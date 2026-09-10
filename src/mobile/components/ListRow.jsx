// src/mobile/components/ListRow.jsx
export default function ListRow({ label, value, hint, onClick }) {
  return (
    <div
      onClick={onClick}
      className="flex items-center justify-between gap-3 py-2"
      style={{ minHeight: onClick ? 44 : undefined }}
    >
      <div className="min-w-0">
        <div className="text-sm text-tg-text truncate">{label}</div>
        {hint && <div className="text-xs text-tg-hint truncate">{hint}</div>}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {value != null && <span className="text-sm font-medium text-tg-text">{value}</span>}
        {onClick && <span className="text-tg-hint">›</span>}
      </div>
    </div>
  );
}
