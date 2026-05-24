import { supabase } from '../../lib/supabase';
import type { TimeSlot } from '../../types/team';

interface BusyBlock {
  start: Date;
  end: Date;
}

export class TeamAvailabilityService {
  /**
   * 팀원 전체의 공통 빈 슬롯을 찾는다.
   * 각 팀원의 일정을 조회해 바쁜 시간을 합산한 뒤, 모든 팀원이 비어있는 구간을 반환.
   */
  async findCommonSlots(
    teamId: string,
    range: { start: string; end: string },
    minDurationMinutes = 30,
  ): Promise<TimeSlot[]> {
    // 1. 팀원 목록 조회
    const { data: members } = await supabase
      .from('team_members')
      .select('user_id')
      .eq('team_id', teamId);

    if (!members || members.length === 0) return [];

    const memberIds = members.map((m) => m.user_id);

    // 2. 해당 기간 모든 팀원의 이벤트 조회
    const { data: events } = await supabase
      .from('events')
      .select('user_id, start_at, end_at')
      .in('user_id', memberIds)
      .gte('start_at', range.start)
      .lte('end_at', range.end)
      .is('deleted_at', null);

    // 3. 유저별 바쁜 블록 맵
    const busyMap = new Map<string, BusyBlock[]>();
    for (const id of memberIds) busyMap.set(id, []);

    for (const ev of events ?? []) {
      const list = busyMap.get(ev.user_id);
      if (list) {
        list.push({ start: new Date(ev.start_at), end: new Date(ev.end_at) });
      }
    }

    // 4. 모든 팀원이 바쁜 시간의 합집합 (union of all busy blocks)
    const allBusy = mergeBlocks(
      Array.from(busyMap.values()).flat()
    );

    // 5. 탐색 범위에서 바쁜 시간을 빼면 빈 슬롯
    const rangeStart = new Date(range.start);
    const rangeEnd = new Date(range.end);

    return gapSlots(rangeStart, rangeEnd, allBusy)
      .filter((s) => s.durationMinutes >= minDurationMinutes);
  }

  /**
   * 특정 사용자의 특정 날짜 빈 슬롯을 반환 (단일 사용자용 AI 제안에 사용)
   */
  async findUserFreeSlots(
    userId: string,
    date: string,
    minDurationMinutes = 30,
  ): Promise<TimeSlot[]> {
    const from = `${date}T00:00:00.000Z`;
    const to   = `${date}T23:59:59.999Z`;

    const { data: events } = await supabase
      .from('events')
      .select('start_at, end_at')
      .eq('user_id', userId)
      .gte('start_at', from)
      .lte('end_at', to)
      .is('deleted_at', null);

    const busy = mergeBlocks(
      (events ?? []).map((e) => ({
        start: new Date(e.start_at),
        end: new Date(e.end_at),
      }))
    );

    return gapSlots(new Date(from), new Date(to), busy)
      .filter((s) => s.durationMinutes >= minDurationMinutes);
  }
}

// ── 내부 헬퍼 ─────────────────────────────────────────────────────

function mergeBlocks(blocks: BusyBlock[]): BusyBlock[] {
  if (blocks.length === 0) return [];
  const sorted = [...blocks].sort((a, b) => a.start.getTime() - b.start.getTime());
  const merged: BusyBlock[] = [{ ...sorted[0] }];

  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    if (sorted[i].start <= last.end) {
      last.end = sorted[i].end > last.end ? sorted[i].end : last.end;
    } else {
      merged.push({ ...sorted[i] });
    }
  }
  return merged;
}

function gapSlots(rangeStart: Date, rangeEnd: Date, busy: BusyBlock[]): TimeSlot[] {
  const slots: TimeSlot[] = [];
  let cursor = rangeStart;

  for (const block of busy) {
    if (block.start > cursor) {
      slots.push(makeSlot(cursor, block.start));
    }
    if (block.end > cursor) cursor = block.end;
  }

  if (cursor < rangeEnd) {
    slots.push(makeSlot(cursor, rangeEnd));
  }

  return slots;
}

function makeSlot(start: Date, end: Date): TimeSlot {
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    durationMinutes: Math.round((end.getTime() - start.getTime()) / 60_000),
  };
}

export const teamAvailabilityService = new TeamAvailabilityService();
