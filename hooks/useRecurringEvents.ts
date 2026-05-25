import { useMemo } from 'react';
import { Event } from '../types/database';

export function useRecurringEvents(recurringParents: Event[]): Event[] {
  return useMemo(
    () => recurringParents.filter(e => !!e.recurrence_rule && !e.parent_event_id),
    [recurringParents],
  );
}
