import { localDateStr } from './timeHelpers';

export interface YearCell {
  day:          number;
  dateStr:      string;
  isOtherMonth: boolean;
  dayOfWeek:    number; // 0=Sun … 6=Sat
}

export function getMonthCells(year: number, month: number): YearCell[] {
  const firstDay = new Date(year, month - 1, 1);
  const start    = new Date(year, month - 1, 1 - firstDay.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d   = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const y   = d.getFullYear();
    const m   = d.getMonth() + 1;
    const day = d.getDate();
    return {
      day,
      dateStr:      `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      isOtherMonth: y !== year || m !== month,
      dayOfWeek:    d.getDay(),
    };
  });
}

export function formatYearLabel(year: number): string {
  return `${year}년`;
}

export function isTodayCell(dateStr: string): boolean {
  return dateStr === localDateStr(new Date());
}
