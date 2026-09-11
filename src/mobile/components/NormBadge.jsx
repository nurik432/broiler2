const STATUS_STYLE = {
  ok: { color: '#28a745', icon: '✅' },
  warning: { color: '#fd7e14', icon: '⚠️' },
  critical: { color: 'var(--tg-destructive, #df3f40)', icon: '🔴' },
};

export default function NormBadge({ result }) {
  if (!result) return null;
  const s = STATUS_STYLE[result.status];
  if (!s) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ml-2 align-middle"
      style={{ color: s.color, background: `color-mix(in srgb, ${s.color} 15%, transparent)` }}
    >
      {s.icon} Норма: {result.normLabel}
      {result.deviation != null && (
        <>
          {' '}· {result.deviation > 0 ? '+' : ''}
          {result.deviation} ({result.percent}%)
        </>
      )}
    </span>
  );
}
