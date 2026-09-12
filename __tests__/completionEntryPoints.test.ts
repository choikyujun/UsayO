// 완료 진입점이 전부 setEventCompletion을 거치는지 고정한다.
//
// 이번 버그의 형태가 "진입점마다 제각기 supabase를 직접 호출해서 그중 일부가 알림 취소를
// 빠뜨린 것"이었다. 그래서 '취소가 호출되는가'가 아니라 '공통 함수를 거치는가'를 검증한다
// (공통 함수가 취소를 부르는지는 eventCompletion.test.ts가 따로 고정한다).
//
// 실행 환경 제약은 useSchedules.applyIntent.test.ts와 동일하다
// (.ts + React.createElement, react-native 최소 스텁, react-test-renderer 최소 타입 선언).

import React from 'react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockSingleResult: { data: unknown; error: unknown } = { data: null, error: null };

jest.mock('react-native', () => {
  const R = require('react');
  const C = (props: { children?: unknown }) => R.createElement(R.Fragment, null, props.children ?? null);
  return { View: C, Text: C, Platform: { OS: 'ios', select: (o: { ios?: unknown }) => o.ios } };
});

jest.mock('../lib/supabase', () => {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  Object.assign(chain, {
    select: self, is: self, ilike: self, order: self, eq: self, in: self,
    gte: self, lte: self, update: self, limit: self, not: self, insert: self,
    single: async () => mockSingleResult,
    then: undefined,
  });
  return {
    supabase: { from: () => chain },
    ensureAuth: jest.fn().mockResolvedValue('user-1'),
  };
});

jest.mock('../services/widget/widgetRefresh', () => ({ refreshWidget: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/notifications', () => ({
  scheduleEventNotification: jest.fn().mockResolvedValue(null),
  cancelEventNotification: jest.fn().mockResolvedValue(
    { ok: true, targets: 1, cancelled: 1, failed: 0, scanned: true },
  ),
  getEnabledOffsets: jest.fn().mockResolvedValue([]),
}));
jest.mock('../services/eventCompletion', () => ({
  setEventCompletion: jest.fn().mockResolvedValue({ ok: true, rows: 1, event: null }),
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
import { setEventCompletion } from '../services/eventCompletion';
import { cancelEventNotification } from '../services/notifications';
import type { ClassifiedIntent } from '../types';

type TestInstance = { props: Record<string, unknown> };
type Tree = { root: TestInstance };
type RTR = { create(el: unknown): Tree; act(cb: () => Promise<void> | void): Promise<void> };
const TestRenderer = require('react-test-renderer') as RTR;
const act = TestRenderer.act;

type Hook = ReturnType<typeof useSchedules>;
async function getHook(): Promise<Hook> {
  let hook!: Hook;
  const Probe = () => {
    hook = useSchedules('2026-01-01', 0);
    return null;
  };
  await act(async () => { TestRenderer.create(React.createElement(Probe)); });
  return hook;
}

const COMPLETE_INTENT = {
  intent: 'COMPLETE',
  confidence: 0.9,
  targetEventId: 'evt-1',
} as unknown as ClassifiedIntent;

beforeEach(() => {
  mockSingleResult = { data: null, error: null };
  jest.clearAllMocks();
  (setEventCompletion as jest.Mock).mockResolvedValue({ ok: true, rows: 1, event: null });
});

describe('진입점 1 — 음성 COMPLETE', () => {
  test('setEventCompletion(completed=true)을 거친다', async () => {
    mockSingleResult = { data: { id: 'evt-1', title: '치과' }, error: null };
    const hook = await getHook();
    await act(async () => { await hook.applyClassifiedIntent(COMPLETE_INTENT); });

    expect(setEventCompletion).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 'evt-1', completed: true }),
    );
  });

  test('대상 행이 0개면(그 사이 삭제) 조용히 성공하지 않고 throw한다', async () => {
    mockSingleResult = { data: { id: 'evt-1', title: '치과' }, error: null };
    (setEventCompletion as jest.Mock).mockResolvedValue({ ok: true, rows: 0, event: null });
    const hook = await getHook();
    await act(async () => {
      await expect(hook.applyClassifiedIntent(COMPLETE_INTENT)).rejects.toThrow('해당 일정을 찾을 수 없어요.');
    });
  });

  test('DB 오류는 그 메시지로 throw한다', async () => {
    mockSingleResult = { data: { id: 'evt-1', title: '치과' }, error: null };
    (setEventCompletion as jest.Mock).mockResolvedValue({ ok: false, rows: 0, event: null, error: 'permission denied' });
    const hook = await getHook();
    await act(async () => {
      await expect(hook.applyClassifiedIntent(COMPLETE_INTENT)).rejects.toThrow('permission denied');
    });
  });
});

describe('진입점 2 — toggleEventComplete (홈 타임스파인 / 홈 Upcoming 공유)', () => {
  test('미완료 → 완료면 completed=true로 거친다', async () => {
    const hook = await getHook();
    await act(async () => { await hook.toggleEventComplete('evt-1', false); });
    expect(setEventCompletion).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 'evt-1', completed: true }),
    );
  });

  test('완료 → 완료취소면 completed=false로 거친다 (재예약 경로)', async () => {
    const hook = await getHook();
    await act(async () => { await hook.toggleEventComplete('evt-1', true); });
    expect(setEventCompletion).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 'evt-1', completed: false }),
    );
  });
});

describe('삭제 경로 — undoSave (음성 저장 직후 되돌리기)', () => {
  test('방금 예약한 알림을 취소한다', async () => {
    const hook = await getHook();
    await act(async () => { await hook.undoSave('evt-1'); });
    expect(cancelEventNotification).toHaveBeenCalledWith('evt-1');
  });
});

describe('삭제 경로 — deleteEventById (회귀 방지)', () => {
  test('종전대로 알림을 취소한다', async () => {
    const hook = await getHook();
    await act(async () => { await hook.deleteEventById('evt-1'); });
    expect(cancelEventNotification).toHaveBeenCalledWith('evt-1');
  });
});
