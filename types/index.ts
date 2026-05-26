// ── 기존 타입 (backward compat) ───────────────────────────────
export type VoiceIntent = 'CREATE' | 'UPDATE' | 'DELETE' | 'QUERY';

export interface ParsedDateTime {
  date: string;             // ISO8601
  isRecurring: boolean;
  recurrenceRule?: string;  // RRULE 형식
  recurrenceUntil?: string; // 종료일 ISO8601 (없으면 무한)
  confidence: number;       // 0~1
  originalText?: string;    // "내일 오후 3시"
}

export interface VoiceCommand {
  intent: VoiceIntent;
  title?: string;
  parsedDateTime?: ParsedDateTime;
  targetEventId?: string;
  rawText: string;
  confidence: number;
}

export interface Schedule {
  id: string;
  user_id: string;
  title: string;
  start_at: string;
  end_at?: string;
  is_recurring: boolean;
  recurrence_rule?: string;
  created_at: string;
  updated_at: string;
}

// ── 신규 타입 (PROMPT_03+) ────────────────────────────────────

export interface STTResult {
  transcript: string;
  confidence: number;     // 0~1
  language: string;
  alternatives?: Array<{ transcript: string; confidence: number }>;
}

export type IntentType = 'CREATE' | 'UPDATE' | 'DELETE' | 'QUERY' | 'NAVIGATION' | 'RESCHEDULE_UNDO' | 'UNKNOWN';
export type NavigationTarget = 'today' | 'calendar' | 'upcoming' | 'settings';

export interface ClassifiedIntent {
  intent: IntentType;
  confidence: number;
  // CREATE
  title?: string;
  startDateTime?: ParsedDateTime;
  endDateTime?: ParsedDateTime;
  location?: string;
  notes?: string;
  attendees?: string[];
  category?: 'work' | 'personal' | 'important';
  // UPDATE
  targetEventQuery?: string;
  updateFields?: {
    startDateTime?: ParsedDateTime;
    title?: string;
    location?: string;
  };
  // DELETE
  deleteTargetQuery?: string;
  // QUERY
  queryRange?: { start: string; end: string };
  queryType?: 'list' | 'free_slots' | 'specific';
  // NAVIGATION
  navigationTarget?: NavigationTarget;
  // 복수 일정 (발화에 2개 이상 일정 포함 시)
  events?: ClassifiedIntent[];
  // 원본
  rawTranscript?: string;
}

export type VoicePhase =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'confirming'
  | 'disambiguating'  // UPDATE/DELETE: 복수 후보 선택
  | 'success'
  | 'fail';

export type { MatchResult } from '../services/voice/EventMatcher';

// VoiceMicButton 호환 status
export type MicStatus = 'idle' | 'preparing' | 'recording' | 'processing';

// ── PROMPT_06: 소음 감지 + 하이브리드 입력 ─────────────────────

export interface NoiseAnalysis {
  level: 'quiet' | 'moderate' | 'loud';
  snr: number;                            // dB 추정 (높을수록 신호 우세)
  recommendation: 'voice' | 'hybrid' | 'text';
  warningMessage?: string;
}

export interface HybridInputState {
  prefillText: string;                    // STT 결과로 미리 채운 텍스트
  isVoiceMode: boolean;
  fallbackReason: 'noise' | 'low_confidence' | 'user_choice';
}
