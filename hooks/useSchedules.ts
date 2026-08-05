import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, ensureAuth } from '../lib/supabase';
import { Database, Event } from '../types/database';
import { ClassifiedIntent, VoiceCommand } from '../types';
import { refreshWidget } from '../services/widget/widgetRefresh';
import { eventsDateRange, fetchExpandedEvents } from '../utils/fetchExpandedEvents';
import { scheduleEventNotification, cancelEventNotification, getEnabledOffsets } from '../services/notifications';
import { voiceTrace } from '../services/voice/voiceTrace'; // [임시 계측 · voice-verify]
import { useAuthStore } from '../stores/useAuthStore';

type Schedule = Database['public']['Tables']['schedules']['Row'];

// ── QUERY 결과 → 자연스러운 한국어 안내 문자열 ─────────────────────
// 기기 로컬 타임존(KST 사용자 기준)으로 포맷 — 앱 전반 규칙과 동일.
function fmtKoreanTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h < 12 ? '오전' : '오후';
  const h12 = h % 12 || 12;
  const minStr = m > 0 ? ` ${m}분` : '';
  return `${ampm} ${h12}시${minStr}`;
}

function sameYmd(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// "오늘은" / "내일은" / "N월 N일은" / (여러 날 범위면) "해당 기간에는"
function queryDayLabel(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (!sameYmd(start, end)) return '해당 기간에는';
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (sameYmd(start, now)) return '오늘은';
  if (sameYmd(start, tomorrow)) return '내일은';
  return `${start.getMonth() + 1}월 ${start.getDate()}일은`;
}

function buildQuerySummary(events: Event[], range: { start: string; end: string }): string {
  const label = queryDayLabel(range.start, range.end);
  if (events.length === 0) {
    return `${label} 일정이 없어요.`;
  }
  const MAX = 5;
  const items = events.slice(0, MAX).map(e => `${fmtKoreanTime(e.start_at)} ${e.title}`);
  let body = items.join(', ');
  if (events.length > MAX) body += ` 외 ${events.length - MAX}개`;
  return `${label} 일정이 ${events.length}개 있어요. ${body}.`;
}

function extractTimeFromQuery(q: string): { hour: number; min: number } | null {
  const m = q.match(/(\d{1,2})\s*시\s*(?:(\d{1,2})\s*분)?/);
  if (!m) return null;
  const hour = parseInt(m[1]);
  const min  = m[2] ? parseInt(m[2]) : 0;
  if (hour > 23 || min > 59) return null;
  return { hour, min };
}

// ── 이벤트 검색 헬퍼 ─────────────────────────────────────────────
async function searchEventsByQuery(query: string, hintDate?: string): Promise<Event[]> {
  // 날짜·시간·동사 제거 → 제목 키워드만 추출
  const cleaned = query
    .replace(/내일|오늘|모레|어제|다음\s*주|이번\s*주|저번\s*주/, '')
    .replace(/오전|오후|아침|점심|저녁|밤|새벽|퇴근/, '')
    .replace(/\d+\s*시(\s*\d+\s*분)?/, '')
    .replace(/취소|삭제|수정|바꿔|변경|옮겨|잡아줘|등록|추가|완료|체크|끝냈어|끝났어|다\s*했어|마쳤어|해줘|제발/, '')
    .replace(/\s+/g, ' ')
    .trim();

  const term = cleaned || query.trim();
  console.log('[Search] ilike term="%s" hintDate=%s', term, hintDate ?? 'none');

  // 쿼리 빌더 (공통)
  const buildQ = (term: string) =>
    supabase.from('events').select('*').is('deleted_at', null)
      .ilike('title', `%${term}%`)
      .order('start_at', { ascending: true });

  // 날짜 범위: -30일 ~ +30일 (과거 일정 완료 처리 등 포함)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const past30  = new Date(todayStart.getTime() - 30 * 24 * 60 * 60 * 1000);
  const future30 = new Date(todayStart.getTime() + 30 * 24 * 60 * 60 * 1000);

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
    // "8시" → AM으로 해석 후 이월(내일)됐을 때, 오늘 PM에 실제 일정이 있을 수 있음 → 전날도 시도
    const prevDay   = new Date(d.getTime() - 24 * 60 * 60 * 1000);
    const prevStart = new Date(prevDay.getFullYear(), prevDay.getMonth(), prevDay.getDate(), 0, 0, 0);
    const prevEnd   = new Date(prevDay.getFullYear(), prevDay.getMonth(), prevDay.getDate(), 23, 59, 59);
    const { data: r1p } = await buildQ(term)
      .gte('start_at', prevStart.toISOString())
      .lte('start_at', prevEnd.toISOString());
    if (r1p?.length) {
      console.log('[Search] hintDate-1day hit:', r1p.length, r1p.map(e => `"${e.title}"`));
      return r1p as Event[];
    }
    console.log('[Search] hintDate miss → full-range fallback');
  }

  // Try 2 — 날짜 없이 -30일~+30일 범위 (전체 구절 매칭)
  if (term) {
    const { data: r2 } = await buildQ(term)
      .gte('start_at', past30.toISOString())
      .lte('start_at', future30.toISOString());
    console.log('[Search] full-range hit:', r2?.length ?? 0);
    if (r2?.length) return r2 as Event[];
  }

  // Try 3 — 단어 분리 fallback: 2글자 이상 단어를 길이 역순으로 개별 검색
  // "철물점 약속" → ["철물점", "약속"] 순으로 시도
  const words = term
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length >= 2)
    .sort((a, b) => b.length - a.length);

  for (const word of words) {
    const { data: r3 } = await buildQ(word)
      .gte('start_at', past30.toISOString())
      .lte('start_at', future30.toISOString());
    if (r3?.length) {
      console.log('[Search] word-split hit on "%s":', word, r3.length, r3.map(e => `"${e.title}"`));
      return r3 as Event[];
    }
  }

  // Try 4 — hintDate 없을 때 쿼리의 시간 힌트로 오늘 날짜 유도
  // "8시 30분 영화보기" → 08:30 오늘 → 제목 검색 → 없으면 시간만으로 단독 매칭
  if (!hintDate) {
    const timeHint = extractTimeFromQuery(query);
    if (timeHint) {
      const now      = new Date();
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      const dayEnd   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

      // 4a — 오늘 + 제목
      if (term) {
        const { data: r4a } = await buildQ(term)
          .gte('start_at', dayStart.toISOString())
          .lte('start_at', dayEnd.toISOString());
        if (r4a?.length) {
          console.log('[Search] time-derived+title hit:', r4a.length, r4a.map(e => `"${e.title}"`));
          return r4a as Event[];
        }
      }

      // 4b — 시간만으로 오늘 일정 매칭 (정확히 1개일 때만)
      // 한국어 "8시" = 08:00 or 20:00 → AM/PM 둘 다 시도
      const { data: r4b } = await supabase.from('events').select('*').is('deleted_at', null)
        .gte('start_at', dayStart.toISOString())
        .lte('start_at', dayEnd.toISOString())
        .order('start_at', { ascending: true });
      const baseMin = timeHint.hour * 60 + timeHint.min;
      const altMin  = ((timeHint.hour + 12) % 24) * 60 + timeHint.min;
      for (const targetMin of [baseMin, altMin]) {
        const atTime = (r4b ?? []).filter(e => {
          const d = new Date(e.start_at);
          return Math.abs(d.getHours() * 60 + d.getMinutes() - targetMin) <= 15;
        });
        if (atTime.length === 1) {
          console.log('[Search] time-only hit (min=%d):', targetMin, `"${atTime[0].title}"`);
          return atTime as Event[];
        }
      }
    }
  }

  return [];
}

export function useSchedules(date: string, daysAhead = 0) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [recurringParents, setRecurringParents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastCreatedId, setLastCreatedId] = useState<string | null>(null);
  const reqSeqRef = useRef(0); // load() 요청 시퀀스 — stale 응답 폐기용

  const load = useCallback(async () => {
    const seq = ++reqSeqRef.current; // 요청 시퀀스 — 최신 요청만 상태 반영(stale clobber 방지)
    setLoading(true);
    try {
      const { from, to } = eventsDateRange(date, daysAhead);
      const { events: merged, parents: allParents } = await fetchExpandedEvents(from, to);

      // 최신 요청만 반영 — stale(인증 전/이전 달 등) 응답은 조용히 폐기(에러 아님)
      if (seq !== reqSeqRef.current) return;
      setRecurringParents(allParents);
      setEvents(merged);
      setSchedules(merged.map(evToSchedule));
      // 위젯 push는 여기서 하지 않는다 — refreshWidget(오늘 기준 단일 경로)가 전담(화면 날짜 범위와 분리).
    } catch {
      // 미인증 상태에서는 빈 목록 유지
    } finally {
      // 최신 요청만 로딩 종료 — stale 응답이 최신 조회의 로딩을 끄지 못하게
      if (seq === reqSeqRef.current) setLoading(false);
    }
  }, [date, daysAhead]);

  // 인증이 확정된 뒤에만 조회한다. pending 동안은 load()를 실행하지 않아
  // loading 초기값(true)이 유지되고, 인증 전 0행 응답으로 인한 빈 상태 깜빡임이 없다.
  // (기존의 마운트 즉시 load + SIGNED_IN 재조회 두 effect를 authed 게이팅 하나로 통합)
  // userId(세션 확정)를 의존성으로 사용 — 'pending→authed' 전이에만 의존하지 않는다.
  // 부트스트랩 reset이 userId=null로 만들고, device-auth가 userId를 채우면(어떤 경로든)
  // null→uid 변화로 이 effect가 반드시 1회 조회를 실행한다.
  const authStatus = useAuthStore(s => s.status);
  const authUserId = useAuthStore(s => s.userId);
  useEffect(() => {
    if (authUserId) {
      load();
    } else if (authStatus === 'failed') {
      setLoading(false); // 무한 로딩 방지 — 인증 불가 시 로딩 종료(빈 상태로 흐름)
    }
    // pending & userId 없음: 대기 → loading=true 유지
  }, [authUserId, authStatus, load]);

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

  async function applyClassifiedIntentInner(intent: ClassifiedIntent): Promise<string | undefined> {
    const userId = await ensureAuth();
    console.log('[Schedules] applyClassifiedIntent userId:', userId);

    if (intent.intent === 'CREATE' && intent.startDateTime) {
      // 시각은 IntentClassifier postProcess에서 활동 시간대 규칙으로 이미 확정됨 → date를 그대로 사용
      const resolvedStartDate = intent.startDateTime.date;

      const endAt = intent.endDateTime?.date
        ?? new Date(new Date(resolvedStartDate).getTime() + 3_600_000).toISOString();

      const recurrenceEndDate = intent.startDateTime.recurrenceUntil
        ? intent.startDateTime.recurrenceUntil.split('T')[0]
        : undefined;

      const isAllDay = false; // 음성 생성은 항상 시간 일정
      const payload = {
        user_id: userId,
        title: intent.title ?? '새 일정',
        start_at: resolvedStartDate,
        end_at: endAt,
        location: intent.location ?? null,
        description: intent.notes ?? null,
        attendees: intent.attendees ?? null,
        category: intent.category ?? 'work',
        is_recurring: intent.startDateTime.isRecurring,
        recurrence_rule: intent.startDateTime.recurrenceRule ?? null,
        ...(recurrenceEndDate ? { recurrence_end_date: recurrenceEndDate } : {}),
        created_via: 'voice' as const,
        voice_transcript: intent.rawTranscript ?? null,
        notification_offset_minutes: null,
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
        const savedEvent = data as Event;
        setEvents(prev =>
          [...prev, savedEvent].sort(
            (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime(),
          ),
        );
        setLastCreatedId(savedEvent.id);
        console.log(`[VOICE][5-DB] op=insert success=true id=${savedEvent.id}`);
        console.log(`[VOICE][TOTAL] recEnd→DB ${voiceTrace.sinceRecordingEnd()}ms (intent=CREATE)`);
        // 알림 예약 (fire-and-forget — 실패해도 저장은 유지)
        scheduleEventNotification(savedEvent).catch(e =>
          console.log('[Notifications] 예약 실패:', e),
        );
        return savedEvent.id;
      }
    }

    // ── DELETE ──────────────────────────────────────────────────
    if (intent.intent === 'DELETE') {
      const rawQuery = intent.deleteTargetQuery ?? intent.targetEventQuery ?? intent.title ?? '';
      const hintDate = intent.startDateTime?.date;
      console.log('[VoiceFlow] DELETE branch entered, query:', rawQuery, '| targetEventId:', intent.targetEventId ?? 'none', '| targetEventIds:', intent.targetEventIds ?? null, '| hintDate:', hintDate);

      // ── targetEventIds: 일괄 삭제 (단일 경로보다 먼저 체크) ──
      if (intent.targetEventIds && intent.targetEventIds.length > 0) {
        console.log('[VoiceFlow] DELETE batch path — ids:', intent.targetEventIds.length, intent.targetEventIds);
        const deletedAt = new Date().toISOString();
        const { error: batchErr, count } = await supabase
          .from('events')
          .update({ deleted_at: deletedAt })
          .in('id', intent.targetEventIds);
        console.log('[VoiceFlow] DB batch delete result: count=', count, '| error=', batchErr?.message ?? null);
        if (batchErr) throw new Error(batchErr.message);
        console.log(`[VOICE][4-MATCH] intent=DELETE(batch) candidateCount=${intent.targetEventIds.length} selectedIds=${JSON.stringify(intent.targetEventIds)}`);
        console.log(`[VOICE][5-DB] op=delete-batch success=true count=${count ?? intent.targetEventIds.length}`);
        console.log(`[VOICE][TOTAL] recEnd→DB ${voiceTrace.sinceRecordingEnd()}ms (intent=DELETE-batch)`);
        const ids = new Set(intent.targetEventIds);
        setEvents(prev => prev.filter(e => !ids.has(e.id)));
        await Promise.all(intent.targetEventIds.map(id => cancelEventNotification(id)));
        return intent.targetEventIds[0];
      }

      // ── 단일 일정 삭제 ───────────────────────────────────────
      let target: Event;
      if (intent.targetEventId) {
        const { data: direct, error: directErr } = await supabase
          .from('events').select('*').eq('id', intent.targetEventId).is('deleted_at', null).single();
        console.log('[VoiceFlow] DELETE direct lookup:', !!direct, directErr?.message ?? null);
        if (!direct) throw new Error('해당 일정을 찾을 수 없어요.');
        target = direct as Event;
      } else {
        const candidates = await searchEventsByQuery(rawQuery, hintDate);
        console.log('[VoiceFlow] DELETE candidates:', candidates.length, candidates.map(e => `"${e.title}" @ ${e.start_at}`));
        if (candidates.length === 0) throw new Error('해당 일정을 찾을 수 없어요.');
        if (candidates.length > 1) {
          const titles = candidates.slice(0, 3).map(e => e.title).join(', ');
          throw new Error(`일정이 여러 개 있어요: ${titles} — 더 구체적으로 말씀해 주세요.`);
        }
        target = candidates[0];
      }
      console.log(`[VOICE][4-MATCH] intent=DELETE selectedId=${target.id} title=${JSON.stringify(target.title)}`);

      const { data, error } = await supabase
        .from('events')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', target.id)
        .select()
        .single();

      console.log('[VoiceFlow] DB delete result: data=', !!data, '| error=', error?.message ?? null);
      if (error) throw new Error(error.message);
      console.log(`[VOICE][5-DB] op=delete success=${!!data} id=${target.id}`);
      console.log(`[VOICE][TOTAL] recEnd→DB ${voiceTrace.sinceRecordingEnd()}ms (intent=DELETE)`);

      setEvents(prev => prev.filter(e => e.id !== target.id));
      cancelEventNotification(target.id).catch(() => {});
      return target.id;
    }

    // ── UPDATE ──────────────────────────────────────────────────
    if (intent.intent === 'UPDATE') {
      const rawQuery = intent.targetEventQuery ?? intent.title ?? '';
      const hintDate = intent.startDateTime?.date;
      console.log('[VoiceFlow] UPDATE branch entered, query:', rawQuery, '| targetEventId:', intent.targetEventId ?? 'none', '| hintDate:', hintDate);

      let target: Event;
      if (intent.targetEventId) {
        const { data: direct, error: directErr } = await supabase
          .from('events').select('*').eq('id', intent.targetEventId).is('deleted_at', null).single();
        console.log('[VoiceFlow] UPDATE direct lookup:', !!direct, directErr?.message ?? null);
        if (!direct) throw new Error('해당 일정을 찾을 수 없어요.');
        target = direct as Event;
      } else {
        const candidates = await searchEventsByQuery(rawQuery, hintDate);
        console.log('[VoiceFlow] UPDATE candidates:', candidates.length, candidates.map(e => `"${e.title}" @ ${e.start_at}`));
        if (candidates.length === 0) throw new Error('해당 일정을 찾을 수 없어요.');
        if (candidates.length > 1) {
          const titles = candidates.slice(0, 3).map(e => e.title).join(', ');
          throw new Error(`일정이 여러 개 있어요: ${titles} — 더 구체적으로 말씀해 주세요.`);
        }
        target = candidates[0];
      }
      console.log(`[VOICE][4-MATCH] intent=UPDATE selectedId=${target.id} title=${JSON.stringify(target.title)}`);
      const patch: {
        updated_at: string;
        start_at?: string;
        end_at?: string;
        title?: string;
        location?: string | null;
      } = { updated_at: new Date().toISOString() };

      if (intent.updateFields?.startDateTime?.date) {
        const newStart  = new Date(intent.updateFields.startDateTime.date);
        const origStart = new Date(target.start_at);
        // 한국어 시간 표현 AM/PM 보정:
        // 원본 일정이 PM(12시 이후)인데 새 시간이 AM(12시 미만)으로 해석됐으면 PM으로 전환
        // 예: 저녁 20:00 일정 → "11시로 바꿔줘" → 23:00 (11 PM)
        if (origStart.getHours() >= 12 && newStart.getHours() < 12) {
          newStart.setHours(newStart.getHours() + 12);
        }
        const origDur  = new Date(target.end_at).getTime() - new Date(target.start_at).getTime();
        patch.start_at = newStart.toISOString();
        patch.end_at   = new Date(newStart.getTime() + origDur).toISOString();
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
      console.log(`[VOICE][5-DB] op=update success=${!!data} id=${target.id}`);
      console.log(`[VOICE][TOTAL] recEnd→DB ${voiceTrace.sinceRecordingEnd()}ms (intent=UPDATE)`);

      if (data) {
        setEvents(prev => prev.map(e => e.id === target.id ? (data as Event) : e));
        // 시간이 바뀐 경우 알림 재예약 (fire-and-forget)
        scheduleEventNotification(data as Event).catch(e =>
          console.log('[Notifications] UPDATE 재예약 실패:', e),
        );
      }
      await load();
      return target.id;
    }

    // ── COMPLETE ─────────────────────────────────────────────────
    if (intent.intent === 'COMPLETE') {
      const rawQuery = intent.completeTargetQuery ?? intent.targetEventQuery ?? intent.title ?? '';
      const hintDate = intent.startDateTime?.date;
      console.log('[VoiceFlow] COMPLETE branch entered, query:', rawQuery, '| targetEventId:', intent.targetEventId ?? 'none', '| hintDate:', hintDate);

      let target: Event;
      if (intent.targetEventId) {
        const { data: direct, error: directErr } = await supabase
          .from('events').select('*').eq('id', intent.targetEventId).is('deleted_at', null).single();
        console.log('[VoiceFlow] COMPLETE direct lookup:', !!direct, directErr?.message ?? null);
        if (!direct) throw new Error('해당 일정을 찾을 수 없어요.');
        target = direct as Event;
      } else {
        const candidates = await searchEventsByQuery(rawQuery, hintDate);
        console.log('[VoiceFlow] COMPLETE candidates:', candidates.length, candidates.map(e => `"${e.title}" @ ${e.start_at}`));
        if (candidates.length === 0) throw new Error('해당 일정을 찾을 수 없어요.');
        if (candidates.length > 1) {
          const titles = candidates.slice(0, 3).map(e => e.title).join(', ');
          throw new Error(`일정이 여러 개 있어요: ${titles} — 더 구체적으로 말씀해 주세요.`);
        }
        target = candidates[0];
      }
      console.log(`[VOICE][4-MATCH] intent=COMPLETE selectedId=${target.id} title=${JSON.stringify(target.title)}`);
      const { data, error } = await supabase
        .from('events')
        .update({ completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', target.id)
        .select()
        .single();

      console.log('[VoiceFlow] DB complete result: data=', !!data, '| error=', error?.message ?? null);
      if (error) throw new Error(error.message);
      console.log(`[VOICE][5-DB] op=update-complete success=${!!data} id=${target.id}`);
      console.log(`[VOICE][TOTAL] recEnd→DB ${voiceTrace.sinceRecordingEnd()}ms (intent=COMPLETE)`);

      if (data) {
        setEvents(prev => prev.map(e => e.id === target.id ? (data as Event) : e));
      }
      return target.id;
    }

    // ── NOTIFICATION_UPDATE ──────────────────────────────────────
    if (intent.intent === 'NOTIFICATION_UPDATE') {
      const notifOffset = intent.notificationOffsetMinutes !== undefined
        ? intent.notificationOffsetMinutes
        : null;
      const rawQuery = intent.targetEventQuery ?? intent.title ?? '';
      const hintDate = intent.startDateTime?.date;
      console.log('[VoiceFlow] NOTIFICATION_UPDATE branch, query:', rawQuery, '| offset:', notifOffset);

      let targetIds: string[] = [];
      if (intent.targetEventIds && intent.targetEventIds.length > 0) {
        targetIds = intent.targetEventIds;
      } else if (intent.targetEventId) {
        targetIds = [intent.targetEventId];
      } else {
        const candidates = await searchEventsByQuery(rawQuery, hintDate);
        if (candidates.length === 0) throw new Error('해당 일정을 찾을 수 없어요.');
        if (candidates.length > 1) {
          const titles = candidates.slice(0, 3).map(e => e.title).join(', ');
          throw new Error(`일정이 여러 개 있어요: ${titles} — 더 구체적으로 말씀해 주세요.`);
        }
        targetIds = [candidates[0].id];
      }
      console.log(`[VOICE][4-MATCH] intent=NOTIFICATION_UPDATE candidateCount=${targetIds.length} selectedIds=${JSON.stringify(targetIds)}`);

      const { error } = await supabase
        .from('events')
        .update({ notification_offset_minutes: notifOffset, updated_at: new Date().toISOString() })
        .in('id', targetIds);
      console.log('[VoiceFlow] NOTIFICATION_UPDATE DB result: error=', error?.message ?? null);
      if (error) throw new Error(error.message);
      console.log(`[VOICE][5-DB] op=update-notif success=${!error} ids=${JSON.stringify(targetIds)}`);
      console.log(`[VOICE][TOTAL] recEnd→DB ${voiceTrace.sinceRecordingEnd()}ms (intent=NOTIFICATION_UPDATE)`);

      const { data: updated } = await supabase.from('events').select('*').in('id', targetIds);
      if (updated) {
        const updatedMap = new Map(updated.map(e => [e.id, e as Event]));
        setEvents(prev => prev.map(e => updatedMap.get(e.id) ?? e));
        for (const ev of updated) {
          if (notifOffset === null) {
            cancelEventNotification(ev.id).catch(() => {});
          } else {
            scheduleEventNotification(ev as Event).catch(() => {});
          }
        }
      }
      return targetIds[0];
    }

    // ── QUERY: 조회 전용 (저장 없음). 결과를 한국어 요약 문자열로 반환 ──
    if (intent.intent === 'QUERY') {
      const range = intent.queryRange;
      console.log('[VoiceFlow] QUERY branch entered, range:', range, '| queryType:', intent.queryType ?? 'none');
      if (!range?.start || !range?.end) {
        console.log('[VOICE][5-DB] op=query success=false reason=no-range');
        return '조회할 기간을 이해하지 못했어요. 다시 말씀해 주세요.';
      }
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .is('deleted_at', null)
        .gte('start_at', range.start)
        .lte('start_at', range.end)
        .order('start_at', { ascending: true })
        .limit(100);
      if (error) {
        console.log('[VOICE][5-DB] op=query success=false error=', error.message);
        throw new Error(error.message);
      }
      const rows = (data ?? []) as Event[];
      console.log(`[VOICE][5-DB] op=query success=true count=${rows.length}`);
      console.log(`[VOICE][TOTAL] recEnd→DB ${voiceTrace.sinceRecordingEnd()}ms (intent=QUERY)`);
      return buildQuerySummary(rows, range);
    }

    return undefined;
  }

  // 뮤테이션 성공 후 위젯을 오늘 기준으로 갱신(QUERY는 읽기 전용이라 제외). 모든 진입점
  // (FAB/위젯 딥링크/일·주·월 뷰)이 이 함수를 거치므로 여기 한 곳에서 갱신을 보장.
  async function applyClassifiedIntent(intent: ClassifiedIntent): Promise<string | undefined> {
    const result = await applyClassifiedIntentInner(intent);
    if (intent.intent !== 'QUERY') refreshWidget(`apply:${intent.intent}`).catch(() => {});
    return result;
  }

  async function toggleEventComplete(eventId: string, currentlyCompleted: boolean): Promise<void> {
    const completedAt = currentlyCompleted ? null : new Date().toISOString();
    setEvents(prev => prev.map(e =>
      e.id === eventId ? { ...e, completed_at: completedAt } : e,
    ));
    await supabase
      .from('events')
      .update({ completed_at: completedAt })
      .eq('id', eventId);
    refreshWidget('toggleComplete').catch(() => {});
  }

  async function deleteEventById(eventId: string): Promise<void> {
    setEvents(prev => prev.filter(e => e.id !== eventId));
    await Promise.all([
      supabase.from('events').update({ deleted_at: new Date().toISOString() }).eq('id', eventId),
      cancelEventNotification(eventId),
    ]);
    refreshWidget('delete').catch(() => {});
  }

  async function undoSave(eventId: string): Promise<void> {
    await supabase
      .from('events')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', eventId);
    setEvents(prev => prev.filter(e => e.id !== eventId));
    setLastCreatedId(null);
    refreshWidget('undoSave').catch(() => {});
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
    const { data } = await supabase
      .from('events')
      .update({ start_at: newStartIso, end_at: newEndIso, updated_at: updatedAt })
      .eq('id', eventId)
      .select()
      .single();
    if (data) {
      scheduleEventNotification(data as Event).catch(e =>
        console.log('[Notifications] drag 재예약 실패:', e),
      );
    }
    refreshWidget('reschedule').catch(() => {});
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
    const { data } = await supabase
      .from('events')
      .update({ start_at: originalStart, end_at: originalEnd, updated_at: updatedAt })
      .eq('id', eventId)
      .select()
      .single();
    if (data) {
      scheduleEventNotification(data as Event).catch(e =>
        console.log('[Notifications] undo 재예약 실패:', e),
      );
    }
    refreshWidget('undoReschedule').catch(() => {});
  }

  return {
    schedules,
    events,
    recurringParents,
    loading,
    lastCreatedId,
    applyVoiceCommand,
    applyClassifiedIntent,
    deleteEventById,
    toggleEventComplete,
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
