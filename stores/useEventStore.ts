import { create } from 'zustand';
import { Database } from '../types/database';

type Schedule = Database['public']['Tables']['schedules']['Row'];

interface EventStore {
  schedules: Schedule[];
  selectedDate: string;
  setSchedules: (schedules: Schedule[]) => void;
  setSelectedDate: (date: string) => void;
  addSchedule: (schedule: Schedule) => void;
  updateSchedule: (id: string, patch: Partial<Schedule>) => void;
  removeSchedule: (id: string) => void;
}

export const useEventStore = create<EventStore>((set) => ({
  schedules: [],
  selectedDate: new Date().toISOString().split('T')[0],
  setSchedules: (schedules) => set({ schedules }),
  setSelectedDate: (selectedDate) => set({ selectedDate }),
  addSchedule: (schedule) =>
    set((s) => ({ schedules: [...s.schedules, schedule].sort((a, b) => a.start_at.localeCompare(b.start_at)) })),
  updateSchedule: (id, patch) =>
    set((s) => ({ schedules: s.schedules.map((e) => (e.id === id ? { ...e, ...patch } : e)) })),
  removeSchedule: (id) =>
    set((s) => ({ schedules: s.schedules.filter((e) => e.id !== id) })),
}));
