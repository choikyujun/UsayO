import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Event } from '../types/database';

function localDayBounds(dateStr: string): { from: string; to: string } {
  // Use local-timezone midnight so KST users get the correct day boundary
  const from = new Date(`${dateStr}T00:00:00`).toISOString();
  const to   = new Date(`${dateStr}T23:59:59.999`).toISOString();
  return { from, to };
}

export function useCalendarEvents(startDate: string, endDate: string) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!startDate || !endDate) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { from } = localDayBounds(startDate);
      const { to }   = localDayBounds(endDate);

      const { data, error } = await supabase
        .from('events')
        .select('*')
        .gte('start_at', from)
        .lte('start_at', to)
        .is('deleted_at', null)
        .order('start_at', { ascending: true });

      if (error) {
        console.error('[CalendarEvents] fetch error:', error.message);
        return; // keep existing events on error
      }
      setEvents(data ?? []);
    } catch (e) {
      console.error('[CalendarEvents] unexpected error:', e);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => { load(); }, [load]);

  return { events, loading, reload: load };
}
