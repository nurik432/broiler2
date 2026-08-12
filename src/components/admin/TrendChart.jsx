// src/components/admin/TrendChart.jsx
// Небольшой линейный график на чистом SVG (без сторонних библиотек).
// Один вызов = одна шкала (одна или несколько серий с одинаковыми единицами измерения).

import { useState, useRef } from 'react';

const W = 640; // внутренняя система координат viewBox
const PAD = { left: 46, right: 16, top: 14, bottom: 26 };

const defaultFormatY = (v) => Number(v || 0).toLocaleString('ru-RU');

export default function TrendChart({
  data = [],
  xKey,
  series,
  height = 160,
  formatX,
  formatY = defaultFormatY,
  emptyMessage = 'Недостаточно данных для графика за этот период.',
}) {
  const [hoverIdx, setHoverIdx] = useState(null);
  const svgRef = useRef(null);

  const n = data.length;
  const plotW = W - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;

  if (n === 0) {
    return (
      <div style={{
        height, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#999', fontSize: 13, background: '#f8f9fa', borderRadius: 6,
        border: '1px dashed #dee2e6',
      }}>
        {emptyMessage}
      </div>
    );
  }

  const allValues = data.flatMap((d) => series.map((s) => Number(d[s.key]) || 0));
  const maxVal = Math.max(...allValues, 0);
  const isAllZero = maxVal === 0;
  const yMax = isAllZero ? 1 : maxVal * 1.15;

  const x = (i) => (n <= 1 ? PAD.left + plotW / 2 : PAD.left + (i / (n - 1)) * plotW);
  const y = (v) => PAD.top + plotH - (Math.min(v, yMax) / yMax) * plotH;

  const buildPath = (key) => data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(Number(d[key]) || 0).toFixed(2)}`).join(' ');

  const xLabelAt = (i) => (formatX ? formatX(data[i][xKey]) : String(data[i][xKey]));

  // Индексы точек, для которых подписываем ось X (первая, средняя, последняя — чтобы не загромождать).
  const xLabelIdxs = n <= 1 ? [0] : n === 2 ? [0, 1] : [0, Math.floor((n - 1) / 2), n - 1];

  function handleMove(e) {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * W;
    let idx = n <= 1 ? 0 : Math.round(((relX - PAD.left) / plotW) * (n - 1));
    idx = Math.max(0, Math.min(n - 1, idx));
    setHoverIdx(idx);
  }

  const hover = hoverIdx != null ? data[hoverIdx] : null;
  const tooltipLeft = hoverIdx != null && hoverIdx > (n - 1) / 2;

  return (
    <div>
      {series.length > 1 && (
        <div style={{ display: 'flex', gap: 14, marginBottom: 6, flexWrap: 'wrap' }}>
          {series.map((s) => (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#555' }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: s.color, display: 'inline-block' }} />
              {s.label}
            </div>
          ))}
        </div>
      )}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${height}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height, display: 'block' }}
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {/* сетка (2 горизонтальные линии: 0 и максимум) */}
        <line x1={PAD.left} y1={y(0)} x2={W - PAD.right} y2={y(0)} stroke="#e5e7eb" strokeWidth={1} />
        <line x1={PAD.left} y1={y(yMax)} x2={W - PAD.right} y2={y(yMax)} stroke="#e5e7eb" strokeWidth={1} />
        <text x={PAD.left - 8} y={y(0) + 4} textAnchor="end" fontSize={10} fill="#999">0</text>
        {!isAllZero && (
          <text x={PAD.left - 8} y={y(yMax) + 4} textAnchor="end" fontSize={10} fill="#999">{formatY(yMax)}</text>
        )}

        {/* оси X — подписи для первой / средней / последней точки */}
        {xLabelIdxs.map((i) => (
          <text key={i} x={x(i)} y={height - 6} textAnchor="middle" fontSize={10} fill="#999">
            {xLabelAt(i)}
          </text>
        ))}

        {/* линии серий */}
        {series.map((s) => (
          <path key={s.key} d={buildPath(s.key)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ))}

        {/* точки-маркеры, только если данных немного — иначе перегружает */}
        {n <= 20 && series.map((s) => (
          <g key={s.key}>
            {data.map((d, i) => (
              <circle key={i} cx={x(i)} cy={y(Number(d[s.key]) || 0)} r={2.5} fill={s.color} />
            ))}
          </g>
        ))}

        {/* курсор наведения */}
        {hover && (
          <g>
            <line x1={x(hoverIdx)} y1={PAD.top} x2={x(hoverIdx)} y2={height - PAD.bottom} stroke="#4f46e5" strokeWidth={1} strokeDasharray="3,3" />
            {series.map((s) => (
              <circle key={s.key} cx={x(hoverIdx)} cy={y(Number(hover[s.key]) || 0)} r={3.5} fill="#fff" stroke={s.color} strokeWidth={2} />
            ))}
          </g>
        )}
      </svg>

      {hover && (
        <div style={{ display: 'flex', justifyContent: tooltipLeft ? 'flex-end' : 'flex-start', marginTop: 4 }}>
          <div style={{
            fontSize: 12, background: '#1f2937', color: '#fff', borderRadius: 6, padding: '6px 10px',
            display: 'inline-block',
          }}>
            <div style={{ color: '#aaa', marginBottom: 2 }}>{xLabelAt(hoverIdx)}</div>
            {series.map((s) => (
              <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: s.color, display: 'inline-block' }} />
                {s.label}: <strong>{formatY(hover[s.key])}</strong>
              </div>
            ))}
          </div>
        </div>
      )}
      {isAllZero && (
        <p style={{ fontSize: 11, color: '#bbb', marginTop: 2 }}>Все значения за этот период равны нулю.</p>
      )}
    </div>
  );
}
