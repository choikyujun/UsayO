// 확인 카드 취소 오판 회귀 방지.
//
// 이번 버그: 소음 환경에서 확인 TTS 잔향/주변음이 마이크로 유입 → hadSpeech가 뒤집혀 STT
// 판정 경로로 새고 → Whisper가 잡음을 환각 전사 → evaluateConfirmSTT가 cancel을 돌려
// 카드가 닫히고 일정이 조용히 사라졌다. 핵심 원인은 "환각이라고 판정한 직후에도 취소
// 키워드가 있으면 취소로 확정"하던 우회였다.
//
// 이 파일은 순수 함수만 다루므로 기존 jest 설정(ts-jest, testEnvironment node)에서 그대로 돈다.

import { evaluateConfirmSTT, confirmResponseKind } from '../utils/voiceResponseMatcher';
import type { STTResult } from '../types';

// 기본은 '깨끗한 신호' — 각 테스트가 필요한 축만 덮어쓴다.
const stt = (over: Partial<STTResult>): STTResult => ({
  transcript: '',
  confidence: 0.9,
  language: 'ko',
  avgLogprob: -0.2,
  compressionRatio: 1.2,
  noSpeechProb: 0.05,
  durationSec: 1.2,
  ...over,
});

describe('B1 — 하드 환각 신호 + 취소 키워드는 cancel이 아니다 (이번 버그의 핵심)', () => {
  test('무음 확률이 높은데 "아니"가 나온 경우 → unknown(hard)', () => {
    const r = evaluateConfirmSTT(stt({ transcript: '아니', noSpeechProb: 0.95 }));
    expect(r.action).toBe('unknown');
    expect(r.unknownKind).toBe('hard');
    expect(r.reason).toMatch(/^no_speech=/);
  });

  test('전사가 길어 환각으로 걸린 경우 → cancel로 새지 않는다', () => {
    const long = '아니 그래서 그게 말이죠 캠핑을 다닌 사람이 많더라고요';
    const r = evaluateConfirmSTT(stt({ transcript: long }));
    expect(r.action).toBe('unknown');
    expect(r.action).not.toBe('cancel');
  });

  test('로그확률이 매우 낮은 "취소" → unknown', () => {
    const r = evaluateConfirmSTT(stt({ transcript: '취소', avgLogprob: -2.0 }));
    expect(r.action).toBe('unknown');
  });

  test('압축비가 높은 반복 환각 "취소 취소 취소" → unknown', () => {
    const r = evaluateConfirmSTT(stt({ transcript: '취소취소', compressionRatio: 3.0 }));
    expect(r.action).toBe('unknown');
  });
});

describe('B2 — 취소 키워드 길이 게이트', () => {
  test('긴 문장에 "아니"가 섞이면 취소가 아니다', () => {
    expect(confirmResponseKind('아니 그래서 그게 말이죠 캠핑을 다닌 사람이')).not.toBe('cancel');
  });

  test('길이 초과 시 confirm으로 뒤집히지도 않는다 (부정 우선 유지)', () => {
    // '아니'와 '맞아'가 함께 있는 긴 환각 — 저장으로 뒤집히면 더 나쁜 실패다.
    const r = confirmResponseKind('아니 그게 맞아요 그래서 어제 거기를 갔는데');
    expect(r).toBe('unknown');
    expect(r).not.toBe('confirm');
  });

  test('짧은 취소는 그대로 인정', () => {
    expect(confirmResponseKind('아니')).toBe('cancel');
    expect(confirmResponseKind('취소')).toBe('cancel');
    expect(confirmResponseKind('취소해줘')).toBe('cancel');
  });
});

describe('B3 — 취소 전용 임계 (confirm 임계는 불변)', () => {
  test('confidence 0.55 취소 → unknown (취소 임계 0.6)', () => {
    const r = evaluateConfirmSTT(stt({ transcript: '취소', confidence: 0.55 }));
    expect(r.action).toBe('unknown');
    expect(r.reason).toMatch(/^cancel_conf=/);
    expect(r.unknownKind).toBe('hard');
  });

  test('noSpeechProb 0.5 취소 → unknown (취소 임계 0.4, confirm은 0.6)', () => {
    const r = evaluateConfirmSTT(stt({ transcript: '취소', noSpeechProb: 0.5 }));
    expect(r.action).toBe('unknown');
    expect(r.reason).toMatch(/^cancel_no_speech=/);
  });

  test('같은 confidence 0.55라도 confirm은 종전대로 통과한다 (완화·강화 모두 없음)', () => {
    const r = evaluateConfirmSTT(stt({ transcript: '저장', confidence: 0.55 }));
    expect(r.action).toBe('confirm');
  });

  test('같은 noSpeechProb 0.5라도 confirm은 종전대로 통과한다', () => {
    const r = evaluateConfirmSTT(stt({ transcript: '저장', noSpeechProb: 0.5 }));
    expect(r.action).toBe('confirm');
  });
});

describe('과잉 방어 방지 — 정상 발화는 그대로 동작한다', () => {
  test.each(['취소', '아니', '아니요', '하지마', '그만'])('또렷한 취소 "%s" → cancel', (t) => {
    expect(evaluateConfirmSTT(stt({ transcript: t })).action).toBe('cancel');
  });

  test.each(['저장', '네', '응', '그래', '맞아요', '오케이', '저장해줘'])('또렷한 확인 "%s" → confirm', (t) => {
    expect(evaluateConfirmSTT(stt({ transcript: t })).action).toBe('confirm');
  });

  test('confirm 소프트신호 오탐 구제는 유지된다', () => {
    // 짧고 신뢰도 충분한 "저장."이 환경 신호(무음 확률)로만 걸린 경우 → 종전대로 confirm.
    const r = evaluateConfirmSTT(stt({ transcript: '저장.', noSpeechProb: 0.95 }));
    expect(r.action).toBe('confirm');
  });
});

describe('C — unknownKind가 하드/소프트/무키워드를 구분한다', () => {
  test('무음 확률 초과 → hard', () => {
    expect(evaluateConfirmSTT(stt({ transcript: '어어어어어어어어어', noSpeechProb: 0.95 })).unknownKind).toBe('hard');
  });

  test('길이 초과 → hard', () => {
    expect(evaluateConfirmSTT(stt({ transcript: '오늘 날씨가 참 좋네요 그래서 산책을 갔습니다' })).unknownKind).toBe('hard');
  });

  test('저신뢰 → hard', () => {
    expect(evaluateConfirmSTT(stt({ transcript: '으음', confidence: 0.2 })).unknownKind).toBe('hard');
  });

  test('로그확률/압축비만 걸린 경우 → soft (재질문이 도움 될 수 있음)', () => {
    expect(evaluateConfirmSTT(stt({ transcript: '으음', avgLogprob: -2.0 })).unknownKind).toBe('soft');
    expect(evaluateConfirmSTT(stt({ transcript: '으음', compressionRatio: 3.0 })).unknownKind).toBe('soft');
  });

  test('신호는 깨끗한데 키워드가 없으면 → no-keyword', () => {
    const r = evaluateConfirmSTT(stt({ transcript: '음 그거' }));
    expect(r.action).toBe('unknown');
    expect(r.unknownKind).toBe('no-keyword');
    expect(r.reason).toBe('no-keyword');
  });

  test('confirm/cancel 확정 시에는 unknownKind가 붙지 않는다', () => {
    expect(evaluateConfirmSTT(stt({ transcript: '저장' })).unknownKind).toBeUndefined();
    expect(evaluateConfirmSTT(stt({ transcript: '취소' })).unknownKind).toBeUndefined();
  });
});
