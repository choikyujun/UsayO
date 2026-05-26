import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Event } from '../types/database';
import { localDateStr } from '../utils/timeHelpers';
import { expandRecurringEvent, EventException } from '../utils/recurrenceHelpers';

// anchorYearMonth = "YYYY-MM"
function monthBounds(anchorYearMonth: string) {
  const [y, m] = anchorYearMonth.split('-').map(Number);
  const from = new Date(y, m - 1, 1).toISOString();
  const to   = new Date(y, m, 0, 23, 59, 59, 999).toISOString(); // last day
  return { from, to };
}

export function useEventsForDate(selectedDate: string, anchorYearMonth: string) {
  const [monthEvents, setMonthEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { from, to } = monthBounds(anchorYearMonth);
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

      // 반복 부모 (월 이전 시작)
      const { data: recurringParents } = await supabase
        .from('events')
        .select('*')
        .eq('is_recurring', true)
        .lt('start_at', from)
        .is('deleted_at', null);

      const allParents = [
        ...((data ?? []).filter(e => e.is_recurring && !e.parent_event_id)),
        ...(recurringParents ?? []),
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
          // event_exceptions 테이블 미존재 → 스킵
        }
      }

      const instances = allParents.flatMap(p =>
        expandRecurringEvent(p, fromDate, toDate, exceptions),
      );

      const oneTime = (data ?? []).filter(e => !e.is_recurring);
      const merged = [...oneTime, ...instances].sort(
        (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime(),
      );

      setMonthEvents(merged);
    } finally {
      setLoading(false);
    }
  }, [anchorYearMonth]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        load();
      }
    });
    return () => subscription.unsubscribe();
  }, [load]);


  // Events for the selected day only (filtered from the already-loaded month)
  const events = useMemo(
    () => monthEvents.filter(e => localDateStr(new Date(e.start_at)) === selectedDate),
    [monthEvents, selectedDate],
  );

  // Count per day for calendar dots
  const monthCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of monthEvents) {
      const key = localDateStr(new Date(e.start_at));
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [monthEvents]);

  function patchEvent(eventId: string, updates: Partial<Event>) {
    setMonthEvents(prev => prev.map(e => e.id === eventId ? { ...e, ...updates } : e));
  }

  return { events, loading, monthCounts, reload: load, patchEvent };
}
