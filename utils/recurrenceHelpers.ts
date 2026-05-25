import { Event } from '../types/database';

// ── 인스턴스 ID 규칙 ────────────────────────────────────────────
// 가상 인스턴스: "{parentId}__{YYYY-MM-DD}"

export function makeInstanceId(parentId: string, instanceDate: Date): string {
  const ds = localDateStr(instanceDate);
  return `${parentId}__${ds}`;
}

export function isVirtualInstance(eventId: string): boolean {
  return eventId.includes('__');
}

export function parseInstanceId(id: string): { parentId: string; instanceDate: string } | null {
  const idx = id.lastIndexOf('__');
  if (idx === -1) return null;
  return { parentId: id.slice(0, idx), instanceDate: id.slice(idx + 2) };
}

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── RRULE 파싱 헬퍼 ────────────────────────────────────────────
const BYDAY_MAP: Record<string, number> = {
  SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6,
};

function parseRRule(rruleStr: string): {
  freq: string;
  interval: number;
  byDay: Array<{ ord: number | null; dow: number }>;   // dow = 0..6 (Sun=0)
  byMonthDay: number[];
} | null {
  try {
    const upper = rruleStr.toUpperCase();
    const get = (key: string) => upper.match(new RegExp(`${key}=([^;\\s]+)`))?.[1] ?? null;

    const freq = get('FREQ');
    if (!freq) return null;

    const interval = parseInt(get('INTERVAL') ?? '1');

    // BYDAY: "MO", "1MO", "-1FR", "MO,TU"
    const bydayRaw = get('BYDAY');
    const byDay: Array<{ ord: number | null; dow: number }> = [];
    if (bydayRaw) {
      for (const part of bydayRaw.split(',')) {
        const m = part.match(/^(-?\d+)?([A-Z]+)$/);
        if (m) {
          const ord = m[1] ? parseInt(m[1]) : null;
          const dow = BYDAY_MAP[m[2]] ?? -1;
          if (dow >= 0) byDay.push({ ord, dow });
        }
      }
    }

    const byMDRaw = get('BYMONTHDAY');
    const byMonthDay = byMDRaw ? byMDRaw.split(',').map(Number) : [];

    return { freq, interval, byDay, byMonthDay };
  } catch {
    return null;
  }
}

// ── 날짜 유틸 ────────────────────────────────────────────────
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth()    === b.getMonth()    &&
         a.getDate()     === b.getDate();
}

// 주어진 달의 N번째 특정 요일 반환 (ord=-1 → 마지막)
function nthWeekdayOfMonth(year: number, month: number, dow: number, ord: number): Date | null {
  if (ord > 0) {
    let count = 0;
    for (let day = 1; day <= 31; day++) {
      const d = new Date(year, month, day);
      if (d.getMonth() !== month) break;
      if (d.getDay() === dow) {
        count++;
        if (count === ord) return d;
      }
    }
  } else if (ord < 0) {
    // 마지막 N번째
    const abs = Math.abs(ord);
    let count = 0;
    const lastDay = new Date(year, month + 1, 0).getDate();
    for (let day = lastDay; day >= 1; day--) {
      const d = new Date(year, month, day);
      if (d.getDay() === dow) {
        count++;
        if (count === abs) return d;
      }
    }
  }
  return null;
}

// ── 반복 일정 인스턴스 생성 ────────────────────────────────────
export interface EventException {
  parent_id:         string;
  instance_date:     string;  // "YYYY-MM-DD"
  is_deleted:        boolean;
  override_start:    string | null;
  override_end:      string | null;
  override_title:    string | null;
  override_location: string | null;
  override_notes:    string | null;
}

export function expandRecurringEvent(
  parent:     Event,
  from:       Date,
  to:         Date,
  exceptions: EventException[] = [],
): Event[] {
  if (!parent.is_recurring || !parent.recurrence_rule) return [];

  const rule = parseRRule(parent.recurrence_rule);
  if (!rule) return [];

  const endBound = parent.recurrence_end_date
    ? new Date(parent.recurrence_end_date + 'T23:59:59')
    : to;
  const effectiveTo = endBound < to ? endBound : to;

  const dtstart    = new Date(parent.start_at);
  const durationMs = new Date(parent.end_at).getTime() - dtstart.getTime();

  const exMap = new Map<string, EventException>();
  for (const ex of exceptions) {
    if (ex.parent_id === parent.id) exMap.set(ex.instance_date, ex);
  }

  // candidate dates generation
  const candidates: Date[] = [];

  if (rule.freq === 'DAILY') {
    // BYDAY filter (weekday/weekend)
    const allowedDows = rule.byDay.length
      ? new Set(rule.byDay.map(b => b.dow))
      : null;

    const start = dtstart < from ? from : dtstart;
    let cur = new Date(start);
    cur.setHours(dtstart.getHours(), dtstart.getMinutes(), 0, 0);

    // rewind to dtstart weekday alignment
    while (cur <= effectiveTo) {
      if (!allowedDows || allowedDows.has(cur.getDay())) {
        if (cur >= from) candidates.push(new Date(cur));
      }
      cur = addDays(cur, rule.interval);
    }

  } else if (rule.freq === 'WEEKLY') {
    const allowedDows = rule.byDay.length
      ? new Set(rule.byDay.map(b => b.dow))
      : new Set([dtstart.getDay()]);

    // find first Monday-aligned week
    let weekStart = new Date(dtstart);
    weekStart.setHours(0, 0, 0, 0);

    while (weekStart <= effectiveTo) {
      for (const dow of allowedDows) {
        const diff = (dow - weekStart.getDay() + 7) % 7;
        const candidate = addDays(weekStart, diff);
        candidate.setHours(dtstart.getHours(), dtstart.getMinutes(), 0, 0);
        if (candidate >= from && candidate >= dtstart && candidate <= effectiveTo) {
          candidates.push(candidate);
        }
      }
      weekStart = addDays(weekStart, 7 * rule.interval);
    }

  } else if (rule.freq === 'MONTHLY') {
    let year  = dtstart.getFullYear();
    let month = dtstart.getMonth();

    while (new Date(year, month, 1) <= effectiveTo) {
      const monthCandidates: Date[] = [];

      if (rule.byMonthDay.length > 0) {
        for (const md of rule.byMonthDay) {
          const d = new Date(year, month, md);
          if (d.getMonth() === month) {
            d.setHours(dtstart.getHours(), dtstart.getMinutes(), 0, 0);
            monthCandidates.push(d);
          }
        }
      } else if (rule.byDay.length > 0) {
        for (const { ord, dow } of rule.byDay) {
          const targetOrd = ord ?? 1;
          const d = nthWeekdayOfMonth(year, month, dow, targetOrd);
          if (d) {
            d.setHours(dtstart.getHours(), dtstart.getMinutes(), 0, 0);
            monthCandidates.push(d);
          }
        }
      } else {
        // same day of month as dtstart
        const d = new Date(year, month, dtstart.getDate());
        if (d.getMonth() === month) {
          d.setHours(dtstart.getHours(), dtstart.getMinutes(), 0, 0);
          monthCandidates.push(d);
        }
      }

      for (const d of monthCandidates) {
        if (d >= dtstart && d >= from && d <= effectiveTo) {
          candidates.push(d);
        }
      }

      month += rule.interval;
      if (month >= 12) { year += Math.floor(month / 12); month %= 12; }
    }

  } else if (rule.freq === 'YEARLY') {
    let year = dtstart.getFullYear();
    while (year <= effectiveTo.getFullYear() + 1) {
      const d = new Date(year, dtstart.getMonth(), dtstart.getDate());
      d.setHours(dtstart.getHours(), dtstart.getMinutes(), 0, 0);
      if (d >= dtstart && d >= from && d <= effectiveTo) {
        candidates.push(d);
      }
      year += rule.interval;
    }
  }

  // Build instances
  const instances: Event[] = [];
  for (const date of candidates) {
    const dateStr = localDateStr(date);
    const ex = exMap.get(dateStr);
    if (ex?.is_deleted) continue;

    const instanceStart = ex?.override_start ? new Date(ex.override_start) : date;
    const instanceEnd   = ex?.override_end
      ? new Date(ex.override_end)
      : new Date(instanceStart.getTime() + durationMs);

    instances.push({
      ...parent,
      id:              makeInstanceId(parent.id, date),
      start_at:        instanceStart.toISOString(),
      end_at:          instanceEnd.toISOString(),
      parent_event_id: parent.id,
      title:           ex?.override_title    ?? parent.title,
      location:        ex?.override_location ?? parent.location,
      description:     ex?.override_notes    ?? parent.description,
    });
  }

  // deduplicate same-day (weekly BYDAY can produce multiple per week—sort + dedupe)
  instances.sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
  return instances.filter((ev, i) =>
    i === 0 || !sameDay(new Date(ev.start_at), new Date(instances[i - 1].start_at))
  );
}

// ── RRULE → 한국어 ────────────────────────────────────────────
const KO_DAYS: Record<string, string> = {
  MO: '월', TU: '화', WE: '수', TH: '목', FR: '금', SA: '토', SU: '일',
};

const ORDINAL_KO: Record<string, string> = {
  '1': '첫째', '2': '둘째', '3': '셋째', '4': '넷째', '-1': '마지막',
};

export function humanReadableRRule(rruleStr: string | null): string {
  if (!rruleStr) return '';
  try {
    const upper = rruleStr.toUpperCase();
    const get = (key: string) => upper.match(new RegExp(`${key}=([^;\\s]+)`))?.[1] ?? null;

    const freq = get('FREQ');
    if (!freq) return rruleStr;

    const interval   = parseInt(get('INTERVAL') ?? '1');
    const bydayRaw   = get('BYDAY');
    const byMDRaw    = get('BYMONTHDAY');
    const bydays     = bydayRaw ? bydayRaw.split(',') : [];
    const byMonthDays = byMDRaw ? byMDRaw.split(',') : [];

    function formatByday(d: string): string {
      const m = d.match(/^(-?\d+)([A-Z]+)$/);
      if (m) {
        const ord = ORDINAL_KO[m[1]] ?? m[1] + '번째';
        return `${ord} ${KO_DAYS[m[2]] ?? m[2]}요일`;
      }
      return (KO_DAYS[d] ?? d) + '요일';
    }

    if (freq === 'DAILY') {
      if (bydays.length >= 5 && bydays.every(d => ['MO','TU','WE','TH','FR'].includes(d)))
        return '평일 매일';
      if (bydays.length === 2 && bydays.every(d => ['SA','SU'].includes(d)))
        return '주말마다';
      return interval === 1 ? '매일' : `${interval}일마다`;
    }

    if (freq === 'WEEKLY') {
      const dayNames = bydays.map(formatByday);
      const prefix = interval === 1 ? '매주' : `${interval}주마다`;
      return dayNames.length ? `${prefix} ${dayNames.join(', ')}` : prefix;
    }

    if (freq === 'MONTHLY') {
      if (bydays.length > 0) {
        return `매월 ${bydays.map(formatByday).join(', ')}`;
      }
      if (byMonthDays.length > 0) {
        return `매월 ${byMonthDays.join(', ')}일`;
      }
      return '매월';
    }

    if (freq === 'YEARLY') return '매년';

    return rruleStr;
  } catch {
    return rruleStr;
  }
}

// ── 반복 일정 레이블 (규칙 + 시간) ──────────────────────────────
export function formatRecurrenceLabel(rruleStr: string | null, startAt: string): string {
  const rule = humanReadableRRule(rruleStr);
  if (!rule) return '';
  const d = new Date(startAt);
  const h = d.getHours();
  const m = d.getMinutes();
  const timeStr = m === 0 ? `${h}시` : `${h}시${String(m).padStart(2, '0')}분`;
  return `${rule} ${timeStr}`;
}
