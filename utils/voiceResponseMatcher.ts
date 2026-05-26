export type AmbiguousResponse = 'confirm' | 'am' | 'pm' | 'cancel' | 'unknown';

export function matchAmbiguousResponse(transcript: string): AmbiguousResponse {
  const text = transcript.trim();
  if (!text) return 'unknown';

  // 취소는 가장 먼저 체크 (부정이 다른 패턴과 겹칠 수 있음)
  if (/취소|아니|다시|그만|싫어/.test(text)) return 'cancel';

  // AM/PM 명시
  if (/오전|아침|새벽|\bam\b/i.test(text)) return 'am';
  if (/오후|저녁|밤|\bpm\b/i.test(text))   return 'pm';

  // 긍정 → 추정값 확정
  if (/네|맞아|오케이|ok|응|그래|확인|좋아|맞습니다|맞아요|ㅇㅇ/i.test(text)) return 'confirm';

  return 'unknown';
}
