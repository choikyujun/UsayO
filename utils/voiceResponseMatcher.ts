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

export function matchMultiConfirmResponse(transcript: string): MultiConfirmResponse {
  const text = transcript.trim();
  if (!text) return 'unknown';
  const cancelTest  = /취소|아니|그만|싫어|안\s*해/.test(text);
  const confirmTest = /저장|네|맞아|응|그래|확인|좋아|맞습니다|맞아요|ㅇㅇ|오케이|ok/i.test(text);
  if (cancelTest)  return 'cancel';
  if (confirmTest) return 'confirm';
  return 'unknown';
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
