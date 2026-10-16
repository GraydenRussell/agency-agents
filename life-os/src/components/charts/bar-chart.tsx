"use client";
import { useState } from "react";

export type Bar = { key: string; label: string; value: number | null; display: string };

/**
 * Single-series bar chart (dataviz rules: one hue, thin bars with 4px rounded tops anchored to the
 * baseline, 2px gaps, recessive grid, optional dashed target line, hover tooltip, table for screen readers).
 * No legend: the card title names the series.
 */
export function BarChart({ data, target, targetLabel, height = 120, ariaLabel, unit }: { data: Bar[]; target?: number; targetLabel?: string; height?: number; ariaLabel: string; unit?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(target ?? 0, ...data.map((d) => d.value ?? 0)) * 1.1 || 1;
  const w = 100 / Math.max(1, data.length);
  const y = (v: number) => height - (v / max) * height;
  const h = hover !== null ? data[hover] : null;

  return (
    <figure className="relative">
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="h-[var(--h)] w-full overflow-visible" style={{ ["--h" as string]: `${height}px` }} role="img" aria-label={ariaLabel} onMouseLeave={() => setHover(null)}>
        <line x1="0" x2="100" y1={height} y2={height} className="stroke-border" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        {target !== undefined && <line x1="0" x2="100" y1={y(target)} y2={y(target)} className="stroke-muted-foreground" strokeDasharray="4 4" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
        {data.map((d, i) => {
          const v = d.value ?? 0;
          const top = y(v);
          const barW = Math.max(0.5, w - Math.min(w * 0.35, 2.4));
          const x = i * w + (w - barW) / 2;
          return (
            <g key={d.key} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} aria-label={`${d.label}: ${d.display}`}>
              {/* Hit target larger than the mark */}
              <rect x={i * w} y={0} width={w} height={height} fill="transparent" />
              {d.value !== null && v > 0 && <path d={roundedTop(x, top, barW, height - top, Math.min(4, barW / 2))} className={hover === i ? "fill-brand-cyan" : "fill-primary"} />}
              {d.value === null && <rect x={x} y={height - 2} width={barW} height={2} className="fill-muted" />}
            </g>
          );
        })}
      </svg>
      {target !== undefined && targetLabel && <span className="pointer-events-none absolute right-0 text-[10px] text-muted-foreground" style={{ top: Math.max(0, y(target) - 14) }}>{targetLabel}</span>}
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>{data[0]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
      {h && (
        <div className="pointer-events-none absolute -top-8 rounded-md border border-border bg-popover px-2 py-1 text-xs shadow" style={{ left: `clamp(0px, calc(${(hover ?? 0) * w}% - 24px), calc(100% - 96px))` }}>
          <span className="text-muted-foreground">{h.label}</span> <strong>{h.display}</strong>
        </div>
      )}
      <table className="sr-only">
        <caption>{ariaLabel}</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.key}>
              <th scope="row">{d.label}</th>
              <td>
                {d.display}
                {unit ? ` ${unit}` : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function roundedTop(x: number, y: number, w: number, h: number, r: number) {
  // Rounded data-end at the top, square at the baseline (in a non-uniformly scaled viewBox the radius stays subtle).
  const rr = Math.min(r, h);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}
