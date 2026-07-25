import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/useAuthStore';
import { Event } from '../types/database';
import { localDateStr } from '../utils/timeHelpers';
import { expandRecurringEvent, EventException } from '../utils/recurrenceHelpers';

// anchorYearMonth = "YYYY-MM"
function monthBounds(anchorYearMonth: string) {
  const [y, m] = anchorYearMonth.split('-').map(Number);
  const from = new Date(y, m - 1, 1).toISOString();
  const to   = new Date(y, m, 0, 23, 59, 59, 999).toISOString(); // last day
  return { from, to };
}

export function useEventsForDate(selectedDate: string, anchorYearMonth: string) {
  const [monthEvents, setMonthEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const reqSeqRef = useRef(0); // load() 요청 시퀀스 — stale 응답 폐기용

  const load = useCallback(async () => {
    const seq = ++reqSeqRef.current; // 최신 요청만 상태 반영(stale clobber 방지)
    setLoading(true);
    try {
      const { from, to } = monthBounds(anchorYearMonth);
      const fromDate = new Date(from);
      const toDate   = new Date(to);

      const { data, error } = await supabase
        .from('events')
        .select('*')
        .gte('start_at', from)
        .lte('start_at', to)
        .is('deleted_at', null)
        .order('start_at', { ascending: true });

      if (error) return;

      // 반복 부모 (월 이전 시작)
      const { data: recurringParents } = await supabase
        .from('events')
        .select('*')
        .eq('is_recurring', true)
        .lt('start_at', from)
        .is('deleted_at', null);

      const allParents = [
        ...((data ?? []).filter(e => e.is_recurring && !e.parent_event_id)),
        ...(recurringParents ?? []),
      ];

      let exceptions: EventException[] = [];
      if (allParents.length > 0) {
        try {
          const { data: exData, error: exError } = await supabase
            .from('event_exceptions')
            .select('*')
            .in('parent_id', allParents.map(p => p.id));
          if (!exError) exceptions = (exData ?? []) as EventException[];
        } catch {
          // event_exceptions 테이블 미존재 → 스킵
        }
      }

      const instances = allParents.flatMap(p =>
        expandRecurringEvent(p, fromDate, toDate, exceptions),
      );

      const oneTime = (data ?? []).filter(e => !e.is_recurring);
      const merged = [...oneTime, ...instances].sort(
        (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime(),
      );

      // 최신 요청만 반영 — stale(인증 전/이전 달 등) 응답은 조용히 폐기
      if (seq !== reqSeqRef.current) return;
      setMonthEvents(merged);
    } finally {
      // 최신 요청만 로딩 종료
      if (seq === reqSeqRef.current) setLoading(false);
    }
  }, [anchorYearMonth]);

  // 인증이 확정된 뒤에만 조회한다. pending 동안은 load()를 실행하지 않아
  // loading 초기값(true)이 유지되고, 인증 전 0행 응답으로 인한 빈 상태 깜빡임이 없다.
  // userId(세션 확정)를 의존성으로 사용 — 'pending→authed' 전이에만 의존하지 않는다.
  const authStatus = useAuthStore(s => s.status);
  const authUserId = useAuthStore(s => s.userId);
  useEffect(() => {
    if (authUserId) {
      load();
    } else if (authStatus === 'failed') {
      setLoading(false); // 무한 로딩 방지 — 인증 불가 시 로딩 종료(빈 상태로 흐름)
    }
    // pending & userId 없음: 대기 → loading=true 유지(skeleton/null)
  }, [authUserId, authStatus, load]);


  // Events for the selected day only (filtered from the already-loaded month)
  const events = useMemo(
    () => monthEvents.filter(e => localDateStr(new Date(e.start_at)) === selectedDate),
    [monthEvents, selectedDate],
  );

  // Count per day for calendar dots
  const monthCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of monthEvents) {
      const key = localDateStr(new Date(e.start_at));
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [monthEvents]);

  function patchEvent(eventId: string, updates: Partial<Event>) {
    setMonthEvents(prev => prev.map(e => e.id === eventId ? { ...e, ...updates } : e));
  }

  return { events, loading, monthCounts, reload: load, patchEvent };
}
