import { useMemo } from 'react';
import { Event } from '../types/database';
import { addDays, isSameDay, groupByDate, DateGroup } from '../utils/dateHelpers';

// Returns events for D+1 through D+5 grouped by date, sorted ascending.
export function useUpcomingEvents(
  allEvents: Event[],
  today = new Date(),
): DateGroup<Event>[] {
  return useMemo(() => {
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const d1 = addDays(todayStart, 1);
    const d5 = addDays(todayStart, 5);

    const upcoming = allEvents.filter(ev => {
      if (ev.is_recurring || ev.parent_event_id) return false;
      const start = new Date(ev.start_at);
      return start >= d1 && start <= addDays(d5, 1);
    }).sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());

    return groupByDate(upcoming).filter(
      g => g.date >= d1 && g.date <= addDays(d5, 1),
    );
  }, [allEvents, today]);
}
