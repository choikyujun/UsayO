import { Event } from '../types/database';

export interface EventPosition {
  id: string;
  top: number;    // content-relative Y px (top of row)
  bottom: number; // content-relative Y px (bottom of row)
  endAt: string;  // ISO8601 — used as anchor for new start time
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

export function snapTo30Minutes(date: Date): Date {
  const snapped = new Date(date);
  const mins = snapped.getMinutes();
  const rounded = mins < 15 ? 0 : mins < 45 ? 30 : 60;
  snapped.setMinutes(rounded, 0, 0);
  return snapped;
}

export function hasConflict(
  candidateStart: Date,
  candidateEnd: Date,
  events: Event[],
  excludeId: string,
): boolean {
  const s = candidateStart.getTime();
  const e = candidateEnd.getTime();
  return events.some(ev => {
    if (ev.id === excludeId) return false;
    const evS = new Date(ev.start_at).getTime();
    const evE = new Date(ev.end_at).getTime();
    return s < evE && e > evS;
  });
}

/**
 * Converts a drop position (content-relative Y) to a snapped, conflict-free start time.
 *
 * Algorithm:
 * 1. Find the event whose row is just above the drop point → use its end_at as the anchor.
 * 2. If no event is above → use NOW + 1 minute as anchor.
 * 3. Snap anchor to nearest 30-minute boundary.
 * 4. If that slot conflicts with another event, push forward to that event's end_at (snapped).
 * 5. Never return a time in the past (clamp to NOW + 30 min if needed).
 */
export function calculateNewTime(
  dropContentY: number,
  positions: EventPosition[],
  events: Event[],
  excludeId: string,
  durationMs: number,
): Date {
  const sorted = [...positions].sort((a, b) => a.bottom - b.bottom);
  const above = sorted.filter(p => p.bottom <= dropContentY);
  const anchor = above.length > 0
    ? new Date(above[above.length - 1].endAt)
    : addMinutes(new Date(), 1);

  let candidate = snapTo30Minutes(anchor);

  // Clamp to future
  const floor = addMinutes(new Date(), 30);
  if (candidate.getTime() < floor.getTime()) candidate = snapTo30Minutes(floor);

  // Resolve conflicts by bumping forward
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidateEnd = new Date(candidate.getTime() + durationMs);
    if (!hasConflict(candidate, candidateEnd, events, excludeId)) break;

    // Find the conflicting event that ends latest
    const conflicting = events.filter(ev => {
      if (ev.id === excludeId) return false;
      const evS = new Date(ev.start_at).getTime();
      const evE = new Date(ev.end_at).getTime();
      return candidate.getTime() < evE && candidateEnd.getTime() > evS;
    });
    if (conflicting.length === 0) break;

    const latestEnd = conflicting.reduce(
      (max, ev) => Math.max(max, new Date(ev.end_at).getTime()),
      0,
    );
    candidate = snapTo30Minutes(new Date(latestEnd));
  }

  return candidate;
}
