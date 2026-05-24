import { supabase } from '../../lib/supabase';
import type { TimeSlot, WokyTokyWorkHours } from '../../types/team';

const WOKYTOKY_URL = process.env.EXPO_PUBLIC_WOKYTOKY_URL;
const WOKYTOKY_ANON_KEY = process.env.EXPO_PUBLIC_WOKYTOKY_ANON_KEY;

export class WokyTokyService {
  /**
   * 해당 유저의 특정 날짜 출퇴근 시간 조회.
   * 같은 Supabase 인스턴스이면 wokytoky_work_schedule 뷰를 직접 읽고,
   * 별도 인스턴스이면 WokyToky REST API를 사용한다.
   */
  async getWorkHours(userId: string, date: string): Promise<WokyTokyWorkHours | null> {
    if (WOKYTOKY_URL && WOKYTOKY_ANON_KEY) {
      return this._fetchFromRemote(userId, date);
    }
    return this._fetchFromView(userId, date);
  }

  /**
   * 빈 슬롯 리스트를 근무 시간으로 클리핑한다.
   * 근태 데이터가 없으면 슬롯을 그대로 반환 (데이터 없음 = 제약 없음).
   */
  async clipToWorkHours(slots: TimeSlot[], userId: string, date: string): Promise<TimeSlot[]> {
    const hours = await this.getWorkHours(userId, date);
    if (!hours?.clockIn || !hours?.clockOut) return slots;

    const workStart = new Date(hours.clockIn);
    const workEnd   = new Date(hours.clockOut);

    return slots
      .map((slot) => {
        const start = new Date(slot.start) < workStart ? workStart : new Date(slot.start);
        const end   = new Date(slot.end)   > workEnd   ? workEnd   : new Date(slot.end);
        if (start >= end) return null;
        const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60_000);
        return { start: start.toISOString(), end: end.toISOString(), durationMinutes };
      })
      .filter((s): s is TimeSlot => s !== null);
  }

  /**
   * WokyToky에서 해당 날짜의 팀 근무 일정을 가져와
   * "퇴근 후" 기본 시간을 계산한다 (팀 전체 퇴근 + 30분).
   */
  async getTeamAfterWorkTime(teamId: string, date: string): Promise<string | null> {
    // 팀원 목록 조회
    const { data: members } = await supabase
      .from('team_members')
      .select('user_id')
      .eq('team_id', teamId);

    if (!members?.length) return null;

    const clockOuts = await Promise.all(
      members.map(async (m) => {
        const hours = await this.getWorkHours(m.user_id, date);
        return hours?.clockOut ? new Date(hours.clockOut).getTime() : null;
      })
    );

    const valid = clockOuts.filter((t): t is number => t !== null);
    if (!valid.length) return null;

    // 가장 늦은 퇴근 시간 + 30분
    const latest = new Date(Math.max(...valid) + 30 * 60_000);
    return latest.toISOString();
  }

  // ── 내부 구현 ─────────────────────────────────────────────────────

  private async _fetchFromView(userId: string, date: string): Promise<WokyTokyWorkHours | null> {
    try {
      const { data } = await (supabase as any)
        .from('wokytoky_work_schedule')
        .select('user_id, date, clock_in, clock_out')
        .eq('user_id', userId)
        .eq('date', date)
        .single();

      if (!data) return null;
      return {
        userId: data.user_id,
        date: data.date,
        clockIn:  data.clock_in  ? new Date(data.clock_in).toISOString()  : null,
        clockOut: data.clock_out ? new Date(data.clock_out).toISOString() : null,
      };
    } catch {
      return null;
    }
  }

  private async _fetchFromRemote(userId: string, date: string): Promise<WokyTokyWorkHours | null> {
    try {
      const res = await fetch(
        `${WOKYTOKY_URL}/rest/v1/attendance?worker_id=eq.${userId}&date=eq.${date}&select=*`,
        {
          headers: {
            apikey: WOKYTOKY_ANON_KEY!,
            Authorization: `Bearer ${WOKYTOKY_ANON_KEY}`,
          },
        }
      );
      if (!res.ok) return null;
      const [row] = await res.json();
      if (!row) return null;
      return {
        userId,
        date,
        clockIn:  row.clock_in  ? new Date(row.clock_in).toISOString()  : null,
        clockOut: row.clock_out ? new Date(row.clock_out).toISOString() : null,
      };
    } catch {
      return null;
    }
  }
}

export const wokyTokyService = new WokyTokyService();
