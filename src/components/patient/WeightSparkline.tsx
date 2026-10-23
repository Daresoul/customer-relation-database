import React from 'react';
import type { PatientWeight } from '../../types';

interface WeightSparklineProps {
  /** Newest first, as the backend returns them. */
  weights: PatientWeight[];
  width?: number;
  height?: number;
  label: string;
}

/** A plain SVG trend line, oldest on the left. Needs at least two weights. */
export const WeightSparkline: React.FC<WeightSparklineProps> = ({ weights, width = 80, height = 24, label }) => {
  if (weights.length < 2) return null;
  const series = [...weights].reverse();
  const pad = 2;
  const values = series.map((w) => w.weight);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = (width - pad * 2) / (series.length - 1);
  const points = series
    .map((w, i) => {
      const x = pad + i * step;
      const y = height - pad - ((w.weight - min) / span) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const last = points.split(' ').pop()!.split(',');

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      <title>{label}</title>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r={2} fill="currentColor" />
    </svg>
  );
};

export default WeightSparkline;
