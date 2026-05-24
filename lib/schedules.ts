import { supabase, ensureAuth } from './supabase';
import { Database } from '../types/database';

type Schedule = Database['public']['Tables']['schedules']['Row'];
type ScheduleInsert = Database['public']['Tables']['schedules']['Insert'];
type ScheduleUpdate = Database['public']['Tables']['schedules']['Update'];

export async function getSchedules(from: string, to: string): Promise<Schedule[]> {
  const { data, error } = await supabase
    .from('schedules')
    .select('*')
    .gte('start_at', from)
    .lte('start_at', to)
    .order('start_at', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function createSchedule(payload: Omit<ScheduleInsert, 'user_id'>): Promise<Schedule> {
  const userId = await ensureAuth();

  const { data, error } = await supabase
    .from('schedules')
    .insert({ ...payload, user_id: userId })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateSchedule(id: string, payload: ScheduleUpdate): Promise<Schedule> {
  const { data, error } = await supabase
    .from('schedules')
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteSchedule(id: string): Promise<void> {
  const { error } = await supabase
    .from('schedules')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

// 음성 수정/삭제용: 날짜 범위 내 후보 일정 검색
export async function findScheduleCandidates(date: string, keyword?: string): Promise<Schedule[]> {
  const dayStart = `${date}T00:00:00+09:00`;
  const dayEnd = `${date}T23:59:59+09:00`;

  let query = supabase
    .from('schedules')
    .select('*')
    .gte('start_at', dayStart)
    .lte('start_at', dayEnd)
    .order('start_at', { ascending: true });

  if (keyword) {
    query = query.ilike('title', `%${keyword}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}
