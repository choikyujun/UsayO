import { useMemo } from 'react';
import { Event } from '../types/database';
import { formatRelativeDay } from '../utils/dateHelpers';

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

function formatHHMM(isoStr: string): string {
  const d = new Date(isoStr);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * 오늘 일정 목록과 현재 시각(tick)을 받아 자연어 메시지를 반환.
 * tick 이 매 분 바뀌면 재계산됨.
 * firstUpcoming: 오늘이 비었을 때 D+1~D+5 중 가장 빠른 일정 (optional)
 */
export function useConversationalMessage(
  events:        Event[],
  tick:          string,
  firstUpcoming?: Event,
): ConversationalMessage {
  return useMemo(() => {
    const now   = new Date();
    const nowMs = now.getTime();

    // Exclude user-completed events from "what's next" and active tracking
    const activeEvents   = events.filter(e => !e.completed_at);
    const completedCount = events.filter(e => !!e.completed_at).length;

    const past = activeEvents.filter(e => new Date(e.end_at).getTime() < nowMs);

    const current = activeEvents.find(e =>
      new Date(e.start_at).getTime() <= nowMs &&
      new Date(e.end_at).getTime()   >  nowMs,
    );

    const future = activeEvents
      .filter(e => new Date(e.start_at).getTime() > nowMs)
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
    const next = future[0];

    // 1. 빈 날
    if (events.length === 0) {
      if (firstUpcoming) {
        const dayLabel = formatRelativeDay(new Date(firstUpcoming.start_at));
        const time     = formatHHMM(firstUpcoming.start_at);
        return {
          primary:   '오늘은 비어있어요.',
          secondary: `${dayLabel} 첫 일정은 ${time}, ${firstUpcoming.title}이에요.`,
        };
      }
      return {
        primary:   '오늘은 비어있어요.',
        secondary: '마이크로 새 일정을 더해보세요.',
      };
    }

    // 2. 모두 완료 (time-past + user-marked)
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

    // 5. 일부 완료 (user-marked completed + time-past), 다음 있음
    const totalDone = completedCount + past.length;
    if (totalDone > 0) {
      return {
        primary:   `오늘 일정 ${events.length}개 중 ${totalDone}개 마쳤어요.`,
        secondary: `다음은 ${formatTimeUntil(next.start_at, now)}, ${next.title}이에요.`,
      };
    }

    // 6. 모두 미래
    return {
      primary:   `오늘 일정 ${events.length}개 있어요.`,
      secondary: `다음은 ${formatTimeUntil(next.start_at, now)}, ${next.title}이에요.`,
    };
  }, [events, tick, firstUpcoming]);
}
