import React from 'react';
import { theme } from 'antd';
import type { LabResultRow } from '../../types/labResults';
import { formatDate } from '../../utils/dateFormatter';

interface LabTrendChartProps {
  /** Numeric values of one analyte, oldest first. */
  points: LabResultRow[];
  label: string;
  bandLabel: string;
  width?: number;
  height?: number;
}

const PAD = { top: 12, right: 16, bottom: 28, left: 52 };

function tick(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(Math.abs(n) < 10 ? 2 : 1);
}

/** A plain SVG line over time, with the newest value's reference range shaded. */
export const LabTrendChart: React.FC<LabTrendChartProps> = ({ points, label, bandLabel, width = 640, height = 200 }) => {
  const { token } = theme.useToken();
  const values = points.map((p) => p.valueNum as number);
  const newest = points[points.length - 1];
  const low = newest?.refLow ?? null;
  const high = newest?.refHigh ?? null;

  const all = [...values, ...(low != null ? [low] : []), ...(high != null ? [high] : [])];
  let min = Math.min(...all);
  let max = Math.max(...all);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const margin = (max - min) * 0.08;
  min -= margin;
  max += margin;

  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const y = (v: number) => PAD.top + plotH - ((v - min) / (max - min)) * plotH;
  const flagColor = (flag: string) =>
    flag === 'H' ? token.colorError : flag === 'L' ? token.colorPrimary : token.colorText;

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
      style={{ maxWidth: width, display: 'block' }}
    >
      <title>{label}</title>
      {low != null && high != null && (
        <rect
          data-testid="reference-band"
          x={PAD.left}
          width={plotW}
          y={y(high)}
          height={Math.max(y(low) - y(high), 1)}
          fill={token.colorSuccessBg}
          stroke={token.colorSuccessBorder}
        >
          <title>{`${bandLabel}: ${tick(low)} – ${tick(high)}`}</title>
        </rect>
      )}
      <line x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={PAD.top + plotH} stroke={token.colorBorder} />
      <line x1={PAD.left} x2={PAD.left + plotW} y1={PAD.top + plotH} y2={PAD.top + plotH} stroke={token.colorBorder} />
      {[max - margin, min + margin].map((v) => (
        <text key={v} x={PAD.left - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill={token.colorTextSecondary}>
          {tick(v)}
        </text>
      ))}
      {points.length > 1 && (
        <polyline
          points={points.map((p, i) => `${x(i).toFixed(1)},${y(p.valueNum as number).toFixed(1)}`).join(' ')}
          fill="none"
          stroke={token.colorTextSecondary}
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
      )}
      {points.map((p, i) => (
        <circle key={p.id} cx={x(i)} cy={y(p.valueNum as number)} r={4} fill={flagColor(p.flag)}>
          <title>{`${formatDate(p.sampleAt)}: ${p.valueText}${p.unit ? ` ${p.unit}` : ''}`}</title>
        </circle>
      ))}
      {points.map((p, i) =>
        points.length <= 8 || i === 0 || i === points.length - 1 ? (
          <text
            key={`d${p.id}`}
            x={x(i)}
            y={height - 8}
            textAnchor={points.length === 1 ? 'middle' : i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}
            fontSize={11}
            fill={token.colorTextSecondary}
          >
            {formatDate(p.sampleAt)}
          </text>
        ) : null,
      )}
    </svg>
  );
};

export default LabTrendChart;
