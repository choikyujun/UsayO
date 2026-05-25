import { useMemo } from 'react';
import { Event } from '../types/database';

export interface ConversationalMessage {
  primary:   string;
  secondary: string;
}

function minutesUntil(isoStr: string, now: Date): number {
  return Math.max(0, Math.round((new Date(isoStr).getTime() - now.getTime()) / 60_000));
}

function formatTimeUntil(isoStr: string, now: Date): string {
  const mins = minutesUntil(isoStr, now);
  if (mins < 60) return `${mins}분 후`;
  const hours = Math.floor(mins / 60);
  const rem   = mins % 60;
  return rem === 0 ? `${hours}시간 후` : `${hours}시간 ${rem}분 후`;
}

/**
 * 오늘 일정 목록과 현재 시각(tick)을 받아 자연어 메시지를 반환.
 * tick 이 매 분 바뀌면 재계산됨.
 */
export function useConversationalMessage(
  events: Event[],
  tick:   string,
): ConversationalMessage {
  return useMemo(() => {
    const now   = new Date();
    const nowMs = now.getTime();

    const past = events.filter(e => new Date(e.end_at).getTime() < nowMs);

    const current = events.find(e =>
      new Date(e.start_at).getTime() <= nowMs &&
      new Date(e.end_at).getTime()   >  nowMs,
    );

    const future = events
      .filter(e => new Date(e.start_at).getTime() > nowMs)
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
    const next = future[0];

    // 1. 빈 날
    if (events.length === 0) {
      return {
        primary:   '오늘은 비어있어요.',
        secondary: '마이크로 새 일정을 더해보세요.',
      };
    }

    // 2. 모두 완료
    if (!current && future.length === 0) {
      return {
        primary:   `오늘 일정 ${events.length}개 모두 마쳤어요.`,
        secondary: '수고하셨습니다 👏',
      };
    }

    // 3. 진행 중
    if (current) {
      const rem = minutesUntil(current.end_at, now);
      return {
        primary:   `지금 ${current.title} 진행 중이에요.`,
        secondary: `${rem}분 남았어요.`,
      };
    }

    // 4. 곧 시작 (15분 이내)
    const minToNext = minutesUntil(next.start_at, now);
    if (minToNext <= 15) {
      return {
        primary:   `곧 ${next.title} 시작이에요.`,
        secondary: `${minToNext}분 후`,
      };
    }

    // 5. 일부 완료, 다음 있음
    if (past.length > 0) {
      return {
        primary:   `오늘 일정 ${events.length}개 중 ${past.length}개 마쳤어요.`,
        secondary: `다음은 ${formatTimeUntil(next.start_at, now)}, ${next.title}이에요.`,
      };
    }

    // 6. 모두 미래
    return {
      primary:   `오늘 일정 ${events.length}개 있어요.`,
      secondary: `다음은 ${formatTimeUntil(next.start_at, now)}, ${next.title}이에요.`,
    };
  }, [events, tick]);
}
