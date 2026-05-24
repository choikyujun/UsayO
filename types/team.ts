import type { EventRequest, Team, TeamEvent, TeamInvite, TeamMember } from './database';

export type { Team, TeamMember, EventRequest, TeamEvent, TeamInvite };

export type TeamRole = 'owner' | 'admin' | 'member';

export interface TimeSlot {
  start: string; // ISO 8601
  end: string;
  durationMinutes: number;
}

export interface TeamMemberWithProfile extends TeamMember {
  profile?: {
    name: string | null;
    avatar_url: string | null;
  };
}

export interface EventRequestInput {
  teamId?: string;
  targetUserId: string;
  title: string;
  startAt: string;
  endAt: string;
  location?: string;
  note?: string;
}

export interface TeamEventInput {
  teamId: string;
  title: string;
  description?: string;
  startAt: string;
  endAt: string;
  location?: string;
  scope?: 'broadcast' | 'optional';
}

// WokyToky integration types
export interface WokyTokyWorkHours {
  userId: string;
  date: string;
  clockIn: string | null;   // ISO 8601
  clockOut: string | null;  // ISO 8601
}
