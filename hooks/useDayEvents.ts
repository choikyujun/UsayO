import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Event } from '../types/database';
import { expandRecurringEvent, EventException } from '../utils/recurrenceHelpers';

// Uses LOCAL-time day boundaries so UTC offset doesn't cut off midnight events.
function dayBounds(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const from = new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
  const to   = new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
  return { from, to };
}

export function useDayEvents(dateStr: string) {
  const [events,  setEvents]  = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { from, to } = dayBounds(dateStr);
      const fromDate = new Date(from);
      const toDate   = new Date(to);

      // 1. Events that start within this day
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .gte('start_at', from)
        .lte('start_at', to)
        .is('deleted_at', null)
        .order('start_at', { ascending: true });

      if (error) return;

      // 2. Recurring parents that started before this day
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

      // 3. Exceptions
      let exceptions: EventException[] = [];
      if (allParents.length > 0) {
        try {
          const { data: exData, error: exError } = await supabase
            .from('event_exceptions')
            .select('*')
            .in('parent_id', allParents.map(p => p.id));
          if (!exError) exceptions = (exData ?? []) as EventException[];
        } catch {
          // event_exceptions table not yet migrated — skip silently
        }
      }

      // 4. Expand recurring instances for this single day
      const instances = allParents.flatMap(p =>
        expandRecurringEvent(p, fromDate, toDate, exceptions),
      );

      // 5. Merge one-time + instances, sorted by start
      const oneTime = (data ?? []).filter(e => !e.is_recurring);
      const merged  = [...oneTime, ...instances].sort(
        (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime(),
      );

      setEvents(merged);
    } catch {
      // unauthenticated — show empty
    } finally {
      setLoading(false);
    }
  }, [dateStr]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') load();
    });
    return () => subscription.unsubscribe();
  }, [load]);

  return { events, loading, reload: load };
}
