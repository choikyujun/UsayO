import { Platform } from 'react-native';

export const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

/** "9:00" or "14:30" — compact for the time column */
export function formatTimeRow(date: Date): string {
  const h = date.getHours();
  const m = date.getMinutes();
  return `${h}:${String(m).padStart(2, '0')}`;
}

/** "오전 9시", "오후 2시 30분" */
export function formatTimeKo(date: Date): string {
  const h = date.getHours();
  const m = date.getMinutes();
  const ampm = h < 12 ? '오전' : '오후';
  const h12 = h % 12 || 12;
  if (m === 0) return `${ampm} ${h12}시`;
  return `${ampm} ${h12}:${String(m).padStart(2, '0')}`;
}

export type Period = '오전' | '오후' | '저녁';

export function getPeriod(date: Date): Period {
  const h = date.getHours();
  if (h < 12) return '오전';
  if (h < 18) return '오후';
  return '저녁';
}

export function localDateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function todayDateStr(): string {
  return localDateStr(new Date());
}

export function isEventPast(endAt: string): boolean {
  return new Date(endAt).getTime() < Date.now();
}

export function isEventOngoing(startAt: string, endAt: string): boolean {
  const now = Date.now();
  return new Date(startAt).getTime() <= now && new Date(endAt).getTime() > now;
}

/** 12:00–12:59 → lunch zone */
export function isLunchHour(date: Date): boolean {
  return date.getHours() === 12;
}
