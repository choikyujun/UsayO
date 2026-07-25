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

export function matchNotificationOffset(transcript: string): NotifOffsetMatch {
  const text = transcript.trim();
  if (!text) return { type: 'unknown' };
  if (/취소|그만|닫아/.test(text)) return { type: 'cancel' };
  if (/없음|안\s*함|안\s*해|꺼줘|끄기|알림\s*없음|알림\s*꺼/.test(text)) return { type: 'offset', offsetMinutes: null };
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
