import { useMemo } from 'react';
import { Event } from '../types/database';
import {
  getPeriod, isEventPast, isLunchHour, localDateStr, Period, todayDateStr,
} from '../utils/timeHelpers';
import { isKoreanHoliday } from './useHolidays';

// ── Flat list item types ──────────────────────────────────────────────────

export type GroupItem     = { type: 'group';       key: string; label: Period };
export type NowItem       = { type: 'now';         key: string; timeStr: string };
export type EventItem     = {
  type:       'event';
  key:        string;
  event:      Event;
  isPast:     boolean;
  isNext:     boolean;
  isLunch:    boolean;
  isHoliday:  boolean;
  isLunar:    boolean;
};
export type DateHeaderItem = { type: 'date-header'; key: string; label: string };
export type EmptyItem      = { type: 'empty-today'; key: string };

export type FlatItem = GroupItem | NowItem | EventItem | DateHeaderItem | EmptyItem;

// ── Helpers ───────────────────────────────────────────────────────────────

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function dateSectionLabel(ds: string): string {
  const today    = todayDateStr();
  const tom      = new Date(); tom.setDate(tom.getDate() + 1);
  const tomStr   = localDateStr(tom);
  if (ds === today)   return '오늘';
  if (ds === tomStr)  return '내일';
  const d = new Date(ds + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()} (${WEEKDAYS[d.getDay()]})`;
}

function nowTimeStr(): string {
  const now = new Date();
  return `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function hasLunarMarker(e: Event): boolean {
  return (
    e.title.includes('음력') ||
    (e.voice_transcript?.includes('음력') ?? false)
  );
}

// ── Main hook ─────────────────────────────────────────────────────────────

// selectedDate: the date whose events are shown. Defaults to today.
// When selectedDate === today, the "지금" now-indicator is shown.
export function useEventGrouping(events: Event[], selectedDate?: string): FlatItem[] {
  return useMemo(() => {
    const isToday = !selectedDate || selectedDate === todayDateStr();
    const now   = new Date();
    const nowMs = now.getTime();

    const items: FlatItem[] = [];

    if (events.length === 0) {
      items.push({ type: 'empty-today', key: 'empty-today' });
      return items;
    }

    const sorted = [...events].sort(
      (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime(),
    );
    const nextEvent = isToday ? sorted.find(e => !isEventPast(e.end_at)) : null;
    let nowInserted = false;

    for (const period of ['오전', '오후', '저녁'] as Period[]) {
      const periodEvts = sorted.filter(e => getPeriod(new Date(e.start_at)) === period);
      if (periodEvts.length === 0) continue;

      items.push({ type: 'group', key: `group-${period}`, label: period });

      for (const event of periodEvts) {
        const startMs = new Date(event.start_at).getTime();

        // Insert "지금" indicator only for today's view
        if (isToday && !nowInserted && startMs > nowMs) {
          items.push({ type: 'now', key: 'now', timeStr: nowTimeStr() });
          nowInserted = true;
        }

        items.push({
          type:      'event',
          key:       `event-${event.id}`,
          event,
          isPast:    isToday ? isEventPast(event.end_at) : false,
          isNext:    event.id === nextEvent?.id,
          isLunch:   isLunchHour(new Date(event.start_at)),
          isHoliday: isKoreanHoliday(new Date(event.start_at)),
          isLunar:   hasLunarMarker(event),
        });
      }

      if (isToday && !nowInserted) {
        const periodEndH = period === '오전' ? 12 : period === '오후' ? 18 : 24;
        if (now.getHours() < periodEndH) {
          items.push({ type: 'now', key: 'now', timeStr: nowTimeStr() });
          nowInserted = true;
        }
      }
    }

    return items;
  }, [events, selectedDate]);
}
