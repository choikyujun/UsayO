import { confirmResponseKind } from '../../utils/voiceResponseMatcher';

export type QuickResponseResult = 'positive' | 'negative' | 'unknown';

// 단일 확인 카드의 음성 응답 판정. 공통 매칭(confirmResponseKind)을 재사용해
// 멀티 카드와 동일한 긍정/부정 표현·변형·키워드 포함 규칙을 따른다.
// 매칭 실패는 'unknown' → 호출부(InlineConfirmCard)는 재질문/자동 타이머로 처리하며
// 응답 텍스트가 새 일정 CREATE로 흐르지 않는다.
export function matchQuickResponse(text: string): QuickResponseResult {
  const kind = confirmResponseKind(text);
  return kind === 'confirm' ? 'positive' : kind === 'cancel' ? 'negative' : 'unknown';
}
