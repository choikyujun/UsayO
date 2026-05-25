import { RRule, rrulestr } from 'rrule';
import { Event } from '../types/database';

// ── 인스턴스 ID 규칙 ────────────────────────────────────────────
// 가상 인스턴스: "{parentId}__{YYYY-MM-DD}"
// parent_event_id가 set → 가상 인스턴스

export function makeInstanceId(parentId: string, instanceDate: Date): string {
  const d = instanceDate;
  const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

// ── rrule 파싱 ──────────────────────────────────────────────────
function buildRRule(event: Event): RRule | null {
  if (!event.is_recurring || !event.recurrence_rule) return null;
  try {
    const dtstart = new Date(event.start_at);
    // rrule 라이브러리는 UTC로 처리하므로 DTSTART를 직접 지정
    const ruleStr = `DTSTART:${dtstart.toISOString().replace(/[-:]/g, '').split('.')[0]}Z\nRRULE:${event.recurrence_rule}`;
    const rule = rrulestr(ruleStr);
    return rule as RRule;
  } catch {
    return null;
  }
}

// ── 반복 일정 인스턴스 생성 ─────────────────────────────────────
export interface EventException {
  parent_id:        string;
  instance_date:    string;  // "YYYY-MM-DD"
  is_deleted:       boolean;
  override_start:   string | null;
  override_end:     string | null;
  override_title:   string | null;
  override_location: string | null;
  override_notes:   string | null;
}

export function expandRecurringEvent(
  parent:     Event,
  from:       Date,
  to:         Date,
  exceptions: EventException[] = [],
): Event[] {
  const rule = buildRRule(parent);
  if (!rule) return [];

  const endBound = parent.recurrence_end_date
    ? new Date(parent.recurrence_end_date + 'T23:59:59Z')
    : to;
  const effectiveTo = endBound < to ? endBound : to;

  const dates = rule.between(from, effectiveTo, true);
  const durationMs =
    new Date(parent.end_at).getTime() - new Date(parent.start_at).getTime();

  const exMap = new Map<string, EventException>();
  for (const ex of exceptions) {
    if (ex.parent_id === parent.id) exMap.set(ex.instance_date, ex);
  }

  const instances: Event[] = [];

  for (const date of dates) {
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const ex = exMap.get(dateStr);

    if (ex?.is_deleted) continue;

    const instanceStart = ex?.override_start
      ? new Date(ex.override_start)
      : date;
    const instanceEnd = ex?.override_end
      ? new Date(ex.override_end)
      : new Date(instanceStart.getTime() + durationMs);

    instances.push({
      ...parent,
      id:             makeInstanceId(parent.id, date),
      start_at:       instanceStart.toISOString(),
      end_at:         instanceEnd.toISOString(),
      parent_event_id: parent.id,
      title:          ex?.override_title   ?? parent.title,
      location:       ex?.override_location ?? parent.location,
      description:    ex?.override_notes   ?? parent.description,
    });
  }

  return instances;
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

    // FREQ 추출
    const freqMatch = upper.match(/FREQ=(\w+)/);
    if (!freqMatch) return rruleStr;
    const freq = freqMatch[1];

    // BYDAY 추출
    const bydayMatch = upper.match(/BYDAY=([^;]+)/);
    const bydays = bydayMatch ? bydayMatch[1].split(',') : [];

    // BYMONTHDAY 추출
    const byMDMatch = upper.match(/BYMONTHDAY=([^;]+)/);
    const byMonthDays = byMDMatch ? byMDMatch[1].split(',') : [];

    // INTERVAL
    const intervalMatch = upper.match(/INTERVAL=(\d+)/);
    const interval = intervalMatch ? parseInt(intervalMatch[1]) : 1;

    if (freq === 'DAILY') {
      if (bydays.length === 5 && bydays.every(d => ['MO','TU','WE','TH','FR'].includes(d)))
        return '평일 매일';
      if (bydays.length === 2 && bydays.every(d => ['SA','SU'].includes(d)))
        return '주말마다';
      return interval === 1 ? '매일' : `${interval}일마다`;
    }

    if (freq === 'WEEKLY') {
      const dayNames = bydays.map(d => {
        // ordinal prefix (e.g. "1MO", "-1FR")
        const m = d.match(/^(-?\d+)([A-Z]+)$/);
        if (m) {
          const ord = ORDINAL_KO[m[1]] ?? m[1] + '번째';
          return `${ord} ${KO_DAYS[m[2]] ?? m[2]}요일`;
        }
        return (KO_DAYS[d] ?? d) + '요일';
      });
      const prefix = interval === 1 ? '매주' : `${interval}주마다`;
      return dayNames.length
        ? `${prefix} ${dayNames.join(', ')}`
        : prefix;
    }

    if (freq === 'MONTHLY') {
      if (bydays.length > 0) {
        const dayStr = bydays.map(d => {
          const m = d.match(/^(-?\d+)([A-Z]+)$/);
          if (m) {
            const ord = ORDINAL_KO[m[1]] ?? m[1] + '번째';
            return `${ord} ${KO_DAYS[m[2]] ?? m[2]}요일`;
          }
          return (KO_DAYS[d] ?? d) + '요일';
        }).join(', ');
        return `매월 ${dayStr}`;
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
