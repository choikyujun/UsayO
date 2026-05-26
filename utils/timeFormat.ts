export function formatKoreanTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const month = d.getMonth() + 1;
  const day   = d.getDate();
  const hour  = d.getHours();
  const min   = d.getMinutes();
  const ampm  = hour < 12 ? '오전' : '오후';
  const h12   = hour % 12 || 12;
  const minStr = min > 0 ? ` ${String(min).padStart(2, '0')}분` : '';
  return `${month}월 ${day}일 ${ampm} ${h12}시${minStr}`;
}
