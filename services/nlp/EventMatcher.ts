import { findScheduleCandidates } from '../../lib/schedules';
import { Database } from '../../types/database';
// PROMPT_05에서 퍼지 매칭 + 다중 후보 선택 플로우로 확장 예정

type Schedule = Database['public']['Tables']['schedules']['Row'];

export async function matchSchedule(date: string, keyword?: string): Promise<Schedule[]> {
  return findScheduleCandidates(date, keyword);
}
