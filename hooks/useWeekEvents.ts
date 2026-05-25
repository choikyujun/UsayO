import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Event } from '../types/database';
import { EventException, expandRecurringEvent } from '../utils/recurrenceHelpers';
import { localDateStr } from '../utils/timeHelpers';

function weekBounds(days: string[]) {
  const first = days[0];
  const last  = days[days.length - 1];
  const [y1, m1, d1] = first.split('-').map(Number);
  const [y2, m2, d2] = last.split('-').map(Number);
  const from = new Date(y1, m1 - 1, d1, 0, 0, 0, 0).toISOString();
  const to   = new Date(y2, m2 - 1, d2, 23, 59, 59, 999).toISOString();
  return { from, to };
}

export function useWeekEvents(days: string[]) {
  const [eventsByDate, setEventsByDate] = useState<Record<string, Event[]>>({});
  const [loading, setLoading] = useState(true);

  const daysKey = days.join(',');

  const load = useCallback(async () => {
    if (days.length === 0) return;
    setLoading(true);
    try {
      const { from, to } = weekBounds(days);
      const fromDate = new Date(from);
      const toDate   = new Date(to);

      const { data, error } = await supabase
        .from('events')
        .select('*')
        .gte('start_at', from)
        .lte('start_at', to)
        .is('deleted_at', null)
        .order('start_at', { ascending: true });

      if (error) return;

      const { data: earlyParents } = await supabase
        .from('events')
        .select('*')
        .eq('is_recurring', true)
        .lt('start_at', from)
        .is('deleted_at', null);

      const allParents = [
        ...((data ?? []).filter(e => e.is_recurring && !e.parent_event_id)),
        ...(earlyParents ?? []),
      ];

      let exceptions: EventException[] = [];
      if (allParents.length > 0) {
        try {
          const { data: exData, error: exError } = await supabase
            .from('event_exceptions')
            .select('*')
            .in('parent_id', allParents.map(p => p.id));
          if (!exError) exceptions = (exData ?? []) as EventException[];
        } catch {
          // event_exceptions not yet migrated
        }
      }

      const instances = allParents.flatMap(p =>
        expandRecurringEvent(p, fromDate, toDate, exceptions),
      );

      const oneTime = (data ?? []).filter(e => !e.is_recurring);
      const all     = [...oneTime, ...instances].sort(
        (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime(),
      );

      const byDate: Record<string, Event[]> = {};
      for (const dateStr of days) byDate[dateStr] = [];
      for (const ev of all) {
        const ds = localDateStr(new Date(ev.start_at));
        if (byDate[ds]) byDate[ds].push(ev);
      }

      setEventsByDate(byDate);
    } catch {
      // unauthenticated — show empty
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daysKey]);

  useEffect(() => { load(); }, [load]);

  return { eventsByDate, loading, reload: load };
}
