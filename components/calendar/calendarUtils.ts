import { Event } from '../../types/database';

export const DAYS_KO = ['일', '월', '화', '수', '목', '금', '토'];
export const MONTHS_KO = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];

export const CATEGORY_COLORS = {
  work:      '#534AB7',
  personal:  '#1D9E75',
  important: '#D85A30',
} as const;

export const HEATMAP_COLORS = [
  '#1C1A35', // 0 events
  '#2A2460', // 1 event
  '#3C3489', // 2 events
  '#534AB7', // 3 events
  '#7F77DD', // 4+ events
] as const;

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function buildCells(year: number, month: number): (Date | null)[][] {
  const first = new Date(year, month, 1);
  const last  = new Date(year, month + 1, 0);
  const cells: (Date | null)[][] = [];
  let week: (Date | null)[] = Array(first.getDay()).fill(null);

  for (let d = 1; d <= last.getDate(); d++) {
    week.push(new Date(year, month, d));
    if (week.length === 7) { cells.push(week); week = []; }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    cells.push(week);
  }
  return cells;
}

export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function formatTime12(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h < 12 ? '오전' : '오후';
  const h12 = h % 12 || 12;
  return m === 0
    ? `${ampm} ${h12}시`
    : `${ampm} ${h12}:${m.toString().padStart(2, '0')}`;
}

export function groupEventsByDate(events: Event[]): Record<string, Event[]> {
  const map: Record<string, Event[]> = {};
  for (const e of events) {
    const d = toDateStr(new Date(e.start_at)); // local date, not UTC split
    (map[d] ??= []).push(e);
  }
  return map;
}

export interface EventLane {
  event: Event;
  lane: number;
  laneCount: number;
}

function eventsOverlap(a: Event, b: Event): boolean {
  return new Date(a.start_at) < new Date(b.end_at) && new Date(b.start_at) < new Date(a.end_at);
}

export function assignLanes(events: Event[]): EventLane[] {
  if (events.length === 0) return [];
  const sorted = [...events].sort((a, b) =>
    new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
  );
  const lanes: string[] = []; // each entry = end_at of last event in that lane
  const result: EventLane[] = sorted.map(event => ({ event, lane: 0, laneCount: 1 }));

  for (let i = 0; i < sorted.length; i++) {
    const startMs = new Date(sorted[i].start_at).getTime();
    let assigned = false;
    for (let l = 0; l < lanes.length; l++) {
      if (new Date(lanes[l]).getTime() <= startMs) {
        result[i].lane = l;
        lanes[l] = sorted[i].end_at;
        assigned = true;
        break;
      }
    }
    if (!assigned) {
      result[i].lane = lanes.length;
      lanes.push(sorted[i].end_at);
    }
  }

  for (let i = 0; i < sorted.length; i++) {
    let maxLane = result[i].lane;
    for (let j = 0; j < sorted.length; j++) {
      if (i !== j && eventsOverlap(sorted[i], sorted[j])) {
        maxLane = Math.max(maxLane, result[j].lane);
      }
    }
    result[i].laneCount = maxLane + 1;
  }
  return result;
}

export function getFreeSlots(
  events: Event[],
  startHour: number,
  endHour: number,
): Array<{ startH: number; endH: number }> {
  const sorted = [...events].sort((a, b) =>
    new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
  );
  const slots: Array<{ startH: number; endH: number }> = [];
  let cursor = startHour;

  for (const e of sorted) {
    const sh = new Date(e.start_at).getHours() + new Date(e.start_at).getMinutes() / 60;
    const eh = new Date(e.end_at).getHours() + new Date(e.end_at).getMinutes() / 60;
    const gap = Math.max(startHour, sh) - cursor;
    if (gap >= 2) slots.push({ startH: cursor, endH: cursor + gap });
    cursor = Math.max(cursor, Math.min(endHour, eh));
  }
  if (endHour - cursor >= 2) slots.push({ startH: cursor, endH: endHour });
  return slots;
}
