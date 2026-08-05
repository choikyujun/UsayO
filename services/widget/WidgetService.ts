import { clearWidget, updateWidget, widgetBridgePresent, WidgetData, WidgetEvent, WidgetRow } from '../../modules/YuSayWidgetBridge';
import { localDateStr } from '../../utils/timeHelpers';

type PushEvent = { id: string; title: string; start_at: string; color_tag?: string; category?: string | null; completed_at?: string | null };

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// 과거 3일 · 오늘 · 앞으로 7일을 날짜별로 그룹핑한 플랫 row 배열을 만든다.
// 오늘 그룹에는 현재 시각 선을 과거/예정 사이에 끼운다. 일정 없는 날도 헤더 + "일정 없음".
function buildRows(events: PushEvent[], now: Date): WidgetRow[] {
  const rows: WidgetRow[] = [];
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
    rows.push({ type: 'day', label, isToday });

    const dayEvents = (byDate.get(dateStr) ?? []).slice().sort(
      (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime(),
    );

    const toRow = (e: PushEvent): WidgetRow => {
      const start = new Date(e.start_at);
      return {
        type: 'event',
        id: e.id,
        time: hhmm(start),
        title: e.title,
        category: e.category ?? 'work',
        completed: !!e.completed_at,
        past: start.getTime() < nowMs,
      };
    };

    if (isToday) {
      // 예정(첫 미래 일정) 앞에 현재 시각 선을 끼운다.
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
    } else {
      if (dayEvents.length === 0) rows.push({ type: 'empty' });
      else dayEvents.forEach(e => rows.push(toRow(e)));
    }
  }
  return rows;
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

    const data: WidgetData = {
      // iOS 하위호환 필드
      nextEvent: upcoming[0] ? toWidgetEvent(upcoming[0]) : null,
      todayEvents: upcoming.slice(0, 3).map(toWidgetEvent),
      todayRemainingCount: upcoming.length,
      // Android 컬렉션 위젯
      rows: buildRows(events, now),
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
