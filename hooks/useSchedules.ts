import { useCallback, useEffect, useState } from 'react';
import { supabase, ensureAuth } from '../lib/supabase';
import { Database, Event } from '../types/database';
import { ClassifiedIntent, VoiceCommand } from '../types';
import { widgetService } from '../services/widget/WidgetService';
import { expandRecurringEvent, EventException } from '../utils/recurrenceHelpers';

type Schedule = Database['public']['Tables']['schedules']['Row'];

// ── 이벤트 검색 헬퍼 ─────────────────────────────────────────────
async function searchEventsByQuery(query: string, hintDate?: string): Promise<Event[]> {
  // 날짜·시간·동사 제거 → 제목 키워드만 추출
  const cleaned = query
    .replace(/내일|오늘|모레|어제|다음\s*주|이번\s*주|저번\s*주/, '')
    .replace(/오전|오후|아침|점심|저녁|밤|새벽|퇴근/, '')
    .replace(/\d+\s*시(\s*\d+\s*분)?/, '')
    .replace(/취소|삭제|수정|바꿔|변경|옮겨|잡아줘|등록|추가|해줘|제발/, '')
    .replace(/\s+/g, ' ')
    .trim();

  const term = cleaned || query.trim();
  console.log('[Search] ilike term="%s" hintDate=%s', term, hintDate ?? 'none');

  // 쿼리 빌더 (공통)
  const buildQ = (term: string) =>
    supabase.from('events').select('*').is('deleted_at', null)
      .ilike('title', `%${term}%`)
      .order('start_at', { ascending: true });

  // 날짜 범위: 오늘 자정 ~ +30일 (earlier-today 포함)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const end30 = new Date(todayStart.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Try 1 — hintDate 있을 때: 해당 일자 정확 검색
  if (hintDate && term) {
    const d        = new Date(hintDate);
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
    const dayEnd   = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
    const { data: r1 } = await buildQ(term)
      .gte('start_at', dayStart.toISOString())
      .lte('start_at', dayEnd.toISOString());
    if (r1?.length) {
      console.log('[Search] hintDate hit:', r1.length, r1.map(e => `"${e.title}"`));
      return r1 as Event[];
    }
    console.log('[Search] hintDate miss → full-range fallback');
  }

  // Try 2 — 날짜 없이 오늘 자정~30일 범위 (timezone 어긋남, no-hint 모두 처리)
  if (term) {
    const { data: r2 } = await buildQ(term)
      .gte('start_at', todayStart.toISOString())
      .lte('start_at', end30.toISOString());
    console.log('[Search] full-range hit:', r2?.length ?? 0);
    return (r2 ?? []) as Event[];
  }

  return [];
}

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
  const [recurringParents, setRecurringParents] = useState<Event[]>([]);
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
      const { data: earlyParents } = await supabase
        .from('events')
        .select('*')
        .eq('is_recurring', true)
        .lt('start_at', from)
        .is('deleted_at', null);

      const allParents = [
        ...((eventData ?? []).filter(e => e.is_recurring && !e.parent_event_id)),
        ...(earlyParents ?? []),
      ];
      setRecurringParents(allParents);

      // 3. exception 목록 fetch — 마이그레이션 미적용 시 조용히 스킵
      const parentIds = allParents.map(p => p.id);
      let exceptions: EventException[] = [];
      if (parentIds.length > 0) {
        try {
          const { data: exData, error: exError } = await supabase
            .from('event_exceptions')
            .select('*')
            .in('parent_id', parentIds);
          if (!exError) exceptions = (exData ?? []) as EventException[];
        } catch {
          // event_exceptions 테이블 미존재 → 예외 없이 계속
        }
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

      const recurrenceEndDate = intent.startDateTime.recurrenceUntil
        ? intent.startDateTime.recurrenceUntil.split('T')[0]
        : undefined;

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
        // recurrence_end_date는 마이그레이션 적용 후 활성화 (없으면 생략)
        ...(recurrenceEndDate ? { recurrence_end_date: recurrenceEndDate } : {}),
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

    // ── DELETE ──────────────────────────────────────────────────
    if (intent.intent === 'DELETE') {
      const rawQuery = intent.deleteTargetQuery ?? intent.targetEventQuery ?? intent.title ?? '';
      const hintDate = intent.startDateTime?.date;
      console.log('[VoiceFlow] DELETE branch entered, query:', rawQuery, '| hintDate:', hintDate);

      const candidates = await searchEventsByQuery(rawQuery, hintDate);
      console.log('[VoiceFlow] DELETE candidates:', candidates.length, candidates.map(e => `"${e.title}" @ ${e.start_at}`));

      if (candidates.length === 0) {
        throw new Error('해당 일정을 찾을 수 없어요.');
      }
      if (candidates.length > 1) {
        const titles = candidates.slice(0, 3).map(e => e.title).join(', ');
        throw new Error(`일정이 여러 개 있어요: ${titles} — 더 구체적으로 말씀해 주세요.`);
      }

      const target = candidates[0];
      const { data, error } = await supabase
        .from('events')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', target.id)
        .select()
        .single();

      console.log('[VoiceFlow] DB delete result: data=', !!data, '| error=', error?.message ?? null);
      if (error) throw new Error(error.message);

      setEvents(prev => prev.filter(e => e.id !== target.id));
      return target.id;
    }

    // ── UPDATE ──────────────────────────────────────────────────
    if (intent.intent === 'UPDATE') {
      const rawQuery = intent.targetEventQuery ?? intent.title ?? '';
      // 날짜 힌트: updateFields의 원래 시간보다 startDateTime이 더 정확
      const hintDate = intent.startDateTime?.date;
      console.log('[VoiceFlow] UPDATE branch entered, query:', rawQuery, '| hintDate:', hintDate);

      const candidates = await searchEventsByQuery(rawQuery, hintDate);
      console.log('[VoiceFlow] UPDATE candidates:', candidates.length, candidates.map(e => `"${e.title}" @ ${e.start_at}`));

      if (candidates.length === 0) {
        throw new Error('해당 일정을 찾을 수 없어요.');
      }
      if (candidates.length > 1) {
        const titles = candidates.slice(0, 3).map(e => e.title).join(', ');
        throw new Error(`일정이 여러 개 있어요: ${titles} — 더 구체적으로 말씀해 주세요.`);
      }

      const target = candidates[0];
      const patch: {
        updated_at: string;
        start_at?: string;
        end_at?: string;
        title?: string;
        location?: string | null;
      } = { updated_at: new Date().toISOString() };

      if (intent.updateFields?.startDateTime?.date) {
        const newStart   = new Date(intent.updateFields.startDateTime.date);
        const origDur    = new Date(target.end_at).getTime() - new Date(target.start_at).getTime();
        patch.start_at   = newStart.toISOString();
        patch.end_at     = new Date(newStart.getTime() + origDur).toISOString();
      }
      if (intent.updateFields?.title)    patch.title    = intent.updateFields.title;
      if (intent.updateFields?.location !== undefined) patch.location = intent.updateFields.location ?? null;

      const { data, error } = await supabase
        .from('events')
        .update(patch)
        .eq('id', target.id)
        .select()
        .single();

      console.log('[VoiceFlow] DB update result: data=', !!data, '| error=', error?.message ?? null);
      if (error) throw new Error(error.message);

      if (data) {
        setEvents(prev => prev.map(e => e.id === target.id ? (data as Event) : e));
      }
      await load();
      return target.id;
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
    recurringParents,
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
