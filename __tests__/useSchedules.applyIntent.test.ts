// applyClassifiedIntent 회귀 방지 — 저장 분기 미진입 시 조용히 성공으로 보고하지 않는다.
//
// 막으려는 회귀: 어느 intent 분기에도 걸리지 않으면 undefined를 반환했고, 호출부
// (useVoiceFlow.confirmAction)는 그것을 성공으로 보고 성공 TTS를 냈다 — 저장하지 않았는데
// 저장했다고 말하는 경로. 동시에 **CREATE 정상 경로가 그대로인지**도 함께 고정한다.
//
// 실행 환경은 __tests__/UpgradeModal.paywall.test.ts와 동일한 제약을 따른다
// (.ts + React.createElement, react-native 최소 스텁, react-test-renderer 최소 타입 선언).

import React from 'react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockInsertResult: { data: unknown; error: unknown } = { data: null, error: null };

jest.mock('react-native', () => {
  const R = require('react');
  const C = (props: { children?: unknown }) => R.createElement(R.Fragment, null, props.children ?? null);
  return { View: C, Text: C, Platform: { OS: 'ios', select: (o: { ios?: unknown }) => o.ios } };
});

// supabase 체이너 — insert().select().single()만 실제로 값을 돌려주면 CREATE 경로가 성립한다.
jest.mock('../lib/supabase', () => {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  Object.assign(chain, {
    select: self, is: self, ilike: self, order: self, eq: self, in: self,
    gte: self, lte: self, update: self, limit: self, not: self,
    insert: self,
    single: async () => mockInsertResult,
    then: undefined,
  });
  return {
    supabase: { from: () => chain },
    ensureAuth: jest.fn().mockResolvedValue('user-1'),
  };
});

jest.mock('../services/widget/widgetRefresh', () => ({ refreshWidget: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/notifications', () => ({
  scheduleEventNotification: jest.fn().mockResolvedValue(undefined),
  cancelEventNotification: jest.fn().mockResolvedValue(undefined),
  getEnabledOffsets: jest.fn().mockResolvedValue([]),
}));
jest.mock('../utils/fetchExpandedEvents', () => ({
  eventsDateRange: () => ({ from: '2026-01-01T00:00:00.000Z', to: '2026-01-02T00:00:00.000Z' }),
  fetchExpandedEvents: jest.fn().mockResolvedValue({ events: [], parents: [] }),
}));
jest.mock('../services/voice/voiceTrace', () => ({
  voiceTrace: { sinceRecordingEnd: () => 0, lastRecordingDurationMs: () => 0, markRecordingEnd: jest.fn() },
}));
jest.mock('../stores/useAuthStore', () => ({
  useAuthStore: (sel: (s: unknown) => unknown) => sel({ status: 'authenticated', userId: 'user-1' }),
}));

import { useSchedules } from '../hooks/useSchedules';
import type { ClassifiedIntent } from '../types';

type TestInstance = { props: Record<string, unknown> };
type Tree = { root: TestInstance };
type RTR = { create(el: unknown): Tree; act(cb: () => Promise<void> | void): Promise<void> };
const TestRenderer = require('react-test-renderer') as RTR;
const act = TestRenderer.act;

// 훅의 applyClassifiedIntent만 꺼내오는 프로브 컴포넌트.
type Apply = (i: ClassifiedIntent) => Promise<string | undefined>;
async function getApply(): Promise<Apply> {
  let apply!: Apply;
  const Probe = () => {
    const { applyClassifiedIntent } = useSchedules('2026-01-01', 0);
    apply = applyClassifiedIntent;
    return null;
  };
  await act(async () => { TestRenderer.create(React.createElement(Probe)); });
  return apply;
}

const CREATE_OK: ClassifiedIntent = {
  intent: 'CREATE',
  confidence: 0.9,
  title: '치과',
  startDateTime: { date: '2026-01-01T06:00:00.000Z', isRecurring: false, confidence: 0.9 },
} as unknown as ClassifiedIntent;

beforeEach(() => {
  mockInsertResult = { data: null, error: null };
  jest.clearAllMocks();
});

describe('applyClassifiedIntent — CREATE 정상 경로(회귀 방지)', () => {
  test('startDateTime이 있으면 insert하고 id를 반환한다 (throw 없음)', async () => {
    mockInsertResult = { data: { id: 'evt-1', start_at: CREATE_OK.startDateTime!.date }, error: null };
    const apply = await getApply();
    let id: string | undefined;
    await act(async () => { id = await apply(CREATE_OK); });
    expect(id).toBe('evt-1');
  });

  test('DB 오류는 종전대로 그 메시지로 throw한다', async () => {
    mockInsertResult = { data: null, error: { message: 'duplicate key' } };
    const apply = await getApply();
    await act(async () => {
      await expect(apply(CREATE_OK)).rejects.toThrow('duplicate key');
    });
  });
});

describe('applyClassifiedIntent — 분기 미진입 시 조용히 성공하지 않는다', () => {
  const cases: Array<[string, ClassifiedIntent]> = [
    ['CREATE인데 startDateTime 없음',
      { intent: 'CREATE', confidence: 0.9, title: '치과' } as unknown as ClassifiedIntent],
    ['분기가 없는 intent — NAVIGATION',
      { intent: 'NAVIGATION', confidence: 0.9 } as unknown as ClassifiedIntent],
    ['분기가 없는 intent — RESCHEDULE_UNDO',
      { intent: 'RESCHEDULE_UNDO', confidence: 0.9 } as unknown as ClassifiedIntent],
    ['분기가 없는 intent — UNKNOWN',
      { intent: 'UNKNOWN', confidence: 0.3 } as unknown as ClassifiedIntent],
  ];

  test.each(cases)('%s → throw', async (_label, intent) => {
    const apply = await getApply();
    await act(async () => {
      // undefined를 조용히 돌려주면(회귀) 이 단언이 깨진다.
      await expect(apply(intent)).rejects.toThrow('일정을 저장하지 못했어요');
    });
  });

  test('진단 로그에 intent 종류와 startDateTime 유무가 남는다', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const apply = await getApply();
    await act(async () => {
      await expect(
        apply({ intent: 'CREATE', confidence: 0.9, title: '치과' } as unknown as ClassifiedIntent),
      ).rejects.toThrow();
    });
    const logged = spy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('[Save] 저장 분기 미진입');
    expect(logged).toContain('intent=CREATE');
    expect(logged).toContain('hasStartDateTime=false');
    spy.mockRestore();
  });
});
