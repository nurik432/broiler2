// src/mobile/components/SegmentedControl.jsx
export default function SegmentedControl({ options, value, onChange }) {
  return (
    <div className="flex gap-1 p-1 rounded-xl bg-tg-secondary">
      {options.map((o) => (
        <button
          key={o.value} type="button" onClick={() => onChange(o.value)}
          className="flex-1 rounded-lg px-2 py-2 text-sm font-medium"
          style={{
            minHeight: 40,
            background: o.value === value ? 'var(--tg-bg)' : 'transparent',
            color: o.value === value ? 'var(--tg-text)' : 'var(--tg-hint)',
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
