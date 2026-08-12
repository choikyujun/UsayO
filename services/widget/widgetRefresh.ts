import { eventsDateRange, fetchExpandedEvents } from '../../utils/fetchExpandedEvents';
import { localDateStr } from '../../utils/timeHelpers';
import { useAuthStore } from '../../stores/useAuthStore';
import { supabase } from '../../lib/supabase';
import { getPendingCompletions, removePendingCompletion, PendingCompletion } from '../../modules/YuSayWidgetBridge';
import { widgetService } from './WidgetService';

// 위젯에서 탭한 완료를 서버로 반영하지 못한 채 큐에 남은 항목의 최대 보관 기간(7일).
// 이 기간 내내 동기화에 실패하면(영구 실패·삭제된 이벤트 등) 폐기해 큐가 무한히 자라지 않게 한다.
const PENDING_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// 위젯 데이터 범위 — 항상 '오늘' 기준(화면 날짜와 분리). 과거 3일 · 오늘 · 앞으로 7일.
// (일/주/월 뷰에서 화면 날짜 범위가 위젯에 새어들어 엉뚱한 날이 쓰이던 문제를 제거)
const WIDGET_PAST_DAYS = 3;
const WIDGET_FUTURE_DAYS = 7;

// 위젯 데이터를 다시 계산해 네이티브로 push하는 단일 공용 함수.
// 모든 뮤테이션 이후 + 앱 시작(인증 완료) + 포그라운드 복귀에서 호출한다.
// 미인증이면 조용히 스킵(위젯에 표시할 데이터 없음).
export async function refreshWidget(caller: string): Promise<void> {
  const userId = useAuthStore.getState().userId;
  if (!userId) return;
  try {
    const todayStr = localDateStr(new Date());
    const { from, to } = eventsDateRange(todayStr, WIDGET_FUTURE_DAYS, WIDGET_PAST_DAYS);
    const { events } = await fetchExpandedEvents(from, to);
    await widgetService.push(events, events, `refreshWidget:${caller}`);
  } catch (e) {
    console.log('[Widget] refreshWidget failed', caller, e instanceof Error ? e.message : String(e));
  }
}

// 옵션 B: 위젯에서 앱 없이 탭한 완료의 대기 큐를 Supabase로 반영한다(앱 실행/포그라운드 시).
// - 성공 또는 0 rows(이벤트 삭제됨) → 큐에서 제거.
// - 네트워크/인증 오류 → 남겨 다음에 재시도. 7일 경과 항목은 폐기.
// 이후 refreshWidget이 서버 진실을 다시 fetch하므로, 미동기 항목은 자동으로 서버 상태로 되돌아간다
// (낙관 표시만 하고 저장 실패한 항목이 '완료'로 남지 않음 = 롤백).
export async function drainPendingCompletions(now: number): Promise<void> {
  const userId = useAuthStore.getState().userId;
  if (!userId) return;
  let queue: PendingCompletion[];
  try {
    const parsed = JSON.parse(await getPendingCompletions());
    queue = Array.isArray(parsed) ? parsed : [];
  } catch {
    return;
  }
  if (queue.length === 0) return;
  console.log(`[Widget] drainPendingCompletions count=${queue.length}`);
  for (const item of queue) {
    if (!item?.id) continue;
    if (now - (item.ts ?? 0) > PENDING_MAX_AGE_MS) {
      console.log(`[Widget] pending 폐기(7일 초과) id=${item.id}`);
      await removePendingCompletion(item.id);
      continue;
    }
    try {
      const { data, error } = await supabase
        .from('events')
        .update({ completed_at: item.done ? new Date(now).toISOString() : null })
        .eq('id', item.id)
        .select('id');
      if (!error) {
        // 성공(data 있음) 또는 0 rows(data 빈 배열 = 이벤트 삭제됨) 모두 큐에서 제거.
        await removePendingCompletion(item.id);
        console.log(`[Widget] pending 반영 id=${item.id} rows=${data?.length ?? 0}`);
      }
    } catch {
      // 네트워크/인증 실패 → 큐 유지, 다음 실행 때 재시도.
    }
  }
}

// 대기 큐 드레인 → 위젯 재계산을 한 번에. 앱 시작(auth-ready)·포그라운드 복귀에서 사용.
export async function syncAndRefreshWidget(caller: string): Promise<void> {
  await drainPendingCompletions(Date.now());
  await refreshWidget(caller);
}
