// Supabase client mock
const mockInsert = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();
const mockSelect = jest.fn();
const mockSingle = jest.fn();
const mockEq    = jest.fn();
const mockOrder = jest.fn();
const mockGte   = jest.fn();
const mockLte   = jest.fn();
const mockIs    = jest.fn();

function chainMock(finalValue: unknown) {
  const m: Record<string, jest.Mock> = {};
  const chain = () => m;
  m.select  = jest.fn().mockReturnValue(m);
  m.insert  = jest.fn().mockReturnValue(m);
  m.update  = jest.fn().mockReturnValue(m);
  m.delete  = jest.fn().mockReturnValue(m);
  m.eq      = jest.fn().mockReturnValue(m);
  m.neq     = jest.fn().mockReturnValue(m);
  m.gte     = jest.fn().mockReturnValue(m);
  m.lte     = jest.fn().mockReturnValue(m);
  m.is      = jest.fn().mockReturnValue(m);
  m.order   = jest.fn().mockReturnValue(m);
  m.single  = jest.fn().mockResolvedValue(finalValue);
  // Make the chain itself awaitable (for .delete(), .update() without .single())
  Object.assign(m, { then: (resolve: (v: unknown) => void) => Promise.resolve(finalValue).then(resolve) });
  return m;
}

jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-abc' } } }),
    },
    from: jest.fn(),
    channel: jest.fn(() => ({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn().mockReturnThis(),
    })),
    removeChannel: jest.fn(),
  },
}));

const { supabase } = require('../lib/supabase');

describe('TeamCalendarService', () => {
  let service: InstanceType<typeof import('../services/team/TeamCalendarService').TeamCalendarService>;

  beforeEach(() => {
    jest.clearAllMocks();
    const { TeamCalendarService } = require('../services/team/TeamCalendarService');
    service = new TeamCalendarService();
  });

  describe('requestEvent', () => {
    test('inserts event_requests row with correct fields', async () => {
      const mockRow = {
        id: 'req-1',
        requester_id: 'user-abc',
        target_user_id: 'user-xyz',
        title: '팀 회의',
        start_at: '2026-06-01T10:00:00Z',
        end_at: '2026-06-01T11:00:00Z',
        status: 'pending',
        team_id: null,
        location: null,
        note: null,
        event_id: null,
        responded_at: null,
        created_at: '2026-05-24T00:00:00Z',
        updated_at: '2026-05-24T00:00:00Z',
      };

      const chain = chainMock({ data: mockRow, error: null });
      supabase.from.mockReturnValue(chain);

      const result = await service.requestEvent({
        targetUserId: 'user-xyz',
        title: '팀 회의',
        startAt: '2026-06-01T10:00:00Z',
        endAt: '2026-06-01T11:00:00Z',
      });

      expect(supabase.from).toHaveBeenCalledWith('event_requests');
      expect(result.title).toBe('팀 회의');
    });

    test('throws when not authenticated', async () => {
      (supabase.auth.getUser as jest.Mock).mockResolvedValueOnce({ data: { user: null } });
      await expect(
        service.requestEvent({ targetUserId: 'x', title: 't', startAt: '', endAt: '' })
      ).rejects.toThrow('로그인이 필요합니다.');
    });
  });

  describe('rejectRequest', () => {
    test('updates status to rejected', async () => {
      const chain = chainMock({ error: null });
      supabase.from.mockReturnValue(chain);

      await service.rejectRequest('req-1');

      expect(supabase.from).toHaveBeenCalledWith('event_requests');
    });
  });

  describe('getPendingRequests', () => {
    test('returns pending requests for current user', async () => {
      const rows = [
        { id: 'r1', target_user_id: 'user-abc', status: 'pending', title: '미팅' },
      ];
      const chain = chainMock({ data: rows, error: null });
      chain.then = jest.fn().mockImplementation((resolve: (v: unknown) => void) => Promise.resolve({ data: rows }).then(resolve));
      chain.order = jest.fn().mockResolvedValue({ data: rows });
      supabase.from.mockReturnValue(chain);

      const result = await service.getPendingRequests();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('subscribeToTeamEvents', () => {
    test('creates realtime channel with correct filter', () => {
      const channelMock = {
        on: jest.fn().mockReturnThis(),
        subscribe: jest.fn().mockReturnThis(),
      };
      supabase.channel.mockReturnValue(channelMock);

      service.subscribeToTeamEvents('team-1', jest.fn());

      expect(supabase.channel).toHaveBeenCalledWith('team_events:team-1');
    });
  });

  describe('broadcastEvent', () => {
    test('inserts team_events row', async () => {
      const mockEvent = {
        id: 'te-1',
        team_id: 'team-1',
        created_by: 'user-abc',
        title: '전체 회의',
        start_at: '2026-06-01T09:00:00Z',
        end_at: '2026-06-01T10:00:00Z',
        scope: 'broadcast',
      };
      const chain = chainMock({ data: mockEvent, error: null });
      supabase.from.mockReturnValue(chain);

      const result = await service.broadcastEvent({
        teamId: 'team-1',
        title: '전체 회의',
        startAt: '2026-06-01T09:00:00Z',
        endAt: '2026-06-01T10:00:00Z',
      });

      expect(result.title).toBe('전체 회의');
      expect(result.scope).toBe('broadcast');
    });
  });
});
