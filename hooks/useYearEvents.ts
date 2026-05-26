import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export function useYearEvents(year: number) {
  const [eventDates, setEventDates] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const from = `${year}-01-01T00:00:00.000`;
      const to   = `${year}-12-31T23:59:59.999`;

      const { data } = await supabase
        .from('events')
        .select('start_at, is_recurring, recurrence_rule')
        .gte('start_at', from)
        .lte('start_at', to)
        .is('deleted_at', null);

      const dates = new Set((data ?? []).map(e =>
        e.start_at.split('T')[0],
      ));
      setEventDates(dates);
    } catch {
      // unauthenticated or network — show no dots
    }
  }, [year]);

  useEffect(() => { load(); }, [load]);

  return { eventDates, reload: load };
}
