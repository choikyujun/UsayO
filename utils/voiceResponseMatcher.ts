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
// 취소 계열: 취소, 아니, 아니요, 아니야, 안돼, 그만, 됐어, 싫어 …
const CONFIRM_NEG_RE = /아니|취소|그만|싫어|하지\s*마|안\s*(해|돼|할래|저장|돼요|되)|안돼|됐어|됐어요|필요\s*없|(^|\s)no(\s|$|\.)|ㄴㄴ/i;
// 저장 계열: 저장, 네, 응, 맞아, 맞아요, 그래, 확인, 좋아, 오케이, 예 …
const CONFIRM_POS_RE = /저장|등록|해\s*줘|그래|맞아|맞습니다|맞어|맞아요|오케이|오케|okay|(^|\s)ok(\s|$|\.)|좋아|좋아요|확인|예스|yes|ㅇㅇ|ㅇㅋ|(^|\s)(응+|어+|네+|예+)([\s~.!?]*$|[\s~.!?])/i;

// 문장부호·기호 제거 + 공백 정리 + 소문자. STT가 "저장." "네, " "응~"처럼 문장부호를
// 붙여 보내도 판정이 흔들리지 않게 정규화한다.
export function normalizeConfirm(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/[.,!?~…"'`·。、！？:;]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// 공백·문장부호를 제거한 실질 길이. 확인 응답은 본질적으로 짧다는 전제를 재는 자.
export function compactLength(s: string): number {
  return (s ?? '').replace(/[\s.,!?~…"'·]/g, '').length;
}

// 취소로 인정할 최대 실질 길이. CONFIRM_NEG_RE는 **부분 문자열** 매칭이라
// 긴 환각 문장에 '아니'가 섞이기만 해도 걸린다 → 길이로 가른다.
const CANCEL_MAX_CHARS = 8;

// 확인 대기 응답 판정. 매칭 실패는 'unknown'(재질문/버튼 대기) — 절대 새 일정으로 흐르지 않음.
// 원본(트림)과 정규화본을 모두 검사 → 문장부호/공백 변형에 관대. 부정 우선(안전한 쪽).
export function confirmResponseKind(transcript: string): 'confirm' | 'cancel' | 'unknown' {
  const raw = (transcript ?? '').trim().toLowerCase();
  const norm = normalizeConfirm(transcript);
  if (!raw && !norm) return 'unknown';
  // 부정 우선은 유지하되, 길이를 넘으면 'confirm'으로 흘려보내지 않고 'unknown'으로 멈춘다.
  // (넘겨보내면 같은 환각 문장 안의 긍정 키워드가 저장으로 뒤집을 수 있다 — 더 나쁜 실패다.)
  if (CONFIRM_NEG_RE.test(raw) || CONFIRM_NEG_RE.test(norm)) {
    return compactLength(raw) <= CANCEL_MAX_CHARS ? 'cancel' : 'unknown';
  }
  if (CONFIRM_POS_RE.test(raw) || CONFIRM_POS_RE.test(norm)) return 'confirm';
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

// ── 취소 전용 임계 (B3) ──────────────────────────────────────────
// 취소는 사용자의 일정을 조용히 버리는 동작이라 confirm보다 엄격하게 받는다.
// confirm 쪽 임계(CONFIRM_MIN_CONFIDENCE / CONFIRM_MAX_NO_SPEECH)는 건드리지 않는다.
const CANCEL_MIN_CONFIDENCE = 0.6;   // confirm 0.5보다 높게
const CANCEL_MAX_NO_SPEECH  = 0.4;   // confirm 0.6보다 낮게(=더 엄격)

// 취소 키워드가 매칭됐을 때 추가로 통과해야 하는 문턱. 실패 사유를 돌려준다(통과면 null).
function cancelGateReason(stt: STTResult): string | null {
  if (stt.confidence > 0 && stt.confidence < CANCEL_MIN_CONFIDENCE) {
    return `cancel_conf=${stt.confidence.toFixed(2)}`;
  }
  if ((stt.noSpeechProb ?? 0) > CANCEL_MAX_NO_SPEECH) {
    return `cancel_no_speech=${(stt.noSpeechProb ?? 0).toFixed(2)}`;
  }
  return null;
}

// unknown의 성격. 호출부가 '재질문이 도움이 될지'를 판단하는 근거다.
//   hard       — 환각/무음/저신뢰가 확실. 같은 환경에서 재질문해도 결과가 같을 것이다.
//   soft       — 신호는 애매하지만 다시 들으면 나아질 수 있다.
//   no-keyword — 음성은 또렷한데 확인 키워드가 없다. 재질문이 가장 잘 듣는 경우.
export type ConfirmUnknownKind = 'hard' | 'soft' | 'no-keyword';

// 재질문으로 회복 불가하다고 보는 신호. 무음 확률 초과 / 길이 초과 / 저신뢰(취소 전용 포함).
const HARD_REJECT_RE = /^(no_speech|len|conf|cancel_no_speech|cancel_conf)=/;

function unknownKindOf(reason?: string): ConfirmUnknownKind {
  if (!reason) return 'soft';
  if (reason === 'no-keyword') return 'no-keyword';
  return HARD_REJECT_RE.test(reason) ? 'hard' : 'soft';
}

export interface ConfirmEval {
  action: MultiConfirmResponse;
  reason?: string;
  /** action==='unknown'일 때만 의미 있다. 재질문 여부 분기에 쓴다. */
  unknownKind?: ConfirmUnknownKind;
}

// 소프트 환경 신호(무음/길이/로그확률/압축비) 오탐. 이 신호들은 '긴 환각'을 잡으려는 것이라,
// 짧고 신뢰도 높은 정당한 확인("저장.")까지 버리는 오탐을 낸다. 하드 게이트(empty/len 초과/저신뢰)와
// 구분해, 키워드가 명확히 매칭되는 짧은 확인은 이 신호로 거부하지 않는다.
const SOFT_REJECT_RE = /^(no_speech|duration|avg_logprob|compression)=/;

// 카드(멀티/단일) 확인 응답: 환각 방어 → confirm/cancel/unknown.
export function evaluateConfirmSTT(stt: STTResult): ConfirmEval {
  const raw = (stt.transcript ?? '').trim();
  const normalized = normalizeConfirm(raw);
  const kind = confirmResponseKind(raw);
  const v = hallucinationVerdict(stt);

  if (!v.ok) {
    // [B1] 환각 판정을 취소만 우회하던 예외를 제거했다.
    // 종전에는 "취소는 안전한 쪽"이라며 no_speech/저신뢰/길이초과를 전부 무시하고 cancel을
    // 확정했다. 그 전제(잘못 저장하는 것이 최악)는 소음 환경에서 뒤집혔다 — 사용자가
    // 받아쓰게 한 일정이 조용히 사라지는 쪽이 더 큰 피해였다. 이제 취소도 unknown으로 떨어진다.
    //
    // 소프트 신호 오탐 구제는 confirm 전용으로 종전 그대로 둔다(이번 수정은 취소만 조인다).
    const confOk = !(stt.confidence > 0 && stt.confidence < CONFIRM_MIN_CONFIDENCE);
    const compact = compactLength(raw);
    if (kind === 'confirm' && compact > 0 && compact <= CONFIRM_MAX_CHARS
        && confOk && v.reason && SOFT_REJECT_RE.test(v.reason)) {
      console.log(`[Confirm] 소프트신호 오탐 무시 — raw=${JSON.stringify(raw)} normalized=${JSON.stringify(normalized)} reason=${v.reason} → confirm`);
      return { action: 'confirm' };
    }
    console.log(`[Confirm] 판정 실패 — raw=${JSON.stringify(raw)} normalized=${JSON.stringify(normalized)} reason=${v.reason}`);
    return { action: 'unknown', reason: v.reason, unknownKind: unknownKindOf(v.reason) };
  }

  // [B3] 환각 방어를 통과했더라도 취소는 한 겹 더 받는다 — confirm 임계는 그대로 둔다.
  if (kind === 'cancel') {
    const gate = cancelGateReason(stt);
    if (gate) {
      console.log(`[Confirm] 취소 보류 — raw=${JSON.stringify(raw)} normalized=${JSON.stringify(normalized)} reason=${gate}`);
      return { action: 'unknown', reason: gate, unknownKind: unknownKindOf(gate) };
    }
  }

  if (kind === 'unknown') {
    console.log(`[Confirm] 판정 실패 — raw=${JSON.stringify(raw)} normalized=${JSON.stringify(normalized)} reason=no-keyword`);
    return { action: 'unknown', reason: 'no-keyword', unknownKind: 'no-keyword' };
  }
  return { action: kind };
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
