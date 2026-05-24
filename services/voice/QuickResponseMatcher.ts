export type QuickResponseResult = 'positive' | 'negative' | 'unknown';

// Matches common Korean/English yes/no at the START of the utterance.
const POSITIVE_RE =
  /^(네|응|예|맞아요?|그래|오케이|ok|yes|확인|맞습니다|좋아요?|저장|등록|ㅇㅇ|ㅇ)[\s.!?]*$/i;

const NEGATIVE_RE =
  /^(아니(야|요|다|오)?|취소|다시|no|잘못됐어|틀려|틀렸어|다르다|다르게|아닌데|ㄴㄴ|아냐)[\s.!?]*$/i;

export function matchQuickResponse(text: string): QuickResponseResult {
  const t = text.trim().toLowerCase();
  if (POSITIVE_RE.test(t)) return 'positive';
  if (NEGATIVE_RE.test(t)) return 'negative';
  return 'unknown';
}
