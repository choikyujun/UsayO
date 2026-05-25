import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Event } from '../types/database';
import { localDateStr } from '../utils/timeHelpers';

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
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .gte('start_at', from)
        .lte('start_at', to)
        .is('deleted_at', null)
        .order('start_at', { ascending: true });
      if (!error) setMonthEvents(data ?? []);
    } finally {
      setLoading(false);
    }
  }, [anchorYearMonth]);

  useEffect(() => { load(); }, [load]);

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
