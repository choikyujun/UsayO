import { clearWidget, updateWidget, widgetBridgePresent, WidgetData, WidgetEvent, WidgetRow } from '../../modules/YuSayWidgetBridge';
import { localDateStr } from '../../utils/timeHelpers';
import { isVirtualInstance } from '../../utils/recurrenceHelpers';

type PushEvent = { id: string; title: string; start_at: string; color_tag?: string; category?: string | null; completed_at?: string | null; location?: string | null };

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

// 현재 시각 선용(24h). 목업의 빨간 "15:42"와 동일.
function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// 항목 시각 표기 — 앱 홈 형식에 맞춘 "오전 9:00" / "오후 12:30"(12시간 + 오전/오후).
function ampmTime(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${String(m).padStart(2, '0')}`;
}

// 과거 3일 · 오늘 · 앞으로 7일을 날짜별로 그룹핑한 플랫 row 배열을 만든다.
// 오늘 그룹에는 현재 시각 선을 과거/예정 사이에 끼운다. 일정 없는 날도 헤더 + "일정 없음".
// todayIndex = 오늘 day 헤더 row의 인덱스(위젯 최초 스크롤 위치).
function buildRows(events: PushEvent[], now: Date): { rows: WidgetRow[]; todayIndex: number } {
  const rows: WidgetRow[] = [];
  let todayIndex = 0;
  const todayStr = localDateStr(now);
  const nowMs = now.getTime();
  const nowLabel = hhmm(now);

  const byDate = new Map<string, PushEvent[]>();
  for (const e of events) {
    const key = localDateStr(new Date(e.start_at));
    (byDate.get(key) ?? byDate.set(key, []).get(key)!).push(e);
  }

  for (let offset = -3; offset <= 7; offset++) {
    const d = new Date(now);
    d.setDate(d.getDate() + offset);
    const dateStr = localDateStr(d);
    const isToday = offset === 0;
    const label = isToday
      ? `오늘 · ${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEKDAYS[d.getDay()]}`
      : `${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEKDAYS[d.getDay()]}`;
    if (isToday) todayIndex = rows.length; // 오늘 day 헤더의 인덱스(최초 스크롤 목표)
    rows.push({ type: 'day', label, isToday });

    const dayEvents = (byDate.get(dateStr) ?? []).slice().sort(
      (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime(),
    );

    const toRow = (e: PushEvent): WidgetRow => {
      const start = new Date(e.start_at);
      return {
        type: 'event',
        id: e.id,
        time: ampmTime(start),
        title: e.title,
        location: e.location ?? '',
        category: e.category ?? 'work',
        completed: !!e.completed_at,
        past: start.getTime() < nowMs,
        // 반복(가상 인스턴스)은 completed_at 단일 모델로 완료 반영이 안 되므로 위젯에서 완료 원을
        // 비활성 처리(옵션 B에서 서버 미반영 상태가 남는 것을 방지).
        recurring: isVirtualInstance(e.id),
      };
    };

    if (isToday) {
      // 오늘은 일정이 없어도 헤더 + 현재 시각 선 + "오늘 일정 없음"을 유지(현재 위치를 잃지 않게).
      // (day 헤더는 위에서 이미 push됨)
      let nowInserted = false;
      for (const e of dayEvents) {
        if (!nowInserted && new Date(e.start_at).getTime() >= nowMs) {
          rows.push({ type: 'now', time: nowLabel });
          nowInserted = true;
        }
        rows.push(toRow(e));
      }
      if (!nowInserted) rows.push({ type: 'now', time: nowLabel }); // 남은 예정 없으면 맨 끝
      if (dayEvents.length === 0) rows.push({ type: 'empty' });
    } else if (dayEvents.length > 0) {
      // 5-A: 일정 있는 날만 표시. 빈 날은 day 헤더도 넣지 않는다(아래에서 되돌림).
      dayEvents.forEach(e => rows.push(toRow(e)));
    } else {
      // 빈 날(과거·미래) → 방금 push한 day 헤더를 제거해 아무것도 표시하지 않는다.
      rows.pop();
    }
  }
  return { rows, todayIndex };
}

export class WidgetService {
  async push(
    events: PushEvent[],
    allTodayEvents: PushEvent[],
    caller = 'unknown',
  ): Promise<void> {
    const now = new Date();
    const upcoming = events
      .filter(e => new Date(e.start_at) >= now)
      .sort((a, b) => a.start_at.localeCompare(b.start_at));

    const toWidgetEvent = (e: PushEvent): WidgetEvent => ({
      id: e.id,
      title: e.title,
      startAt: e.start_at,
      colorTag: e.color_tag,
    });

    const built = buildRows(events, now);
    const data: WidgetData = {
      // iOS 하위호환 필드
      nextEvent: upcoming[0] ? toWidgetEvent(upcoming[0]) : null,
      todayEvents: upcoming.slice(0, 3).map(toWidgetEvent),
      todayRemainingCount: upcoming.length,
      // Android 컬렉션 위젯
      rows: built.rows,
      todayIndex: built.todayIndex,
      nowLabel: hhmm(now),
      updatedAt: now.toISOString(),
    };

    // [진단] 어느 경로(caller)에서 push가 도는지 + 모듈 존재/이벤트 수/데이터 범위.
    const sorted = [...events].sort((a, b) => a.start_at.localeCompare(b.start_at));
    const range = sorted.length ? `${sorted[0].start_at}~${sorted[sorted.length - 1].start_at}` : 'empty';
    console.log(`[Widget] push → modulePresent=${widgetBridgePresent} events=${events.length} rows=${data.rows.length} range=${range} caller=${caller}`);

    await updateWidget(data);
  }

  async clear(): Promise<void> {
    await clearWidget();
  }
}

export const widgetService = new WidgetService();
