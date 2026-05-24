import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { teamCalendarService } from '../services/team/TeamCalendarService';
import type { EventRequest, EventRequestInput } from '../types/team';

export function useEventRequests() {
  const [pending, setPending] = useState<EventRequest[]>([]);
  const [sent, setSent] = useState<EventRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, s] = await Promise.all([
        teamCalendarService.getPendingRequests(),
        teamCalendarService.getSentRequests(),
      ]);
      setPending(p);
      setSent(s);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Realtime: incoming requests + status updates
  useEffect(() => {
    channelRef.current = teamCalendarService.subscribeToEventRequests(
      (newReq) => {
        // New request targeted at me
        setPending((prev) => [newReq, ...prev]);
      },
      (updated) => {
        // Status update on sent request
        setSent((prev) => prev.map((r) => r.id === updated.id ? updated : r));
        // Remove from pending if no longer pending
        if (updated.status !== 'pending') {
          setPending((prev) => prev.filter((r) => r.id !== updated.id));
        }
      },
    );

    return () => {
      if (channelRef.current) {
        teamCalendarService.unsubscribe(channelRef.current);
        channelRef.current = null;
      }
    };
  }, []);

  const requestEvent = useCallback(async (input: EventRequestInput) => {
    const req = await teamCalendarService.requestEvent(input);
    setSent((prev) => [req, ...prev]);
    return req;
  }, []);

  const approve = useCallback(async (requestId: string) => {
    const updated = await teamCalendarService.approveRequest(requestId);
    setPending((prev) => prev.filter((r) => r.id !== requestId));
    setSent((prev) => prev.map((r) => r.id === updated.id ? updated : r));
  }, []);

  const reject = useCallback(async (requestId: string) => {
    await teamCalendarService.rejectRequest(requestId);
    setPending((prev) => prev.filter((r) => r.id !== requestId));
  }, []);

  const cancel = useCallback(async (requestId: string) => {
    await teamCalendarService.cancelRequest(requestId);
    setSent((prev) => prev.filter((r) => r.id !== requestId));
  }, []);

  return { pending, sent, loading, requestEvent, approve, reject, cancel, reload: load };
}
