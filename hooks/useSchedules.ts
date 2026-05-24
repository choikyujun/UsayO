import { useCallback, useEffect, useState } from 'react';
import { supabase, ensureAuth } from '../lib/supabase';
import { Database, Event } from '../types/database';
import { ClassifiedIntent, VoiceCommand } from '../types';
import { widgetService } from '../services/widget/WidgetService';

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
      console.log('[Events] fetching range:', from, to);

      const { data: eventData, error: fetchError } = await supabase
        .from('events')
        .select('*')
        .gte('start_at', from)
        .lte('start_at', to)
        .is('deleted_at', null)
        .order('start_at', { ascending: true });

      if (fetchError) {
        console.error('[Events] fetch error:', fetchError);
        // events 쿼리 실패 시 기존 상태 유지 (낙관적 업데이트 보호)
        return;
      }

      console.log('[Events] fetched count:', eventData?.length ?? 0);

      if (eventData) {
        setEvents(eventData);
        setSchedules(eventData.map(evToSchedule));
        widgetService.push(eventData, eventData).catch(() => {});
      }
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

  return {
    schedules,
    events,
    loading,
    lastCreatedId,
    applyVoiceCommand,
    applyClassifiedIntent,
    undoSave,
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
