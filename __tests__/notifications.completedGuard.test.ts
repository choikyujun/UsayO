// services/notifications.ts 회귀 테스트 — 세 가지를 고정한다.
//  1) 완료된 일정(completed_at != null)은 예약하지 않는다. 완료 처리 후 다른 경로(알림 오프셋
//     편집·드래그 이동·음성 NOTIFICATION_UPDATE)가 재예약해 알림이 되살아나던 것을 막는 안전망.
//  2) 완료취소(completed_at = null)면 가드가 풀려 다시 예약된다.
//  3) cancelEventNotification이 실패를 성공처럼 보고하지 않는다(종전에는 3중 catch 때문에
//     무엇이 실패해도 '취소 완료:' 로그가 찍혔다).

let mockPending: Array<{ identifier: string; content: { data: Record<string, unknown> } }> = [];
let mockCancelImpl: (id: string) => Promise<void> = async () => {};
let mockGetAllImpl: () => Promise<unknown[]> = async () => mockPending;
let mockParentRow: { data: unknown; error: unknown } = { data: null, error: null };

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { appOwnership: 'standalone', executionEnvironment: 'standalone' },
}));
jest.mock('react-native', () => ({
  Platform: { OS: 'ios', select: (o: Record<string, unknown>) => o.ios ?? o.default },
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn().mockResolvedValue(null) },
}));
jest.mock('../lib/supabase', () => {
  const chain: Record<string, unknown> = {};
  Object.assign(chain, {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => mockParentRow,
  });
  return { supabase: { from: () => chain } };
});
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  AndroidImportance: { MAX: 5 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  scheduleNotificationAsync: jest.fn().mockResolvedValue('notif-new'),
  getAllScheduledNotificationsAsync: jest.fn(() => mockGetAllImpl()),
  cancelScheduledNotificationAsync: jest.fn((id: string) => mockCancelImpl(id)),
}));

import {
  scheduleEventNotification,
  cancelEventNotification,
  reconcileRecurringDeletion,
} from '../services/notifications';
import type { Event } from '../types/database';

const N = require('expo-notifications');

// 한참 미래로 둬야 calcNotifDate가 '이미 지난 시각'으로 버리지 않는다.
function futureEvent(over: Partial<Event> = {}): Event {
  const start = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  return {
    id: 'evt-1',
    title: '치과',
    start_at: start.toISOString(),
    end_at: new Date(start.getTime() + 3_600_000).toISOString(),
    is_all_day: false,
    completed_at: null,
    notification_offset_minutes: 60,
    ...over,
  } as unknown as Event;
}

beforeEach(() => {
  mockPending = [];
  mockCancelImpl = async () => {};
  mockGetAllImpl = async () => mockPending;
  mockParentRow = { data: null, error: null };
  jest.clearAllMocks();
});

describe('_doSchedule — completed_at 가드', () => {
  test('완료된 일정은 예약하지 않는다', async () => {
    const id = await scheduleEventNotification(
      futureEvent({ completed_at: '2026-09-12T00:00:00.000Z' }),
    );
    expect(id).toBeNull();
    expect(N.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  test('완료된 일정이어도 기존 예약은 함께 정리한다', async () => {
    mockPending = [{ identifier: 'n-1', content: { data: { eventId: 'evt-1' } } }];
    await scheduleEventNotification(futureEvent({ completed_at: '2026-09-12T00:00:00.000Z' }));
    expect(N.cancelScheduledNotificationAsync).toHaveBeenCalledWith('n-1');
  });

  test('완료취소(completed_at = null)면 가드가 풀려 다시 예약된다', async () => {
    const id = await scheduleEventNotification(futureEvent({ completed_at: null }));
    expect(N.scheduleNotificationAsync).toHaveBeenCalled();
    expect(id).toBe('notif-new');
  });
});

describe('cancelEventNotification — 성공과 실패가 구분된다', () => {
  // 인메모리 notifIdMap은 모듈 전역이라 테스트 간에 남는다(운영에서도 그렇다).
  // 위 예약 테스트가 남긴 'evt-1' 항목과 섞이지 않도록 여기서는 다른 id를 쓴다.
  const ID = 'evt-cancel';

  test('전부 취소되면 ok=true', async () => {
    mockPending = [
      { identifier: 'n-1', content: { data: { eventId: ID } } },
      { identifier: 'n-2', content: { data: { eventId: ID } } },
      { identifier: 'n-3', content: { data: { eventId: 'other' } } },
    ];
    const r = await cancelEventNotification(ID);
    expect(r).toEqual({ ok: true, targets: 2, cancelled: 2, failed: 0, scanned: true });
    expect(N.cancelScheduledNotificationAsync).not.toHaveBeenCalledWith('n-3');
  });

  test('개별 취소가 실패하면 ok=false이고 failed로 센다', async () => {
    mockPending = [{ identifier: 'n-1', content: { data: { eventId: ID } } }];
    mockCancelImpl = async () => { throw new Error('boom'); };
    const r = await cancelEventNotification(ID);
    expect(r.ok).toBe(false);
    expect(r.failed).toBe(1);
    expect(r.cancelled).toBe(0);
  });

  test('예약 목록 조회가 실패하면 ok=false (남은 게 없다고 단언할 수 없다)', async () => {
    mockGetAllImpl = async () => { throw new Error('queue unavailable'); };
    const r = await cancelEventNotification(ID);
    expect(r.ok).toBe(false);
    expect(r.scanned).toBe(false);
  });

  test('취소할 것이 없으면 ok=true, targets=0', async () => {
    const r = await cancelEventNotification(ID);
    expect(r).toEqual({ ok: true, targets: 0, cancelled: 0, failed: 0, scanned: true });
  });
});

describe('reconcileRecurringDeletion — 반복 부분 삭제', () => {
  // 반복 일정의 알림은 부모 행의 start_at 하나만 예약된다. 그 발생분이 삭제 범위에
  // 들어갈 때만 취소해야 한다 — 무조건 취소하면 남은 회차의 알림까지 사라진다.
  const localDay = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const parentStart = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const parentDay = localDay(parentStart);
  const laterDay = localDay(new Date(parentStart.getTime() + 7 * 24 * 60 * 60 * 1000));
  const earlierDay = localDay(new Date(parentStart.getTime() - 7 * 24 * 60 * 60 * 1000));

  beforeEach(() => {
    mockParentRow = { data: { start_at: parentStart.toISOString() }, error: null };
    mockPending = [{ identifier: 'n-1', content: { data: { eventId: 'parent-1' } } }];
  });

  test("가상 인스턴스가 아니면(부모 행 자체 삭제) 취소한다", async () => {
    await reconcileRecurringDeletion('parent-1', 'this');
    expect(N.cancelScheduledNotificationAsync).toHaveBeenCalledWith('n-1');
  });

  test("scope='this' — 삭제한 회차가 예약분과 같은 날이면 취소한다", async () => {
    await reconcileRecurringDeletion(`parent-1__${parentDay}`, 'this');
    expect(N.cancelScheduledNotificationAsync).toHaveBeenCalledWith('n-1');
  });

  test("scope='this' — 다른 회차를 지우면 예약을 유지한다", async () => {
    await reconcileRecurringDeletion(`parent-1__${laterDay}`, 'this');
    expect(N.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
  });

  test("scope='future' — 예약분이 잘린 범위 안이면 취소한다", async () => {
    await reconcileRecurringDeletion(`parent-1__${earlierDay}`, 'future');
    expect(N.cancelScheduledNotificationAsync).toHaveBeenCalledWith('n-1');
  });

  test("scope='future' — 예약분이 잘린 범위보다 앞이면 유지한다", async () => {
    await reconcileRecurringDeletion(`parent-1__${laterDay}`, 'future');
    expect(N.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
  });

  test('부모 조회에 실패하면 아무것도 취소하지 않는다', async () => {
    mockParentRow = { data: null, error: { message: 'not found' } };
    await reconcileRecurringDeletion(`parent-1__${parentDay}`, 'this');
    expect(N.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
  });
});
