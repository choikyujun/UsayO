import { Event } from '../types/database';

// ── 알림 시점 옵션 정의 ─────────────────────────────────────────────

export interface NotifOption {
  label: string;
  offsetMinutes: number | null; // null = 알림 없음
}

export const TIMED_NOTIF_OPTIONS: NotifOption[] = [
  { label: '알림 없음',  offsetMinutes: null },
  { label: '시작 시',    offsetMinutes: 0    },
  { label: '5분 전',     offsetMinutes: 5    },
  { label: '10분 전',    offsetMinutes: 10   },
  { label: '15분 전',    offsetMinutes: 15   },
  { label: '30분 전',    offsetMinutes: 30   },
  { label: '1시간 전',   offsetMinutes: 60   },
  { label: '2시간 전',   offsetMinutes: 120  },
  { label: '1일 전',     offsetMinutes: 1440 },
  { label: '2일 전',     offsetMinutes: 2880 },
  { label: '1주 전',     offsetMinutes: 10080 },
];

// 종일 일정 전용 옵션: offsetMinutes = 알림 시각을 분 단위 음이 아닌 숫자로 인코딩
// 인코딩 규칙: 전날 = 음수 불가 → 실제 트리거 시각 계산은 calcAllDayNotifDate() 사용
// offsetMinutes 의미 = "일정 시작 당일 00:00(로컬) 기준 몇 분 후" (전날은 -N이 아니라 별도 계산)
// 사양에서 "음수 X" → 전날 옵션은 특수 인코딩: 전날 9AM = -1일 + 9시 = 전날 00:00 + 540분
// 단, DB 에는 음수 금지 → 종일 전날 옵션을 양수로 매핑:
//   당일 9AM   = 540   (당일 09:00)
//   당일 12PM  = 720   (당일 12:00)
//   전날 9AM   = 99540 (전날 offset 식별자: 99*1000+540)
//   전날 6PM   = 99_1080 → 99*1000+1080
//   1주 전     = 10080 (공통)
// 복잡하므로 단순하게: is_all_day 플래그 + offsetMinutes 조합을 calcNotifDate 에서 처리.
// 종일 전날 옵션은 부호 없이 구분하기 위해 99xxx 네임스페이스 사용.

export const ALLDAY_NOTIF_OPTIONS: NotifOption[] = [
  { label: '알림 없음',  offsetMinutes: null  },
  { label: '당일 9AM',   offsetMinutes: 540   },  // 당일 09:00
  { label: '당일 12PM',  offsetMinutes: 720   },  // 당일 12:00
  { label: '전날 9AM',   offsetMinutes: 99540 },  // sentinel: 전날 09:00
  { label: '전날 6PM',   offsetMinutes: 991080},  // sentinel: 전날 18:00
  { label: '1주 전',     offsetMinutes: 10080 },  // 종일 기준 7일 전 09:00
];

// sentinel 값 여부 판별
export function isAllDayPrevDay(offset: number): boolean {
  return offset >= 99000 && offset < 999999;
}

// ── 알림 트리거 날짜 계산 ─────────────────────────────────────────────

/**
 * 일정 + offset → 실제 알림 발화 시각(Date) 반환.
 * null 반환 = 알림 없음 or 이미 지난 시각.
 */
export function calcNotifDate(event: Event): Date | null {
  const offset = event.notification_offset_minutes;
  if (offset === null || offset === undefined) return null;

  const startAt = new Date(event.start_at);

  let triggerDate: Date;

  if (event.is_all_day) {
    // 종일 일정: start_at 당일 자정(로컬) 기준으로 계산
    const dayLocal = new Date(startAt.getFullYear(), startAt.getMonth(), startAt.getDate());

    if (isAllDayPrevDay(offset)) {
      // sentinel: 전날 기준
      const prevDay = new Date(dayLocal);
      prevDay.setDate(prevDay.getDate() - 1);
      const minutesInDay = offset - (isAllDayPrevDay(offset) ? 99000 : 0);
      // sentinel 99540 → minutesInDay = 540
      // sentinel 991080 → minutesInDay = 1080
      const mins = offset >= 991000 ? offset - 991000 : offset - 99000;
      prevDay.setMinutes(prevDay.getMinutes() + mins);
      triggerDate = prevDay;
    } else if (offset === 10080) {
      // 1주 전 09:00
      const weekBefore = new Date(dayLocal);
      weekBefore.setDate(weekBefore.getDate() - 7);
      weekBefore.setHours(9, 0, 0, 0);
      triggerDate = weekBefore;
    } else {
      // 당일 00:00 + N분
      triggerDate = new Date(dayLocal.getTime() + offset * 60 * 1000);
    }
  } else {
    // 시간 일정: start_at 에서 N분 빼기
    triggerDate = new Date(startAt.getTime() - offset * 60 * 1000);
  }

  // 이미 지난 시각이면 null
  if (triggerDate <= new Date()) return null;
  return triggerDate;
}

/**
 * offsetMinutes → 사용자 표시 레이블.
 */
export function offsetToLabel(offset: number | null, isAllDay: boolean): string {
  const options = isAllDay ? ALLDAY_NOTIF_OPTIONS : TIMED_NOTIF_OPTIONS;
  return options.find(o => o.offsetMinutes === offset)?.label ?? '알림 없음';
}

/**
 * 이벤트의 default notification_offset_minutes 반환.
 * 글로벌 디폴트 (Settings) = before_60 토글 여부에 따라 60 or null.
 * 단순화: 항상 60 (시간 일정) / 540 (종일) 로 고정.
 * Settings 연동은 useNotificationDefaults 훅에서 처리.
 */
export function defaultOffset(isAllDay: boolean): number {
  return isAllDay ? 540 : 60;
}

/**
 * 알림 body 텍스트 생성.
 */
export function buildNotifBody(event: Event): string {
  const offset = event.notification_offset_minutes;
  if (offset === null || offset === undefined) return event.title;

  if (event.is_all_day) {
    return `${event.title} — 오늘 종일 일정`;
  }

  if (offset === 0) return `${event.title} — 지금 시작해요`;
  if (offset < 60)  return `${event.title} — ${offset}분 후 시작`;
  if (offset === 60)  return `${event.title} — 1시간 후 시작`;
  if (offset === 120) return `${event.title} — 2시간 후 시작`;
  if (offset >= 1440) return `${event.title} — ${Math.round(offset / 1440)}일 후 시작`;
  return `${event.title} — ${Math.round(offset / 60)}시간 후 시작`;
}
