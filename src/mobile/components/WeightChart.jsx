// src/mobile/components/WeightChart.jsx
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const ACTUAL_COLOR = '#28a745';
const NORM_COLOR = '#9ca3af';

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const rows = [
    { key: 'actual', name: 'Факт', color: ACTUAL_COLOR },
    { key: 'forecast', name: 'Прогноз', color: ACTUAL_COLOR },
    { key: 'standard', name: 'Норма', color: NORM_COLOR },
  ];
  return (
    <div
      className="rounded-lg px-3 py-2 text-xs"
      style={{ background: 'var(--tg-section-bg)', border: '1px solid var(--tg-secondary-bg)' }}
    >
      <p className="font-semibold mb-1">День {label}</p>
      {rows.map((r) => {
        const entry = payload.find((p) => p.dataKey === r.key);
        if (!entry || entry.value == null) return null;
        return (
          <p key={r.key} className="flex items-center gap-1.5">
            <span style={{ display: 'inline-block', width: 8, height: 2, background: r.color }} />
            {r.name}: <strong>{entry.value} г</strong>
          </p>
        );
      })}
    </div>
  );
}

export default function WeightChart({ data }) {
  if (!data?.length) return null;
  return (
    <div>
      <div style={{ width: '100%', height: 220 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--tg-secondary-bg)" vertical={false} />
            <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'var(--tg-hint)' }} />
            <YAxis tick={{ fontSize: 10, fill: 'var(--tg-hint)' }} width={36} />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: NORM_COLOR, strokeWidth: 1 }} />
            <Line
              type="monotone" dataKey="standard" stroke={NORM_COLOR} strokeWidth={2}
              strokeDasharray="4 4" dot={false} isAnimationActive={false}
            />
            <Line
              type="monotone" dataKey="actual" stroke={ACTUAL_COLOR} strokeWidth={2}
              dot={{ r: 3, fill: ACTUAL_COLOR, stroke: 'var(--tg-bg)', strokeWidth: 2 }}
              connectNulls isAnimationActive={false}
            />
            <Line
              type="monotone" dataKey="forecast" stroke={ACTUAL_COLOR} strokeWidth={2}
              strokeDasharray="4 4" dot={false} connectNulls isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="flex gap-4 justify-center mt-1 text-xs text-tg-hint">
        <span className="flex items-center gap-1">
          <span style={{ width: 8, height: 2, background: ACTUAL_COLOR, display: 'inline-block' }} /> Факт/Прогноз
        </span>
        <span className="flex items-center gap-1">
          <span style={{ width: 8, height: 2, background: NORM_COLOR, display: 'inline-block' }} /> Норма
        </span>
      </div>
    </div>
  );
}
