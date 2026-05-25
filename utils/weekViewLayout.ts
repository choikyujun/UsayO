import { Dimensions } from 'react-native';
import { TIME_LABEL_W } from './dayViewLayout';
import { localDateStr } from './timeHelpers';

const { width: SCREEN_W } = Dimensions.get('window');

export const COL_W = (SCREEN_W - TIME_LABEL_W) / 7;

const KO_DAYS_SHORT = ['일', '월', '화', '수', '목', '금', '토'];

/** 7 date strings starting from anchorDate (default: today). */
export function getWeekDays(anchorDate?: Date): string[] {
  const base = anchorDate ?? new Date();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
    return localDateStr(d);
  });
}

/** { day: '화', num: '25' } for column header rendering. */
export function formatColumnHeader(dateStr: string): { day: string; num: string } {
  const d = new Date(dateStr + 'T00:00:00');
  return { day: KO_DAYS_SHORT[d.getDay()], num: String(d.getDate()) };
}

/** "5월 25일 – 5월 31일" range string for the top bar. */
export function formatWeekRange(days: string[]): string {
  if (days.length === 0) return '';
  const first = new Date(days[0] + 'T00:00:00');
  const last  = new Date(days[days.length - 1] + 'T00:00:00');
  const fmt   = (d: Date) => `${d.getMonth() + 1}월 ${d.getDate()}일`;
  return `${fmt(first)} – ${fmt(last)}`;
}
