// src/mobile/components/StatusPill.jsx
const COLOR = {
  ok: '#28a745',
  warning: '#fd7e14',
  critical: 'var(--tg-destructive, #df3f40)',
  neutral: 'var(--tg-hint, #999)',
};

export default function StatusPill({ status = 'neutral', children }) {
  const c = COLOR[status] || COLOR.neutral;
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ color: c, background: `color-mix(in srgb, ${c} 15%, transparent)` }}
    >
      {children}
    </span>
  );
}
