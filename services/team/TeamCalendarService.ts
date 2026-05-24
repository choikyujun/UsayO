import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import type { EventRequest, TeamEvent } from '../../types/team';
import type { EventRequestInput, TeamEventInput } from '../../types/team';

export class TeamCalendarService {

  // ── 이벤트 요청 (Cross-user) ──────────────────────────────────────

  async requestEvent(input: EventRequestInput): Promise<EventRequest> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('로그인이 필요합니다.');

    const { data, error } = await supabase
      .from('event_requests')
      .insert({
        team_id: input.teamId ?? null,
        requester_id: user.id,
        target_user_id: input.targetUserId,
        title: input.title,
        start_at: input.startAt,
        end_at: input.endAt,
        location: input.location ?? null,
        note: input.note ?? null,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async approveRequest(requestId: string): Promise<EventRequest> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('로그인이 필요합니다.');

    // Fetch request
    const { data: req } = await supabase
      .from('event_requests')
      .select('*')
      .eq('id', requestId)
      .single();
    if (!req) throw new Error('요청을 찾을 수 없어요.');

    // Create event on target user's calendar
    const endAt = req.end_at ?? new Date(new Date(req.start_at).getTime() + 3_600_000).toISOString();
    const { data: event, error: insertErr } = await supabase
      .from('events')
      .insert({
        user_id: user.id,
        team_id: req.team_id,
        title: req.title,
        start_at: req.start_at,
        end_at: endAt,
        location: req.location,
        created_via: 'manual' as const,
      })
      .select()
      .single();
    if (insertErr) throw insertErr;

    // Also create event on requester's calendar
    await supabase.from('events').insert({
      user_id: req.requester_id,
      team_id: req.team_id,
      title: req.title,
      start_at: req.start_at,
      end_at: endAt,
      location: req.location,
      created_via: 'manual' as const,
    });

    // Update request status
    const { data: updated, error: updErr } = await supabase
      .from('event_requests')
      .update({
        status: 'approved',
        event_id: event.id,
        responded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId)
      .select()
      .single();

    if (updErr) throw updErr;
    return updated;
  }

  async rejectRequest(requestId: string): Promise<void> {
    const { error } = await supabase
      .from('event_requests')
      .update({
        status: 'rejected',
        responded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId);
    if (error) throw error;
  }

  async cancelRequest(requestId: string): Promise<void> {
    const { error } = await supabase
      .from('event_requests')
      .delete()
      .eq('id', requestId);
    if (error) throw error;
  }

  async getPendingRequests(): Promise<EventRequest[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data } = await supabase
      .from('event_requests')
      .select('*')
      .eq('target_user_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    return data ?? [];
  }

  async getSentRequests(): Promise<EventRequest[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data } = await supabase
      .from('event_requests')
      .select('*')
      .eq('requester_id', user.id)
      .order('created_at', { ascending: false });

    return data ?? [];
  }

  // ── 팀 브로드캐스트 이벤트 ───────────────────────────────────────

  async broadcastEvent(input: TeamEventInput): Promise<TeamEvent> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('로그인이 필요합니다.');

    const { data, error } = await supabase
      .from('team_events')
      .insert({
        team_id: input.teamId,
        created_by: user.id,
        title: input.title,
        description: input.description ?? null,
        start_at: input.startAt,
        end_at: input.endAt,
        location: input.location ?? null,
        scope: input.scope ?? 'broadcast',
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async getTeamEvents(
    teamId: string,
    range: { from: string; to: string },
  ): Promise<TeamEvent[]> {
    const { data } = await supabase
      .from('team_events')
      .select('*')
      .eq('team_id', teamId)
      .gte('start_at', range.from)
      .lte('start_at', range.to)
      .order('start_at', { ascending: true });

    return data ?? [];
  }

  async deleteTeamEvent(eventId: string): Promise<void> {
    const { error } = await supabase
      .from('team_events')
      .delete()
      .eq('id', eventId);
    if (error) throw error;
  }

  // ── Supabase Realtime 구독 ────────────────────────────────────────

  subscribeToTeamEvents(
    teamId: string,
    onInsert: (event: TeamEvent) => void,
    onUpdate?: (event: TeamEvent) => void,
    onDelete?: (eventId: string) => void,
  ): RealtimeChannel {
    return supabase
      .channel(`team_events:${teamId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'team_events',
          filter: `team_id=eq.${teamId}`,
        },
        (payload) => onInsert(payload.new as TeamEvent),
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'team_events',
          filter: `team_id=eq.${teamId}`,
        },
        (payload) => onUpdate?.(payload.new as TeamEvent),
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'team_events',
          filter: `team_id=eq.${teamId}`,
        },
        (payload) => onDelete?.((payload.old as { id: string }).id),
      )
      .subscribe();
  }

  subscribeToEventRequests(
    onNew: (req: EventRequest) => void,
    onUpdate?: (req: EventRequest) => void,
  ): RealtimeChannel {
    return supabase
      .channel('event_requests:incoming')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'event_requests' },
        (payload) => onNew(payload.new as EventRequest),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'event_requests' },
        (payload) => onUpdate?.(payload.new as EventRequest),
      )
      .subscribe();
  }

  unsubscribe(channel: RealtimeChannel): void {
    supabase.removeChannel(channel);
  }
}

export const teamCalendarService = new TeamCalendarService();
