import { useCallback, useEffect, useRef, useState } from 'react';
import { teamCalendarService } from '../services/team/TeamCalendarService';
import type { TeamEvent } from '../types/team';
import type { RealtimeChannel } from '@supabase/supabase-js';

export function useTeamCalendar(teamId: string | null, range: { from: string; to: string }) {
  const [teamEvents, setTeamEvents] = useState<TeamEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const load = useCallback(async () => {
    if (!teamId) { setTeamEvents([]); return; }
    setLoading(true);
    try {
      const events = await teamCalendarService.getTeamEvents(teamId, range);
      setTeamEvents(events);
    } finally {
      setLoading(false);
    }
  }, [teamId, range.from, range.to]);

  // Initial load
  useEffect(() => { load(); }, [load]);

  // Realtime subscription
  useEffect(() => {
    if (!teamId) return;

    channelRef.current = teamCalendarService.subscribeToTeamEvents(
      teamId,
      (newEvent) => {
        // INSERT — add if within range
        if (newEvent.start_at >= range.from && newEvent.start_at <= range.to) {
          setTeamEvents((prev) =>
            [...prev, newEvent].sort((a, b) => a.start_at.localeCompare(b.start_at))
          );
        }
      },
      (updated) => {
        // UPDATE
        setTeamEvents((prev) => prev.map((e) => e.id === updated.id ? updated : e));
      },
      (deletedId) => {
        // DELETE
        setTeamEvents((prev) => prev.filter((e) => e.id !== deletedId));
      },
    );

    return () => {
      if (channelRef.current) {
        teamCalendarService.unsubscribe(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [teamId]);

  const broadcastEvent = useCallback(async (input: Parameters<typeof teamCalendarService.broadcastEvent>[0]) => {
    const event = await teamCalendarService.broadcastEvent(input);
    // Optimistic update — realtime will also fire
    setTeamEvents((prev) =>
      [...prev, event].sort((a, b) => a.start_at.localeCompare(b.start_at))
    );
    return event;
  }, []);

  const deleteTeamEvent = useCallback(async (eventId: string) => {
    await teamCalendarService.deleteTeamEvent(eventId);
    setTeamEvents((prev) => prev.filter((e) => e.id !== eventId));
  }, []);

  return { teamEvents, loading, reload: load, broadcastEvent, deleteTeamEvent };
}
