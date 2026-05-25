import { localDateStr } from './timeHelpers';

export interface MonthCell {
  dateStr:      string; // YYYY-MM-DD
  isOtherMonth: boolean;
}

/** Returns 6×7=42 cells starting from the Sunday on or before the 1st. */
export function getMonthGrid(year: number, month: number): MonthCell[] {
  const firstDay   = new Date(year, month - 1, 1);
  const startDay   = new Date(year, month - 1, 1 - firstDay.getDay());
  const cells: MonthCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(startDay.getFullYear(), startDay.getMonth(), startDay.getDate() + i);
    cells.push({ dateStr: localDateStr(d), isOtherMonth: d.getMonth() !== month - 1 });
  }
  return cells;
}

export function isToday(dateStr: string): boolean {
  return dateStr === localDateStr(new Date());
}

/** "2026년 5월" */
export function formatMonthLabel(year: number, month: number): string {
  return `${year}년 ${month}월`;
}
