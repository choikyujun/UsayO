export const HOUR_HEIGHT   = 60;   // dp per hour
export const TIME_LABEL_W  = 44;   // width of the left time-label column
export const GRID_TOTAL_H  = HOUR_HEIGHT * 24; // 1440

// ── Coordinate helpers ───────────────────────────────────────────────
export function timeToY(hours: number, minutes = 0): number {
  return (hours + minutes / 60) * HOUR_HEIGHT;
}

export function getEventTop(startAt: string): number {
  const d = new Date(startAt);
  return timeToY(d.getHours(), d.getMinutes());
}

export function getEventHeight(startAt: string, endAt: string): number {
  const durationMin = (new Date(endAt).getTime() - new Date(startAt).getTime()) / 60_000;
  return Math.max((durationMin / 60) * HOUR_HEIGHT, 20); // minimum 20dp so short events are tappable
}

export function getNowY(): number {
  const now = new Date();
  return timeToY(now.getHours(), now.getMinutes());
}

export function yToTime(y: number): { hours: number; minutes: number } {
  const totalMin = Math.max(0, Math.round((y / HOUR_HEIGHT) * 60));
  return { hours: Math.floor(totalMin / 60) % 24, minutes: totalMin % 60 };
}

// ── Scroll target helpers ────────────────────────────────────────────
// Returns the Y to scroll to so the target is ~100dp from the top of the viewport.
export function scrollTargetForHour(hour: number): number {
  return Math.max(0, timeToY(hour) - 100);
}
