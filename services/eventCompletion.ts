import { supabase } from '../lib/supabase';
import { Event } from '../types/database';
import { cancelEventNotification, scheduleEventNotification } from './notifications';

// ── 완료 / 완료취소 단일 진입점 ────────────────────────────────────
//
// 왜 서비스 계층인가:
// 완료 처리 진입점은 네 곳이고 그중 하나(위젯 드레인)는 React 훅 밖에서 돈다.
//   · 음성 COMPLETE            hooks/useSchedules.ts
//   · toggleEventComplete      hooks/useSchedules.ts (홈 타임스파인 / 홈 Upcoming 공유)
//   · 일간뷰 스와이프          screens/DayViewScreen.tsx
//   · 위젯 완료 큐 드레인      services/widget/widgetRefresh.ts
// 훅 안에 두면 위젯 드레인이 훅을 부를 수 없어 다시 supabase를 직접 호출하게 되고,
// 그것이 정확히 이번 버그의 형태였다(일간뷰가 toggleEventComplete를 우회해 직접 update →
// 알림 취소 누락). 그래서 "DB 갱신 + 알림 처리"를 훅 의존성이 없는 이 함수 하나로 모으고
// 네 진입점이 전부 여기를 거치게 한다. 낙관적 UI 갱신만 각 호출부에 남긴다.
//
// 알림 처리는 fire-and-forget이다 — 실패해도 완료 저장은 유지한다. 대신 결과를 로그로 남긴다.

export interface CompletionResult {
  /** DB 갱신이 오류 없이 끝났는가. 대상 행이 0개여도(이미 삭제됨) true다. */
  ok: boolean;
  /** 실제로 갱신된 행 수. 0 = 대상 없음(삭제된 이벤트 등). */
  rows: number;
  /** 갱신된 행. rows가 0이면 null. */
  event: Event | null;
  error?: string;
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * 완료(completed=true) / 완료취소(completed=false)를 처리한다.
 *
 * 완료는 레코드를 지우지 않고 completed_at 플래그만 바꾼다. 예약된 로컬 알림은 OS 큐에
 * 독립적으로 남아 있으므로 **반드시 별도로 취소해야 한다** — 그 호출이 여기 있다.
 * 완료취소는 반대로 재예약한다(_doSchedule의 completed_at 가드가 자연히 풀린다).
 *
 * @param caller 로그 식별자. 어느 진입점에서 왔는지 실기 로그에서 구분하기 위한 값.
 * @param atIso  completed=true일 때 기록할 시각. 미지정 시 현재 시각.
 *               (위젯 드레인은 큐에 쌓인 시점이 아니라 드레인 시각을 쓰던 기존 동작을 유지한다.)
 */
export async function setEventCompletion(args: {
  eventId: string;
  completed: boolean;
  caller: string;
  atIso?: string;
}): Promise<CompletionResult> {
  const { eventId, completed, caller } = args;
  const completedAt = completed ? (args.atIso ?? new Date().toISOString()) : null;

  const { data, error } = await supabase
    .from('events')
    .update({ completed_at: completedAt, updated_at: new Date().toISOString() })
    .eq('id', eventId)
    .select('*');

  if (error) {
    console.log(`[Complete] DB 실패 caller=${caller} id=${eventId} completed=${completed} error=${error.message}`);
    return { ok: false, rows: 0, event: null, error: error.message };
  }

  const rows = data?.length ?? 0;
  const event = rows > 0 ? (data![0] as Event) : null;
  console.log(`[Complete] caller=${caller} id=${eventId} completed=${completed} rows=${rows}`);

  applyCompletionToNotification(eventId, completed, event, caller);

  return { ok: true, rows, event };
}

// 알림 반영 — 결과를 기다리지 않는다(fire-and-forget). 성공/실패는 로그로만 구분한다.
function applyCompletionToNotification(
  eventId: string,
  completed: boolean,
  event: Event | null,
  caller: string,
): void {
  if (completed) {
    cancelEventNotification(eventId)
      .then(r => console.log(
        `[Complete] 알림 취소 caller=${caller} id=${eventId}` +
        ` ok=${r.ok} targets=${r.targets} cancelled=${r.cancelled} failed=${r.failed}`,
      ))
      .catch(e => console.log(`[Complete] 알림 취소 예외 caller=${caller} id=${eventId}:`, errText(e)));
    return;
  }

  // 완료취소인데 갱신된 행이 없다 = 되살릴 일정 자체가 없다.
  if (!event) {
    console.log(`[Complete] 알림 재예약 생략(대상 행 없음) caller=${caller} id=${eventId}`);
    return;
  }

  scheduleEventNotification(event)
    .then(id => console.log(
      `[Complete] 알림 재예약 caller=${caller} id=${eventId} notifId=${id ?? 'none'}`,
    ))
    .catch(e => console.log(`[Complete] 알림 재예약 예외 caller=${caller} id=${eventId}:`, errText(e)));
}
