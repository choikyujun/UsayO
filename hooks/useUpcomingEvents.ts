import { useMemo } from 'react';
import { Event } from '../types/database';
import { addDays, isSameDay, groupByDate, DateGroup } from '../utils/dateHelpers';

// Returns events for D+1 through D+5 grouped by date, sorted ascending.
export function useUpcomingEvents(
  allEvents: Event[],
  today?: Date,
): DateGroup<Event>[] {
  const ref = today ?? new Date();
  // 날짜(일) 단위 키 — 기존 기본값 new Date()가 매 렌더 새 객체라 useMemo를 무효화하던 문제 해결.
  // 같은 날엔 dayKey가 동일 → 메모 유지(자정 넘어가면 자동 갱신).
  const dayKey = `${ref.getFullYear()}-${ref.getMonth()}-${ref.getDate()}`;
  return useMemo(() => {
    const [y, m, d] = dayKey.split('-').map(Number);
    const todayStart = new Date(y, m, d);
    const d1 = addDays(todayStart, 1);
    const d5 = addDays(todayStart, 5);

    const upcoming = allEvents.filter(ev => {
      // Exclude recurring parent templates (is_recurring=true) — these are abstract rules, not real events.
      // Keep expanded instances (parent_event_id set, is_recurring=false) — they ARE real occurrences.
      if (ev.is_recurring) return false;
      const start = new Date(ev.start_at);
      return start >= d1 && start <= addDays(d5, 1);
    }).sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());

    return groupByDate(upcoming).filter(
      g => g.date >= d1 && g.date <= addDays(d5, 1),
    );
  }, [allEvents, dayKey]);
}
