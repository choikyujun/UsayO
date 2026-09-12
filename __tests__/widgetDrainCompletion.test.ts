// 진입점 4 — 위젯 완료 큐 드레인.
//
// 위젯에서 앱 없이 탭한 완료는 앱 실행 시 여기서 서버로 반영된다. 이 경로도 앱 안 완료와
// 같은 setEventCompletion을 거쳐야 알림이 함께 취소된다(종전에는 supabase를 직접 호출했다).
// 큐 제거·applied 집계 같은 기존 동작이 그대로인지도 같이 고정한다.

let mockQueue: Array<{ id: string; done: boolean; ts: number }> = [];
let mockCompletionResult: { ok: boolean; rows: number; event: unknown; error?: string } =
  { ok: true, rows: 1, event: null };

jest.mock('../modules/YuSayWidgetBridge', () => ({
  getPendingCompletions: jest.fn(async () => JSON.stringify(mockQueue)),
  removePendingCompletion: jest.fn(async () => {}),
}));
jest.mock('../services/eventCompletion', () => ({
  setEventCompletion: jest.fn(async () => mockCompletionResult),
}));
jest.mock('../services/widget/WidgetService', () => ({
  widgetService: { push: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('../utils/fetchExpandedEvents', () => ({
  eventsDateRange: () => ({ from: '2026-01-01', to: '2026-01-02' }),
  fetchExpandedEvents: jest.fn().mockResolvedValue({ events: [], parents: [] }),
}));
jest.mock('../lib/supabase', () => ({ supabase: { from: () => ({}) } }));
jest.mock('../stores/useAuthStore', () => ({
  useAuthStore: { getState: () => ({ userId: 'user-1' }) },
}));
jest.mock('../stores/useDataSyncStore', () => ({
  useDataSyncStore: { getState: () => ({ bump: jest.fn() }) },
}));
jest.mock('react-native', () => ({
  Platform: { OS: 'ios', select: (o: Record<string, unknown>) => o.ios ?? o.default },
}));

import { drainPendingCompletions } from '../services/widget/widgetRefresh';
import { setEventCompletion } from '../services/eventCompletion';
import { removePendingCompletion } from '../modules/YuSayWidgetBridge';

const NOW = Date.UTC(2026, 8, 12, 3, 0, 0);

beforeEach(() => {
  mockQueue = [];
  mockCompletionResult = { ok: true, rows: 1, event: null };
  jest.clearAllMocks();
});

describe('drainPendingCompletions', () => {
  test('큐 항목을 setEventCompletion으로 반영한다 (알림 취소가 같이 일어나는 경로)', async () => {
    mockQueue = [{ id: 'evt-1', done: true, ts: NOW - 1000 }];
    await drainPendingCompletions(NOW);

    expect(setEventCompletion).toHaveBeenCalledWith({
      eventId: 'evt-1',
      completed: true,
      caller: 'widgetDrain',
      atIso: new Date(NOW).toISOString(),
    });
    expect(removePendingCompletion).toHaveBeenCalledWith('evt-1');
  });

  test('위젯에서 완료를 해제한 항목은 completed=false로 넘긴다', async () => {
    mockQueue = [{ id: 'evt-2', done: false, ts: NOW - 1000 }];
    await drainPendingCompletions(NOW);
    expect(setEventCompletion).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 'evt-2', completed: false }),
    );
  });

  test('갱신된 행이 0개여도(이벤트 삭제됨) 큐에서 제거한다 — 기존 동작 유지', async () => {
    mockQueue = [{ id: 'evt-3', done: true, ts: NOW - 1000 }];
    mockCompletionResult = { ok: true, rows: 0, event: null };
    await drainPendingCompletions(NOW);
    expect(removePendingCompletion).toHaveBeenCalledWith('evt-3');
  });

  test('DB 실패면 큐에 남겨 다음에 재시도한다 — 기존 동작 유지', async () => {
    mockQueue = [{ id: 'evt-4', done: true, ts: NOW - 1000 }];
    mockCompletionResult = { ok: false, rows: 0, event: null, error: 'network' };
    await drainPendingCompletions(NOW);
    expect(removePendingCompletion).not.toHaveBeenCalled();
  });

  test('7일 지난 항목은 반영하지 않고 폐기한다 — 기존 동작 유지', async () => {
    mockQueue = [{ id: 'evt-5', done: true, ts: NOW - 8 * 24 * 60 * 60 * 1000 }];
    await drainPendingCompletions(NOW);
    expect(setEventCompletion).not.toHaveBeenCalled();
    expect(removePendingCompletion).toHaveBeenCalledWith('evt-5');
  });
});
