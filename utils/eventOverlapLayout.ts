export interface EventLayoutInfo {
  columnIndex:  number;
  totalColumns: number;
  widthRatio:   number; // 1 / totalColumns
  xRatio:       number; // columnIndex / totalColumns
}

interface MinimalEvent {
  id:       string;
  start_at: string;
  end_at:   string | null | undefined;
}

function endMs(ev: MinimalEvent): number {
  return ev.end_at
    ? new Date(ev.end_at).getTime()
    : new Date(ev.start_at).getTime() + 3_600_000;
}

function assignClusterColumns(cluster: MinimalEvent[]): Map<string, EventLayoutInfo> {
  const colEndMs: number[] = [];
  const colAssign: number[] = [];

  for (const ev of cluster) {
    const startMs = new Date(ev.start_at).getTime();
    let placed = -1;
    for (let c = 0; c < colEndMs.length; c++) {
      if (colEndMs[c] <= startMs) { placed = c; break; }
    }
    if (placed === -1) {
      placed = colEndMs.length;
      colEndMs.push(0);
    }
    colEndMs[placed] = endMs(ev);
    colAssign.push(placed);
  }

  const totalColumns = colEndMs.length;
  const result = new Map<string, EventLayoutInfo>();
  cluster.forEach((ev, i) => {
    result.set(ev.id, {
      columnIndex:  colAssign[i],
      totalColumns,
      widthRatio:   1 / totalColumns,
      xRatio:       colAssign[i] / totalColumns,
    });
  });
  return result;
}

/**
 * Computes column layout for overlapping events.
 * Events are grouped into overlap clusters; within each cluster a greedy
 * column-assignment gives each event its columnIndex and totalColumns.
 *
 * A single event always gets { columnIndex:0, totalColumns:1, widthRatio:1, xRatio:0 }.
 */
export function computeOverlapLayout(events: MinimalEvent[]): Map<string, EventLayoutInfo> {
  if (events.length === 0) return new Map();

  const sorted = [...events].sort(
    (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime(),
  );

  const result = new Map<string, EventLayoutInfo>();
  let i = 0;

  while (i < sorted.length) {
    let maxEnd = endMs(sorted[i]);
    let j = i + 1;

    while (j < sorted.length && new Date(sorted[j].start_at).getTime() < maxEnd) {
      maxEnd = Math.max(maxEnd, endMs(sorted[j]));
      j++;
    }

    const cluster = sorted.slice(i, j);
    assignClusterColumns(cluster).forEach((info, id) => result.set(id, info));
    i = j;
  }

  return result;
}
