// 완료/완료취소 단일 진입점(setEventCompletion) 회귀 테스트.
//
// 막으려는 회귀: 완료 처리는 completed_at 플래그만 바꾸고 레코드를 지우지 않는다. 예약된
// 로컬 알림은 OS 큐에 독립적으로 남으므로 별도로 취소하지 않으면 완료한 일정의 알림이
// 예정대로 발송된다(실기에서 관측된 증상). 그 취소 호출이 여기서 빠지지 않도록 고정한다.

let mockUpdateResult: { data: unknown; error: unknown } = { data: [], error: null };
let mockLastPatch: Record<string, unknown> | null = null;
let mockLastId: string | null = null;

jest.mock('../lib/supabase', () => {
  const chain: Record<string, unknown> = {};
  Object.assign(chain, {
    update: (patch: Record<string, unknown>) => { mockLastPatch = patch; return chain; },
    eq: (_col: string, v: string) => { mockLastId = v; return chain; },
    select: async () => mockUpdateResult,
  });
  return { supabase: { from: () => chain } };
});

jest.mock('../services/notifications', () => ({
  cancelEventNotification: jest.fn().mockResolvedValue(
    { ok: true, targets: 2, cancelled: 2, failed: 0, scanned: true },
  ),
  scheduleEventNotification: jest.fn().mockResolvedValue('notif-1'),
}));

import { setEventCompletion } from '../services/eventCompletion';
import { cancelEventNotification, scheduleEventNotification } from '../services/notifications';

const ROW = {
  id: 'evt-1',
  title: '치과',
  start_at: '2026-10-01T06:00:00.000Z',
  end_at: '2026-10-01T07:00:00.000Z',
  completed_at: null,
  notification_offset_minutes: null,
};

beforeEach(() => {
  mockUpdateResult = { data: [ROW], error: null };
  mockLastPatch = null;
  mockLastId = null;
  jest.clearAllMocks();
});

describe('setEventCompletion — 완료', () => {
  test('completed_at을 기록하고 예약된 알림을 취소한다', async () => {
    const res = await setEventCompletion({ eventId: 'evt-1', completed: true, caller: 'test' });

    expect(res.ok).toBe(true);
    expect(res.rows).toBe(1);
    expect(mockLastId).toBe('evt-1');
    expect(mockLastPatch?.completed_at).toEqual(expect.any(String));
    expect(cancelEventNotification).toHaveBeenCalledWith('evt-1');
    expect(scheduleEventNotification).not.toHaveBeenCalled();
  });

  test('atIso를 주면 그 시각을 기록한다 (위젯 드레인이 드레인 시각을 쓰는 동작 유지)', async () => {
    const at = '2026-09-12T01:02:03.000Z';
    await setEventCompletion({ eventId: 'evt-1', completed: true, caller: 'widgetDrain', atIso: at });
    expect(mockLastPatch?.completed_at).toBe(at);
  });

  test('갱신된 행이 0개여도(이미 삭제됨) 취소는 시도한다', async () => {
    mockUpdateResult = { data: [], error: null };
    const res = await setEventCompletion({ eventId: 'evt-1', completed: true, caller: 'test' });
    expect(res.ok).toBe(true);
    expect(res.rows).toBe(0);
    expect(cancelEventNotification).toHaveBeenCalledWith('evt-1');
  });
});

describe('setEventCompletion — 완료취소', () => {
  test('completed_at을 null로 되돌리고 알림을 재예약한다', async () => {
    const res = await setEventCompletion({ eventId: 'evt-1', completed: false, caller: 'test' });

    expect(res.ok).toBe(true);
    expect(mockLastPatch?.completed_at).toBeNull();
    expect(scheduleEventNotification).toHaveBeenCalledWith(ROW);
    expect(cancelEventNotification).not.toHaveBeenCalled();
  });

  test('갱신된 행이 없으면 재예약하지 않는다', async () => {
    mockUpdateResult = { data: [], error: null };
    await setEventCompletion({ eventId: 'evt-1', completed: false, caller: 'test' });
    expect(scheduleEventNotification).not.toHaveBeenCalled();
  });
});

describe('setEventCompletion — DB 오류', () => {
  test('ok=false로 보고하고 알림은 건드리지 않는다', async () => {
    mockUpdateResult = { data: null, error: { message: 'permission denied' } };
    const res = await setEventCompletion({ eventId: 'evt-1', completed: true, caller: 'test' });

    expect(res.ok).toBe(false);
    expect(res.error).toBe('permission denied');
    expect(cancelEventNotification).not.toHaveBeenCalled();
    expect(scheduleEventNotification).not.toHaveBeenCalled();
  });
});
