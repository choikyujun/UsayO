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
  // 환각 판별 신호 (verbose_json에서 추출, 확인 응답 방어용)
  avgLogprob?: number;        // 평균 로그확률 (낮을수록 저신뢰; < -1.0 환각 의심)
  compressionRatio?: number;  // 최대 압축비 (높을수록 반복; > 2.4 환각 의심)
  noSpeechProb?: number;      // 평균 무음 확률 (높은데 텍스트 있으면 환각)
  durationSec?: number;       // 오디오 길이(초)
}

export type IntentType = 'CREATE' | 'UPDATE' | 'DELETE' | 'COMPLETE' | 'QUERY' | 'NAVIGATION' | 'RESCHEDULE_UNDO' | 'NOTIFICATION_UPDATE' | 'UNKNOWN';
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
  // COMPLETE
  completeTargetQuery?: string;
  // QUERY
  queryRange?: { start: string; end: string };
  queryType?: 'list' | 'free_slots' | 'specific';
  // NAVIGATION
  navigationTarget?: NavigationTarget;
  // 복수 일정 (발화에 2개 이상 일정 포함 시)
  events?: ClassifiedIntent[];
  // LLM이 nearby events에서 직접 매칭한 이벤트 ID (UPDATE/DELETE/COMPLETE 우선 경로)
  targetEventId?: string;
  // LLM이 "다/모두/전부" 패턴으로 매칭한 복수 이벤트 ID 배열
  targetEventIds?: string[];
  // 다중 매칭 범위
  scope?: 'single' | 'all_day' | 'filtered';
  // NOTIFICATION_UPDATE
  notificationOffsetMinutes?: number | null;
  // 시간 모호성 (오전/오후 미지정 "6시" 등)
  ambiguous?: boolean;
  suggestedMeridiem?: 'AM' | 'PM';
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
