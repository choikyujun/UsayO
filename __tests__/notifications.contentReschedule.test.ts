// 일정 수정이 알림 content에 반영되는지 고정하는 회귀 테스트.
//
// 버그: 롱프레스 메뉴에서 제목만 바꾸면 알림 2개가 모두 수정 전 제목으로 발송됐다.
// 원인은 취소 실패가 아니라 재예약 미호출 — 제목 수정 경로에 재예약이 아예 없었다.
// 예약된 알림의 제목·본문·발화 시각은 _doSchedule이 예약하는 순간의 값으로 고정되므로,
// content 필드가 바뀌면 반드시 재예약해야 한다.
//
// 여기서 고정하는 것:
//  1) content 필드(title / start_at / is_all_day / notification_offset_minutes)가
//     바뀌면 재예약하고, 그 알림에는 수정 후 값이 들어간다.
//  2) content와 무관한 필드(location 등)만 바뀌면 재예약하지 않는다.
//  3) 완료된 일정은 수정해도 재예약되지 않는다(직전 커밋의 completed_at 가드 유지).
//  4) 반복 일정의 회차 범위 수정('이번만' / '이후 전체')은 부모 알림을 건드리지 않는다.
//  5) reconcileNotifAfterEdit이 재예약에 쓰는 객체는 DB에서 다시 읽은 수정 후 행이다.

let mockPending: Array<{ identifier: string; content: { data: Record<string, unknown> } }> = [];
let mockRow: { data: unknown; error: unknown } = { data: null, error: null };
const selectedIds: string[] = [];

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
    eq: (_col: string, val: string) => { selectedIds.push(val); return chain; },
    maybeSingle: async () => mockRow,
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
  getAllScheduledNotificationsAsync: jest.fn(async () => mockPending),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
}));

import {
  diffNotifContent,
  rescheduleIfNotifContentChanged,
  reconcileNotifAfterEdit,
} from '../services/notifications';
import type { Event } from '../types/database';

const N = require('expo-notifications');

// 한참 미래로 둬야 calcNotifDate가 '이미 지난 시각'으로 버리지 않는다.
const START = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

function ev(over: Partial<Event> = {}): Event {
  return {
    id: 'evt-1',
    title: '치과',
    start_at: START.toISOString(),
    end_at: new Date(START.getTime() + 3_600_000).toISOString(),
    is_all_day: false,
    location: null,
    completed_at: null,
    notification_offset_minutes: 60,
    ...over,
  } as unknown as Event;
}

// 실제 예약된 알림의 content를 꺼낸다 — "수정 후 값이 들어갔는가"를 여기서 본다.
function scheduledContents(): Array<{ title: string; body: string }> {
  return N.scheduleNotificationAsync.mock.calls.map(
    (c: [{ content: { title: string; body: string } }]) => c[0].content,
  );
}

beforeEach(() => {
  mockPending = [];
  mockRow = { data: null, error: null };
  selectedIds.length = 0;
  jest.clearAllMocks();
});

describe('diffNotifContent — content 필드만 센다', () => {
  test.each([
    ['title',                       { title: '치과 예약' }],
    ['start_at',                    { start_at: new Date(START.getTime() + 3_600_000).toISOString() }],
    ['is_all_day',                  { is_all_day: true }],
    ['notification_offset_minutes', { notification_offset_minutes: 10 }],
    ['completed_at',                { completed_at: '2026-10-23T00:00:00.000Z' }],
  ])('%s가 바뀌면 변경으로 센다', (key, over) => {
    expect(diffNotifContent(ev(), ev(over as Partial<Event>))).toEqual([key]);
  });

  test.each([
    ['location',    { location: '강남' }],
    ['end_at',      { end_at: new Date(START.getTime() + 7_200_000).toISOString() }],
    ['description', { description: '메모' }],
    ['color',       { color: '#fff' }],
    ['category',    { category: 'personal' }],
  ])('%s만 바뀌면 변경으로 세지 않는다 (알림 content에 안 들어간다)', (_key, over) => {
    expect(diffNotifContent(ev(), ev(over as Partial<Event>))).toEqual([]);
  });

  test('아무것도 안 바뀌면 빈 배열', () => {
    expect(diffNotifContent(ev(), ev())).toEqual([]);
  });

  test('null과 undefined는 같은 값으로 본다 (DB 응답과 로컬 객체의 표현 차이)', () => {
    const before = ev({ notification_offset_minutes: null });
    const after  = ev({ notification_offset_minutes: undefined as unknown as null });
    expect(diffNotifContent(before, after)).toEqual([]);
  });
});

describe('rescheduleIfNotifContentChanged', () => {
  test('제목만 바뀌면 재예약하고, 새 알림에 수정 후 제목이 들어간다', async () => {
    const r = await rescheduleIfNotifContentChanged(
      ev({ title: '치과' }), ev({ title: '치과 예약' }), 'test',
    );
    expect(r).toBe('rescheduled');
    const contents = scheduledContents();
    expect(contents.length).toBeGreaterThan(0);
    for (const c of contents) {
      expect(c.title).toBe('치과 예약');
      expect(c.body).toContain('치과 예약');
    }
  });

  test('시간만 바뀌어도 종전대로 재예약된다 (회귀 방지)', async () => {
    const moved = new Date(START.getTime() + 2 * 3_600_000).toISOString();
    const r = await rescheduleIfNotifContentChanged(ev(), ev({ start_at: moved }), 'test');
    expect(r).toBe('rescheduled');
    expect(N.scheduleNotificationAsync).toHaveBeenCalled();
  });

  test('content와 무관한 필드만 바뀌면 재예약하지 않는다', async () => {
    const r = await rescheduleIfNotifContentChanged(ev(), ev({ location: '강남' }), 'test');
    expect(r).toBe('skipped-unchanged');
    expect(N.scheduleNotificationAsync).not.toHaveBeenCalled();
    // 재예약하지 않을 때는 기존 예약도 건드리지 않는다.
    expect(N.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
  });

  test('완료된 일정은 수정해도 재예약되지 않는다 (completed_at 가드 유지)', async () => {
    mockPending = [{ identifier: 'n-old', content: { data: { eventId: 'evt-1' } } }];
    const r = await rescheduleIfNotifContentChanged(
      ev({ completed_at: '2026-10-23T00:00:00.000Z', title: '치과' }),
      ev({ completed_at: '2026-10-23T00:00:00.000Z', title: '치과 예약' }),
      'test',
    );
    expect(r).toBe('skipped-completed');
    expect(N.scheduleNotificationAsync).not.toHaveBeenCalled();
    // 남아 있던 옛 알림은 거둔다.
    expect(N.cancelScheduledNotificationAsync).toHaveBeenCalledWith('n-old');
  });

  test('수정 전 값을 모르면(before=null) 무조건 재예약한다', async () => {
    const r = await rescheduleIfNotifContentChanged(null, ev({ title: '새 제목' }), 'test');
    expect(r).toBe('rescheduled');
    expect(scheduledContents()[0].title).toBe('새 제목');
  });
});

describe('reconcileNotifAfterEdit — 수정 모달 경로', () => {
  test('재예약에 쓰는 객체는 DB에서 다시 읽은 수정 후 행이다', async () => {
    // 모달이 쥔 before는 수정 전 제목, DB 행은 수정 후 제목.
    mockRow = { data: ev({ title: 'DB가 돌려준 수정 후 제목' }), error: null };
    const r = await reconcileNotifAfterEdit(ev({ title: '수정 전 제목' }), 'all', 'editTitle');
    expect(r).toBe('rescheduled');
    expect(selectedIds).toEqual(['evt-1']);
    expect(scheduledContents()[0].title).toBe('DB가 돌려준 수정 후 제목');
  });

  test('DB 행이 before와 같으면 재예약하지 않는다', async () => {
    mockRow = { data: ev(), error: null };
    const r = await reconcileNotifAfterEdit(ev(), 'all', 'editTitle');
    expect(r).toBe('skipped-unchanged');
    expect(N.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  test('가상 인스턴스를 scope=all로 고치면 부모 행을 읽어 재예약한다', async () => {
    mockRow = { data: ev({ id: 'evt-1', title: '전체 수정된 제목' }), error: null };
    const r = await reconcileNotifAfterEdit(
      ev({ id: 'evt-1__2026-11-20' }), 'all', 'editTitle',
    );
    expect(r).toBe('rescheduled');
    // 가상 인스턴스 id가 아니라 부모 id로 조회해야 한다 — 종전 화면 코드가 여기서 틀렸다.
    expect(selectedIds).toEqual(['evt-1']);
    expect(scheduledContents()[0].title).toBe('전체 수정된 제목');
  });

  test.each([['this'], ['future']] as const)(
    "scope=%s 는 부모 알림을 건드리지 않는다 (예외 행에만 반영된다)",
    async (scope) => {
      mockRow = { data: ev(), error: null };
      const r = await reconcileNotifAfterEdit(ev({ id: 'evt-1__2026-11-20' }), scope, 'editTitle');
      expect(r).toBe('skipped-instance-scope');
      expect(N.scheduleNotificationAsync).not.toHaveBeenCalled();
      expect(N.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
    },
  );

  test('수정 후 행을 못 읽으면 재예약하지 않고 그 사실을 반환한다', async () => {
    mockRow = { data: null, error: { message: 'not found' } };
    const r = await reconcileNotifAfterEdit(ev(), 'all', 'editTitle');
    expect(r).toBe('skipped-notfound');
    expect(N.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  test('완료된 일정을 수정하면 재예약되지 않는다 (가드 유지)', async () => {
    mockRow = { data: ev({ title: '바뀐 제목', completed_at: '2026-10-23T00:00:00.000Z' }), error: null };
    const r = await reconcileNotifAfterEdit(ev({ title: '옛 제목' }), 'all', 'editTitle');
    expect(r).toBe('skipped-completed');
    expect(N.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});
