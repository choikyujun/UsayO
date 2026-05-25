import { useCallback, useEffect, useState } from 'react';
import { supabase, ensureAuth } from '../lib/supabase';
import { Database, Event } from '../types/database';
import { ClassifiedIntent, VoiceCommand } from '../types';
import { widgetService } from '../services/widget/WidgetService';
import { expandRecurringEvent, EventException } from '../utils/recurrenceHelpers';

type Schedule = Database['public']['Tables']['schedules']['Row'];

function dateRange(fromDate: string, daysAhead: number) {
  const from = `${fromDate}T00:00:00.000Z`;
  const toDay = new Date(fromDate + 'T00:00:00.000Z');
  toDay.setUTCDate(toDay.getUTCDate() + daysAhead);
  const toDate = toDay.toISOString().split('T')[0];
  return { from, to: `${toDate}T23:59:59.999Z` };
}

export function useSchedules(date: string, daysAhead = 0) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastCreatedId, setLastCreatedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { from, to } = dateRange(date, daysAhead);
      const fromDate = new Date(from);
      const toDate   = new Date(to);

      // 1. 비반복 일정 + 범위 내 시작하는 반복 부모
      const { data: eventData, error: fetchError } = await supabase
        .from('events')
        .select('*')
        .gte('start_at', from)
        .lte('start_at', to)
        .is('deleted_at', null)
        .order('start_at', { ascending: true });

      if (fetchError) {
        console.error('[Events] fetch error:', fetchError);
        return;
      }

      // 2. 범위 밖에서 시작된 반복 부모 별도 fetch
      const { data: recurringParents } = await supabase
        .from('events')
        .select('*')
        .eq('is_recurring', true)
        .lt('start_at', from)
        .is('deleted_at', null);

      const allParents = [
        ...((eventData ?? []).filter(e => e.is_recurring && !e.parent_event_id)),
        ...(recurringParents ?? []),
      ];

      // 3. exception 목록 fetch (해당 범위)
      const parentIds = allParents.map(p => p.id);
      let exceptions: EventException[] = [];
      if (parentIds.length > 0) {
        const { data: exData } = await supabase
          .from('event_exceptions')
          .select('*')
          .in('parent_id', parentIds);
        exceptions = (exData ?? []) as EventException[];
      }

      // 4. 반복 인스턴스 확장
      const instances = allParents.flatMap(p =>
        expandRecurringEvent(p, fromDate, toDate, exceptions),
      );

      // 5. 비반복 일정만 남기고 인스턴스와 합산
      const oneTime = (eventData ?? []).filter(e => !e.is_recurring);
      const merged = [...oneTime, ...instances].sort(
        (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime(),
      );

      setEvents(merged);
      setSchedules(merged.map(evToSchedule));
      widgetService.push(merged, merged).catch(() => {});
    } catch {
      // 미인증 상태에서는 빈 목록 유지
    } finally {
      setLoading(false);
    }
  }, [date, daysAhead]);

  useEffect(() => { load(); }, [load]);

  async function applyVoiceCommand(command: VoiceCommand): Promise<void> {
    const userId = await ensureAuth();

    if (command.intent === 'CREATE' && command.parsedDateTime) {
      const endAt = new Date(command.parsedDateTime.date);
      endAt.setHours(endAt.getHours() + 1);

      await supabase.from('events').insert({
        user_id: userId,
        title: command.title ?? '새 일정',
        start_at: command.parsedDateTime.date,
        end_at: endAt.toISOString(),
        is_recurring: command.parsedDateTime.isRecurring,
        recurrence_rule: command.parsedDateTime.recurrenceRule ?? null,
        created_via: 'voice',
      });
      await load();
    }

    if (command.intent === 'DELETE' && command.targetEventId) {
      await supabase
        .from('events')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', command.targetEventId);
      await load();
    }

    if (command.intent === 'UPDATE' && command.targetEventId && command.parsedDateTime) {
      await supabase
        .from('events')
        .update({
          start_at: command.parsedDateTime.date,
          title: command.title,
          updated_at: new Date().toISOString(),
        })
        .eq('id', command.targetEventId);
      await load();
    }
  }

  async function applyClassifiedIntent(intent: ClassifiedIntent): Promise<string | undefined> {
    const userId = await ensureAuth();
    console.log('[Schedules] applyClassifiedIntent userId:', userId);

    if (intent.intent === 'CREATE' && intent.startDateTime) {
      const endAt = intent.endDateTime?.date
        ?? new Date(new Date(intent.startDateTime.date).getTime() + 3_600_000).toISOString();

      const payload = {
        user_id: userId,
        title: intent.title ?? '새 일정',
        start_at: intent.startDateTime.date,
        end_at: endAt,
        location: intent.location ?? null,
        description: intent.notes ?? null,
        attendees: intent.attendees ?? null,
        category: intent.category ?? 'work',
        is_recurring: intent.startDateTime.isRecurring,
        recurrence_rule: intent.startDateTime.recurrenceRule ?? null,
        created_via: 'voice' as const,
        voice_transcript: intent.rawTranscript ?? null,
      };

      console.log('[Save] event:', payload);

      const { data, error } = await supabase
        .from('events')
        .insert(payload)
        .select()
        .single();

      console.log('[Save] supabase response data:', data);
      if (error) {
        console.error('[Save] supabase response error:', error);
        throw new Error(error.message);
      }

      if (data) {
        setEvents(prev =>
          [...prev, data as Event].sort(
            (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime(),
          ),
        );
        setLastCreatedId(data.id);
        return data.id;
      }
    }
    return undefined;
  }

  async function undoSave(eventId: string): Promise<void> {
    await supabase
      .from('events')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', eventId);
    setEvents(prev => prev.filter(e => e.id !== eventId));
    setLastCreatedId(null);
  }

  async function rescheduleEvent(eventId: string, newStart: Date, newEnd: Date): Promise<void> {
    const newStartIso = newStart.toISOString();
    const newEndIso   = newEnd.toISOString();
    const updatedAt   = new Date().toISOString();
    setEvents(prev => prev.map(e =>
      e.id === eventId
        ? { ...e, start_at: newStartIso, end_at: newEndIso, updated_at: updatedAt }
        : e,
    ));
    await supabase
      .from('events')
      .update({ start_at: newStartIso, end_at: newEndIso, updated_at: updatedAt })
      .eq('id', eventId);
  }

  async function undoRescheduleEvent(
    eventId: string,
    originalStart: string,
    originalEnd: string,
  ): Promise<void> {
    const updatedAt = new Date().toISOString();
    setEvents(prev => prev.map(e =>
      e.id === eventId
        ? { ...e, start_at: originalStart, end_at: originalEnd, updated_at: updatedAt }
        : e,
    ));
    await supabase
      .from('events')
      .update({ start_at: originalStart, end_at: originalEnd, updated_at: updatedAt })
      .eq('id', eventId);
  }

  return {
    schedules,
    events,
    loading,
    lastCreatedId,
    applyVoiceCommand,
    applyClassifiedIntent,
    undoSave,
    rescheduleEvent,
    undoRescheduleEvent,
    reload: load,
  };
}

function evToSchedule(e: Event): Schedule {
  return {
    id: e.id,
    user_id: e.user_id,
    title: e.title,
    start_at: e.start_at,
    end_at: e.end_at,
    is_recurring: e.is_recurring,
    recurrence_rule: e.recurrence_rule,
    created_at: e.created_at,
    updated_at: e.updated_at,
  };
}
