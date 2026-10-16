/** Pure layout helpers for the time grid. Exported for tests. */
export const HOUR_PX = 48;
export const SNAP_MIN = 15;

export type Positioned<T> = { item: T; startMin: number; endMin: number; col: number; cols: number };

/**
 * Greedy column packing within overlap clusters (like Google Calendar's simple mode).
 * Items are [startMin, endMin) within one day.
 */
export function layoutDay<T>(items: Array<{ item: T; startMin: number; endMin: number }>): Positioned<T>[] {
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
  const out: Positioned<T>[] = [];
  let cluster: Positioned<T>[] = [];
  let clusterEnd = -1;
  let colEnds: number[] = [];
  const flush = () => {
    const cols = colEnds.length;
    for (const p of cluster) p.cols = cols;
    out.push(...cluster);
    cluster = [];
    colEnds = [];
  };
  for (const it of sorted) {
    const end = Math.max(it.endMin, it.startMin + SNAP_MIN);
    if (it.startMin >= clusterEnd && cluster.length) flush();
    let col = colEnds.findIndex((e) => e <= it.startMin);
    if (col === -1) {
      col = colEnds.length;
      colEnds.push(end);
    } else colEnds[col] = end;
    cluster.push({ ...it, endMin: end, col, cols: 0 });
    clusterEnd = Math.max(clusterEnd, end);
  }
  if (cluster.length) flush();
  return out;
}

export function snap(min: number, step = SNAP_MIN): number {
  return Math.round(min / step) * step;
}

/** Pixel offset inside a day column → minutes after midnight, snapped and clamped. */
export function offsetToMinutes(offsetPx: number, startHour = 0): number {
  return Math.max(0, Math.min(24 * 60 - SNAP_MIN, snap((offsetPx / HOUR_PX) * 60 + startHour * 60)));
}
