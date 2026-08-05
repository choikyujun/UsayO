import { eventsDateRange, fetchExpandedEvents } from '../../utils/fetchExpandedEvents';
import { localDateStr } from '../../utils/timeHelpers';
import { useAuthStore } from '../../stores/useAuthStore';
import { widgetService } from './WidgetService';

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
