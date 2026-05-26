// Supabase는 AsyncStorage(React Native) 의존성을 가지므로 전체 모킹
jest.mock('../lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));

import { supabase } from '../lib/supabase';
import { EventMatcher, MatchResult } from '../services/voice/EventMatcher';
import { Event } from '../types/database';

// ── 테스트 픽스처 ────────────────────────────────────────────

const TOMORROW = new Date('2026-05-27T00:00:00+09:00'); // KST 기준 내일

function makeEvent(overrides: Partial<Event>): Event {
  return {
    id: 'evt-1',
    user_id: 'user-1',
    team_id: null,
    title: '테스트 일정',
    description: null,
    start_at: TOMORROW.toISOString(),
    end_at: new Date(TOMORROW.getTime() + 3_600_000).toISOString(),
    is_all_day: false,
    location: null,
    color: '#534AB7',
    category: 'work',
    is_recurring: false,
    recurrence_rule: null,
    parent_event_id: null,
    google_event_id: null,
    apple_event_id: null,
    created_via: 'voice',
    voice_transcript: null,
    attendees: null,
    recurrence_end_date: null,
    completed_at: null,
    notification_offset_minutes: null,
    deleted_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

const teamMeeting = makeEvent({ id: 'evt-1', title: '팀 회의', start_at: '2026-05-27T14:00:00+09:00' });
const clientMeeting = makeEvent({ id: 'evt-2', title: '고객 미팅', start_at: '2026-05-27T16:00:00+09:00' });
const lunchMeeting = makeEvent({ id: 'evt-3', title: '점심 약속', start_at: '2026-05-27T12:00:00+09:00' });
const standupMeeting = makeEvent({ id: 'evt-4', title: '스탠드업', start_at: '2026-05-27T10:00:00+09:00' });

// ── Supabase 체인 목 헬퍼 ────────────────────────────────────

function makeChain(resolveData: Event[] | null) {
  const chain: Record<string, jest.Mock> = {};
  const methods = ['select', 'eq', 'gte', 'lte', 'is', 'ilike'];
  methods.forEach(m => { chain[m] = jest.fn().mockReturnThis(); });
  chain['order'] = jest.fn().mockResolvedValue({ data: resolveData, error: null });
  return chain;
}

const mockFrom = supabase.from as jest.Mock;

// ── 매처 인스턴스 ─────────────────────────────────────────────

const matcher = new EventMatcher('user-1');

beforeEach(() => {
  mockFrom.mockReset();
});

// ── findForDelete ─────────────────────────────────────────────

describe('EventMatcher — findForDelete', () => {
  test('날짜+키워드 검색에서 단일 결과 → exactMatch 반환', async () => {
    mockFrom.mockReturnValueOnce(makeChain([teamMeeting]));

    const result = await matcher.findForDelete('팀 회의 취소해줘', TOMORROW);

    expect(result.exactMatch).toEqual(teamMeeting);
    expect(result.needsDisambiguation).toBe(false);
    expect(result.candidates).toHaveLength(1);
  });

  test('날짜+키워드 검색에서 복수 결과 → 모호성 해소 필요', async () => {
    mockFrom.mockReturnValueOnce(makeChain([teamMeeting, clientMeeting]));

    const result = await matcher.findForDelete('내일 회의 취소해줘', TOMORROW);

    expect(result.exactMatch).toBeNull();
    expect(result.needsDisambiguation).toBe(true);
    expect(result.candidates).toHaveLength(2);
    expect(result.disambiguationQuestion).toContain('2개');
    expect(result.disambiguationQuestion).toContain('팀 회의');
    expect(result.disambiguationQuestion).toContain('고객 미팅');
  });

  test('날짜+키워드 결과 없음 → 날짜 전용 폴백 (단일 결과)', async () => {
    // 첫 번째 쿼리(keyword+date): 결과 없음
    mockFrom.mockReturnValueOnce(makeChain([]));
    // 두 번째 쿼리(date-only): 결과 있음
    mockFrom.mockReturnValueOnce(makeChain([lunchMeeting]));

    const result = await matcher.findForDelete('없는제목 취소해줘', TOMORROW);

    expect(result.exactMatch).toEqual(lunchMeeting);
    expect(result.needsDisambiguation).toBe(false);
  });

  test('날짜+키워드 결과 없음 → 날짜 전용 폴백 (복수 결과 → 유사도 정렬)', async () => {
    mockFrom.mockReturnValueOnce(makeChain([]));
    mockFrom.mockReturnValueOnce(makeChain([lunchMeeting, teamMeeting, clientMeeting]));

    const result = await matcher.findForDelete('점심 취소해줘', TOMORROW);

    expect(result.needsDisambiguation).toBe(true);
    // 유사도 높은 점심 약속이 candidates 첫 번째
    expect(result.candidates[0].title).toBe('점심 약속');
  });

  test('모든 쿼리 결과 없음 → 빈 결과', async () => {
    mockFrom.mockReturnValue(makeChain([]));

    const result = await matcher.findForDelete('없는 일정 취소해줘', TOMORROW);

    expect(result.exactMatch).toBeNull();
    expect(result.candidates).toHaveLength(0);
    expect(result.needsDisambiguation).toBe(false);
  });

  test('dateHint 없음 → 제목 전용 검색 (14일 범위)', async () => {
    mockFrom.mockReturnValueOnce(makeChain([teamMeeting]));

    const result = await matcher.findForDelete('팀 회의 취소해줘');

    expect(result.exactMatch).toEqual(teamMeeting);
    // ilike 가 호출돼야 함
    const chain = mockFrom.mock.results[0].value;
    expect(chain.ilike).toHaveBeenCalledWith('title', '%팀 회의%');
  });

  test('후보 4개 초과 → 최대 4개로 제한', async () => {
    const events = [teamMeeting, clientMeeting, lunchMeeting, standupMeeting,
      makeEvent({ id: 'evt-5', title: '다섯번째 회의' })];
    mockFrom.mockReturnValueOnce(makeChain(events));

    const result = await matcher.findForDelete('회의', TOMORROW);

    expect(result.candidates.length).toBeLessThanOrEqual(4);
  });
});

// ── findForUpdate ─────────────────────────────────────────────

describe('EventMatcher — findForUpdate', () => {
  test('정확한 제목 매칭 → exactMatch 반환', async () => {
    mockFrom.mockReturnValueOnce(makeChain([teamMeeting]));

    const result = await matcher.findForUpdate('팀 회의 시간 바꿔줘', TOMORROW);

    expect(result.exactMatch).toEqual(teamMeeting);
    expect(result.needsDisambiguation).toBe(false);
  });

  test('복수 결과 → disambiguationQuestion에 "수정" 표현 포함', async () => {
    mockFrom.mockReturnValueOnce(makeChain([teamMeeting, clientMeeting]));

    const result = await matcher.findForUpdate('내일 회의 수정해줘', TOMORROW);

    expect(result.needsDisambiguation).toBe(true);
    // 수정 관련 동사가 포함돼야 함
    expect(result.disambiguationQuestion).toMatch(/수정|바꿀|변경/);
  });
});

// ── calculateSimilarity ───────────────────────────────────────

describe('EventMatcher — calculateSimilarity', () => {
  test('완전 일치 → 1.0', () => {
    expect(matcher.calculateSimilarity('팀 회의', '팀 회의')).toBe(1.0);
  });

  test('제목이 쿼리를 포함 → 0.95', () => {
    const score = matcher.calculateSimilarity('팀 회의', '오후 팀 회의 미팅');
    expect(score).toBeGreaterThanOrEqual(0.9);
  });

  test('부분 토큰 매칭 → 0초과 1미만', () => {
    const score = matcher.calculateSimilarity('팀 회의 취소해줘', '팀 회의');
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  test('전혀 관련 없는 텍스트 → 0', () => {
    const score = matcher.calculateSimilarity('운동', '팀 회의');
    expect(score).toBe(0);
  });

  test('동사 제거 후 키워드만 비교', () => {
    // "팀 회의 취소해줘" → normalize → "팀 회의"
    const withCmd = matcher.calculateSimilarity('팀 회의 취소해줘', '팀 회의');
    const noCmd = matcher.calculateSimilarity('팀 회의', '팀 회의');
    expect(withCmd).toBeCloseTo(noCmd, 1);
  });

  test('날짜 표현 제거 후 비교', () => {
    // "내일 오후 팀 회의 취소" → normalize → "팀 회의 취소" → "팀 회의"
    const score = matcher.calculateSimilarity('내일 오후 팀 회의 취소해줘', '팀 회의');
    expect(score).toBeGreaterThan(0.5);
  });

  test('빈 문자열 → 0', () => {
    expect(matcher.calculateSimilarity('', '팀 회의')).toBe(0);
    expect(matcher.calculateSimilarity('팀 회의', '')).toBe(0);
  });
});

// ── extractKeyword ────────────────────────────────────────────

describe('EventMatcher — extractKeyword', () => {
  test('동사 제거', () => {
    expect(matcher.extractKeyword('팀 회의 취소해줘')).toBe('팀 회의');
  });

  test('날짜+동사 제거', () => {
    const kw = matcher.extractKeyword('내일 오후 3시 팀 회의 삭제해줘');
    expect(kw).toContain('팀');
    expect(kw).toContain('회의');
    expect(kw).not.toContain('내일');
    expect(kw).not.toContain('삭제해줘');
  });

  test('목적격 조사(를) 제거 후 공백 정리', () => {
    // "를"은 어절 끝 기준으로 제거, "의"는 단어 내 등장이 많아 제거하지 않음
    const kw = matcher.extractKeyword('팀 회의를 취소해줘');
    expect(kw).not.toContain('를');
    expect(kw).toContain('회의');
  });

  test('점심/저녁 등 식사 단어는 제목 키워드로 보존', () => {
    expect(matcher.extractKeyword('점심 약속 취소해줘')).toContain('점심');
    expect(matcher.extractKeyword('저녁 모임 삭제해줘')).toContain('저녁');
  });
});

// ── disambiguationQuestion 형식 ───────────────────────────────

describe('EventMatcher — disambiguationQuestion', () => {
  test('2개 후보 → "2개 있어요" 형식', async () => {
    mockFrom.mockReturnValueOnce(makeChain([teamMeeting, clientMeeting]));

    const result = await matcher.findForDelete('회의 취소해줘', TOMORROW);

    expect(result.disambiguationQuestion).toMatch(/2개/);
    expect(result.disambiguationQuestion).toMatch(/인가요|취소할까요|수정/);
  });

  test('3개 이상 후보 → 개수 명시', async () => {
    mockFrom.mockReturnValueOnce(makeChain([teamMeeting, clientMeeting, lunchMeeting]));

    const result = await matcher.findForDelete('일정 취소해줘', TOMORROW);

    expect(result.disambiguationQuestion).toMatch(/3개/);
  });
});
