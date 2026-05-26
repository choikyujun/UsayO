export function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function addWeeks(date: Date, n: number): Date {
  return addDays(date, n * 7);
}

export function addMonths(date: Date, n: number): Date {
  const d = new Date(date);
  const targetMonth = d.getMonth() + n;
  d.setMonth(targetMonth);
  // Prevent month overflow (e.g. Jan 31 + 1 → Mar 3 instead of Feb 28)
  if (d.getMonth() !== ((targetMonth % 12) + 12) % 12) {
    d.setDate(0); // last day of previous month
  }
  return d;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth()    === b.getMonth()    &&
    a.getDate()     === b.getDate()
  );
}

export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay()); // Sunday = 0
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getWeekDays(date: Date): Date[] {
  const start = startOfWeek(date);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

// Returns 6 weeks (42 days) starting from the Sunday before the 1st of the month
export function getMonthWeeks(year: number, month: number): Date[][] {
  const firstDay = new Date(year, month, 1);
  let cursor = startOfWeek(firstDay);
  const weeks: Date[][] = [];
  for (let w = 0; w < 6; w++) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d++) {
      week.push(new Date(cursor));
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
  }
  return weeks;
}

// Returns "YYYY-MM"
export function toYearMonth(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

const KO_WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

// "내일 5월 26일 화요일" / "모레 5월 27일 수요일" / "5월 28일 목요일"
export function formatUpcomingDate(date: Date, today = new Date()): string {
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dateStart  = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays   = Math.round((dateStart.getTime() - todayStart.getTime()) / 86_400_000);
  const month      = date.getMonth() + 1;
  const day        = date.getDate();
  const weekday    = KO_WEEKDAYS[date.getDay()];
  const suffix     = `${month}월 ${day}일 ${weekday}요일`;
  if (diffDays === 1) return `내일 ${suffix}`;
  if (diffDays === 2) return `모레 ${suffix}`;
  return suffix;
}

// "내일" / "모레" / "5월 28일" — short form for conversational header
export function formatRelativeDay(date: Date, today = new Date()): string {
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dateStart  = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays   = Math.round((dateStart.getTime() - todayStart.getTime()) / 86_400_000);
  if (diffDays === 1) return '내일';
  if (diffDays === 2) return '모레';
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

export interface DateGroup<T> {
  date: Date;
  events: T[];
  isHoliday: boolean;
}

import { isKoreanHoliday } from '../hooks/useHolidays';

// Groups events by calendar date (local time). Events must have a `start_at: string` field.
export function groupByDate<T extends { start_at: string }>(events: T[]): DateGroup<T>[] {
  const map = new Map<string, DateGroup<T>>();
  for (const ev of events) {
    const d    = new Date(ev.start_at);
    const key  = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (!map.has(key)) {
      map.set(key, { date: d, events: [], isHoliday: isKoreanHoliday(d) });
    }
    const group = map.get(key);
    if (group) group.events.push(ev);
  }
  return Array.from(map.values());
}
