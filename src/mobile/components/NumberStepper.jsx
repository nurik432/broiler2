// src/mobile/components/NumberStepper.jsx
export default function NumberStepper({ value, onChange, step = 1, min = 0, suffix }) {
  const num = () => {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : 0;
  };
  const set = (n) => onChange(String(Math.max(min, Math.round(n * 100) / 100)));
  return (
    <div className="flex items-stretch gap-2">
      <button type="button" onClick={() => set(num() - step)}
        className="w-12 rounded-xl bg-tg-secondary text-xl font-bold" style={{ minHeight: 48 }}>−</button>
      <div className="flex-1 relative">
        <input
          type="text" inputMode="decimal" value={value}
          onChange={(e) => onChange(e.target.value.replace(',', '.'))}
          placeholder="0"
          className="w-full h-full rounded-xl px-3 text-center text-lg bg-tg-secondary text-tg-text outline-none"
          style={{ minHeight: 48 }}
        />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-tg-hint">{suffix}</span>}
      </div>
      <button type="button" onClick={() => set(num() + step)}
        className="w-12 rounded-xl bg-tg-secondary text-xl font-bold" style={{ minHeight: 48 }}>+</button>
    </div>
  );
}
