import { STTResult } from '../types';
import { NOTIF_OFF } from './notificationHelpers';

export type AmbiguousResponse = 'confirm' | 'am' | 'pm' | 'cancel' | 'unknown';
export type MultiConfirmResponse = 'confirm' | 'cancel' | 'unknown';
export type NotifOffsetMatch =
  | { type: 'offset'; offsetMinutes: number | null }
  | { type: 'cancel' }
  | { type: 'unknown' };

export function matchAmbiguousResponse(transcript: string): AmbiguousResponse {
  const text = transcript.trim();
  console.log('[Matcher] input:', JSON.stringify(transcript));
  if (!text) {
    console.log('[Matcher] return: unknown (empty)');
    return 'unknown';
  }

  const cancelTest = /취소|아니|다시|그만|싫어/.test(text);
  const amTest     = /오전|아침|새벽|am/i.test(text);
  const pmTest     = /오후|저녁|밤|pm/i.test(text);
  const confirmTest = /네|맞아|오케이|ok|응|그래|확인|좋아|맞습니다|맞아요|ㅇㅇ/i.test(text);
  console.log('[Matcher] AM test:', amTest, '| PM test:', pmTest, '| cancel test:', cancelTest, '| confirm test:', confirmTest);

  let result: AmbiguousResponse;
  if (cancelTest)       result = 'cancel';
  else if (amTest)      result = 'am';
  else if (pmTest)      result = 'pm';
  else if (confirmTest) result = 'confirm';
  else                  result = 'unknown';

  console.log('[Matcher] return:', result);
  return result;
}

// ── 확인 응답 공통 매칭 ────────────────────────────────────────────
// 키워드 "포함" 방식(발화 전체가 아니라 핵심 키워드 유무로 판정) + 부정 우선.
// STT가 "응 저장해줘"처럼 붙여쓰거나 노이즈를 섞어도 인식. 조사·어미 변형("응." "어~" "그래그래")에 관대.
// 부정을 먼저 검사 → "저장 안 해" 같은 발화가 긍정으로 오인되지 않음.
const CONFIRM_NEG_RE = /아니|취소|그만|싫어|하지\s*마|안\s*(해|돼|할래|저장)|됐어|필요\s*없|(^|\s)no(\s|$|\.)|ㄴㄴ/i;
const CONFIRM_POS_RE = /저장|등록|해\s*줘|그래|맞아|맞습니다|맞어|오케이|오케|okay|(^|\s)ok(\s|$|\.)|좋아|좋아요|확인|예스|yes|ㅇㅇ|ㅇㅋ|(^|\s)(응+|어+|네+|예)([\s~.!?]*$|[\s~.!?])/i;

// 확인 대기 응답 판정. 매칭 실패는 'unknown'(재질문/버튼 대기) — 절대 새 일정으로 흐르지 않음.
export function confirmResponseKind(transcript: string): 'confirm' | 'cancel' | 'unknown' {
  const t = (transcript ?? '').trim().toLowerCase();
  if (!t) return 'unknown';
  if (CONFIRM_NEG_RE.test(t)) return 'cancel';
  if (CONFIRM_POS_RE.test(t)) return 'confirm';
  return 'unknown';
}

export function matchMultiConfirmResponse(transcript: string): MultiConfirmResponse {
  const kind = confirmResponseKind(transcript);
  console.log('[Matcher/Multi] input:', JSON.stringify(transcript), '→', kind);
  return kind;
}

// ── 확인 응답 환각 방어 ────────────────────────────────────────────
// 확인(저장/취소)은 되돌리기 어려운 동작 → 키워드 매칭 전에 환각 신호를 엄격히 거른다.
// 정상 응답("응/그래/오케이/저장해줘/아니")은 통과, 환각("그래. 캠핑을 다닌 사람이…")은 거부.
const CONFIRM_MAX_CHARS = 8;          // [3] 공백·문장부호 제거 후 이보다 길면 환각(확인 응답은 본질적으로 짧음)
const CONFIRM_MIN_CONFIDENCE = 0.5;   // 저신뢰 매칭 거부(되돌리기 어려운 동작이라 0.4→0.5 상향)
const HALLUCINATION_MIN_AVG_LOGPROB = -1.0;  // [2] 이보다 낮으면 저신뢰/환각
const HALLUCINATION_MAX_COMPRESSION = 2.4;   // [2] 이보다 높으면 반복/환각
const CONFIRM_MAX_NO_SPEECH = 0.6;    // [4] 무음 확률 높은데 텍스트 있으면 환각
const CONFIRM_MIN_DURATION_SEC = 0.35; // [4] 극히 짧은 오디오에 긴 텍스트 = 물리적 불가

// ── 공통 환각 방어 ──────────────────────────────────────────────
// 확인성 음성 응답(카드 confirm/cancel, AM/PM am/pm/cancel)에서 키워드 매칭 전에
// 환각 신호를 거르는 공통 판정. 통과(ok)면 raw(정규화 전 트림 텍스트)를 함께 반환.
export interface HallucinationVerdict { ok: boolean; reason?: string; raw: string }
export interface HallucinationOpts { minConfidence?: number; maxChars?: number }

export function hallucinationVerdict(stt: STTResult, opts?: HallucinationOpts): HallucinationVerdict {
  const minConf = opts?.minConfidence ?? CONFIRM_MIN_CONFIDENCE;
  const maxChars = opts?.maxChars ?? CONFIRM_MAX_CHARS;
  const raw = (stt.transcript ?? '').trim();
  if (!raw) return { ok: false, reason: 'empty', raw };
  // [4] 무음/이상
  if ((stt.noSpeechProb ?? 0) > CONFIRM_MAX_NO_SPEECH) {
    return { ok: false, reason: `no_speech=${(stt.noSpeechProb ?? 0).toFixed(2)}`, raw };
  }
  if (stt.durationSec !== undefined && stt.durationSec < CONFIRM_MIN_DURATION_SEC) {
    return { ok: false, reason: `duration=${stt.durationSec.toFixed(2)}s`, raw };
  }
  // [2] 환각 신호
  if (stt.avgLogprob !== undefined && stt.avgLogprob < HALLUCINATION_MIN_AVG_LOGPROB) {
    return { ok: false, reason: `avg_logprob=${stt.avgLogprob.toFixed(2)}`, raw };
  }
  if (stt.compressionRatio !== undefined && stt.compressionRatio > HALLUCINATION_MAX_COMPRESSION) {
    return { ok: false, reason: `compression=${stt.compressionRatio.toFixed(2)}`, raw };
  }
  // [3] 길이 (핵심): 키워드 포함돼도 전체가 길면 환각
  const compact = raw.replace(/[\s.,!?~…"'·]/g, '');
  if (compact.length > maxChars) {
    return { ok: false, reason: `len=${compact.length}`, raw };
  }
  // 저신뢰 (AM/PM은 hadSpeech+프롬프트에코차단이 주 방어라 임계를 낮춤)
  if (stt.confidence > 0 && stt.confidence < minConf) {
    return { ok: false, reason: `conf=${stt.confidence.toFixed(2)}`, raw };
  }
  return { ok: true, raw };
}

export interface ConfirmEval { action: MultiConfirmResponse; reason?: string }

// 카드(멀티/단일) 확인 응답: 환각 방어 → confirm/cancel/unknown. (동작 불변 — 방어만 공통 함수로 추출)
export function evaluateConfirmSTT(stt: STTResult): ConfirmEval {
  const v = hallucinationVerdict(stt);
  if (!v.ok) return { action: 'unknown', reason: v.reason };
  return { action: confirmResponseKind(v.raw) };
}

// (AM/PM 음성 확인은 활동 시간대 규칙으로 대체되어 제거됨. 공통 유틸 confirmListen/hallucinationVerdict는 유지)

export function matchNotificationOffset(transcript: string): NotifOffsetMatch {
  const text = transcript.trim();
  if (!text) return { type: 'unknown' };
  if (/취소|그만|닫아/.test(text)) return { type: 'cancel' };
  if (/없음|안\s*함|안\s*해|꺼줘|끄기|알림\s*없음|알림\s*꺼/.test(text)) return { type: 'offset', offsetMinutes: NOTIF_OFF };
  const minM  = text.match(/(\d+)\s*분\s*전/);
  if (minM)  return { type: 'offset', offsetMinutes: parseInt(minM[1]) };
  const hourM = text.match(/(\d+)\s*시간\s*전/);
  if (hourM) return { type: 'offset', offsetMinutes: parseInt(hourM[1]) * 60 };
  const dayM  = text.match(/(\d+)\s*일\s*전/);
  if (dayM)  return { type: 'offset', offsetMinutes: parseInt(dayM[1]) * 24 * 60 };
  const weekM = text.match(/(\d+)\s*주\s*전/);
  if (weekM) return { type: 'offset', offsetMinutes: parseInt(weekM[1]) * 7 * 24 * 60 };
  if (/시작\s*시|바로\s*알림|지금\s*알림/.test(text)) return { type: 'offset', offsetMinutes: 0 };
  return { type: 'unknown' };
}
