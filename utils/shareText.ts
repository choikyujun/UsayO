import { Event } from '../types/database';
import { formatTimeKo } from './timeHelpers';

// 공유 텍스트 시각 표기는 위젯·홈과 동일(오전/오후): formatTimeKo = "오후 3시" / "오후 3:30".
const KO_DAYS_SHORT = ['일', '월', '화', '수', '목', '금', '토'];
const KO_DAYS_FULL = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

function dateShort(d: Date): string {
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${KO_DAYS_SHORT[d.getDay()]}`;
}
function dateFull(d: Date): string {
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${KO_DAYS_FULL[d.getDay()]}`;
}

// "제목 (장소)" — 장소 없으면 괄호 생략.
function titleWithLocation(e: Event): string {
  return e.location ? `${e.title} (${e.location})` : e.title;
}

// 일정 하나: "8월 13일 목 오후 3시 팀 회의 (회의실 A)"
export function buildOneEventShare(e: Event): string {
  const start = new Date(e.start_at);
  return `${dateShort(start)} ${formatTimeKo(start)} ${titleWithLocation(e)}`;
}

// 하루치: 첫 줄 "8월 13일 목요일", 아래 각 일정 "오후 3시 팀 회의 (회의실 A)" 줄바꿈 나열.
export function buildDayShare(events: Event[], date: Date): string {
  const lines = [...events]
    .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
    .map(e => `${formatTimeKo(new Date(e.start_at))} ${titleWithLocation(e)}`);
  return [dateFull(date), ...lines].join('\n');
}
