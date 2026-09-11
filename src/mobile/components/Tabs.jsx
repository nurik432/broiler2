export default function Tabs({ tabs, active, onChange }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
      {tabs.map((t) => {
        const isActive = active === t.key;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className="flex-shrink-0 rounded-full px-3 py-1.5 text-sm font-medium flex items-center gap-1.5"
            style={{
              minHeight: 36,
              background: isActive ? 'var(--tg-button)' : 'var(--tg-secondary-bg)',
              color: isActive ? 'var(--tg-button-text)' : 'var(--tg-text)',
            }}
          >
            {t.label}
            {t.count != null && (
              <span
                className="rounded-full px-1.5 text-xs"
                style={{
                  background: isActive ? 'rgba(255,255,255,0.25)' : 'var(--tg-bg)',
                  color: isActive ? 'var(--tg-button-text)' : 'var(--tg-hint)',
                }}
              >
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
