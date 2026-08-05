import { supabase } from '../lib/supabase';
import { Event } from '../types/database';
import { expandRecurringEvent, EventException } from './recurrenceHelpers';

// [fromDateStr(YYYY-MM-DD) 기준] daysAhead일 뒤까지의 UTC 범위. daysBefore로 과거도 포함.
export function eventsDateRange(fromDateStr: string, daysAhead: number, daysBefore = 0) {
  const start = new Date(fromDateStr + 'T00:00:00.000Z');
  start.setUTCDate(start.getUTCDate() - daysBefore);
  const end = new Date(fromDateStr + 'T00:00:00.000Z');
  end.setUTCDate(end.getUTCDate() + daysAhead);
  return {
    from: `${start.toISOString().split('T')[0]}T00:00:00.000Z`,
    to: `${end.toISOString().split('T')[0]}T23:59:59.999Z`,
  };
}

// [from, to] ISO 범위의 이벤트를 반복 확장까지 포함해 반환(시작시각 오름차순 정렬).
// useSchedules.load와 widgetRefresh가 공유한다 — 반복 확장 로직 중복 제거.
// user_id 필터는 두지 않는다: Supabase RLS가 인증 세션의 본인 행만 반환.
export async function fetchExpandedEvents(
  from: string,
  to: string,
): Promise<{ events: Event[]; parents: Event[] }> {
  const fromDate = new Date(from);
  const toDate = new Date(to);

  // 1. 비반복 일정 + 범위 내 시작하는 반복 부모
  const { data: eventData, error: fetchError } = await supabase
    .from('events')
    .select('*')
    .gte('start_at', from)
    .lte('start_at', to)
    .is('deleted_at', null)
    .order('start_at', { ascending: true });
  if (fetchError) throw fetchError;

  // 2. 범위 밖에서 시작된 반복 부모 별도 fetch
  const { data: earlyParents } = await supabase
    .from('events')
    .select('*')
    .eq('is_recurring', true)
    .lt('start_at', from)
    .is('deleted_at', null);

  const allParents = [
    ...((eventData ?? []).filter(e => e.is_recurring && !e.parent_event_id)),
    ...(earlyParents ?? []),
  ];

  // 3. exception 목록 fetch — 마이그레이션 미적용 시 조용히 스킵
  const parentIds = allParents.map(p => p.id);
  let exceptions: EventException[] = [];
  if (parentIds.length > 0) {
    try {
      const { data: exData, error: exError } = await supabase
        .from('event_exceptions')
        .select('*')
        .in('parent_id', parentIds);
      if (!exError) exceptions = (exData ?? []) as EventException[];
    } catch {
      // event_exceptions 테이블 미존재 → 예외 없이 계속
    }
  }

  // 4. 반복 인스턴스 확장 → 5. 비반복과 합산·정렬
  const instances = allParents.flatMap(p =>
    expandRecurringEvent(p, fromDate, toDate, exceptions),
  );
  const oneTime = (eventData ?? []).filter(e => !e.is_recurring);
  const events = [...oneTime, ...instances].sort(
    (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime(),
  );

  return { events, parents: allParents };
}
