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

/**
 * 활동 시간대 규칙: 오전/오후 미명시 1~12시를 09:00~20:00 창으로 유일하게 확정.
 * 9·10·11시만 오전(그대로), 12시=정오, 1~8시는 오후(+12). 되묻지 않는 단일 규칙.
 * 시각 해석의 단일 소스 — LLM 프롬프트와 postProcess가 동일 규칙을 사용한다.
 */
export function activityWindowHour24(hour12: number): number {
  const h = ((hour12 % 12) + 12) % 12 || 12; // 1..12로 정규화(방어적)
  if (h >= 9 && h <= 11) return h;           // 오전 9,10,11
  return (h % 12) + 12;                       // 12→12(정오), 1~8→13~20(오후)
}

/** "오전 9:00", "오후 12:30" — 12시간제 + 오전/오후(24시간제 혼동 제거). 홈 일정 항목 시각 표시용. */
export function formatClockKo(date: Date): string {
  const h = date.getHours();
  const m = date.getMinutes();
  const ampm = h < 12 ? '오전' : '오후';
  const h12 = h % 12 || 12;
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
