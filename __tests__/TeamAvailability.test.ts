// Mock Supabase
const mockFrom = jest.fn();

jest.mock('../lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

import { TeamAvailabilityService } from '../services/team/TeamAvailabilityService';

function makeEvent(userId: string, startHour: number, endHour: number, date = '2026-06-02') {
  return {
    user_id: userId,
    start_at: `${date}T${String(startHour).padStart(2, '0')}:00:00.000Z`,
    end_at:   `${date}T${String(endHour).padStart(2, '0')}:00:00.000Z`,
  };
}

function chainFor(data: unknown) {
  const resolved = { data, error: null };
  const m: Record<string, jest.Mock> & { then: jest.Mock } = {
    then: jest.fn().mockImplementation(
      (resolve: (v: unknown) => unknown) => Promise.resolve(resolved).then(resolve)
    ),
  } as any;
  // All query methods return the same chain so it can be awaited at any point
  for (const method of ['select', 'insert', 'update', 'delete', 'eq', 'neq', 'in', 'gte', 'lte', 'is', 'order']) {
    m[method] = jest.fn().mockReturnValue(m);
  }
  m.single = jest.fn().mockResolvedValue(resolved);
  return m;
}

describe('TeamAvailabilityService', () => {
  let service: TeamAvailabilityService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TeamAvailabilityService();
  });

  test('returns empty when team has no members', async () => {
    mockFrom.mockReturnValueOnce(chainFor([])); // team_members → empty
    const slots = await service.findCommonSlots('team-x', {
      start: '2026-06-02T09:00:00Z',
      end:   '2026-06-02T18:00:00Z',
    });
    expect(slots).toHaveLength(0);
  });

  test('returns full range when members have no events', async () => {
    const members = [{ user_id: 'u1' }, { user_id: 'u2' }];
    mockFrom
      .mockReturnValueOnce(chainFor(members))   // team_members
      .mockReturnValueOnce(chainFor([]));         // events → empty

    const slots = await service.findCommonSlots('team-1', {
      start: '2026-06-02T09:00:00Z',
      end:   '2026-06-02T18:00:00Z',
    }, 30);

    expect(slots.length).toBeGreaterThan(0);
    expect(slots[0].durationMinutes).toBe(9 * 60); // full 9-hour window
  });

  test('excludes blocked periods correctly', async () => {
    const members = [{ user_id: 'u1' }, { user_id: 'u2' }];
    const events = [
      makeEvent('u1', 10, 11), // u1 busy 10–11
      makeEvent('u2', 13, 14), // u2 busy 13–14
    ];
    mockFrom
      .mockReturnValueOnce(chainFor(members))
      .mockReturnValueOnce(chainFor(events));

    const slots = await service.findCommonSlots('team-1', {
      start: '2026-06-02T09:00:00Z',
      end:   '2026-06-02T17:00:00Z',
    }, 30);

    // Should have 3 free gaps: 09-10, 11-13, 14-17
    expect(slots).toHaveLength(3);
    expect(slots[0].durationMinutes).toBe(60);  // 09:00–10:00
    expect(slots[1].durationMinutes).toBe(120); // 11:00–13:00
    expect(slots[2].durationMinutes).toBe(180); // 14:00–17:00
  });

  test('filters out slots shorter than minDuration', async () => {
    const members = [{ user_id: 'u1' }];
    const events = [
      makeEvent('u1', 9, 9, '2026-06-02'),  // 9:00 → need exact ISO
      makeEvent('u1', 10, 11),
    ];
    // u1 has event 10:00–11:00, free gap 9:00–10:00 (60 min) and 11:00–17:00 (360 min)
    mockFrom
      .mockReturnValueOnce(chainFor(members))
      .mockReturnValueOnce(chainFor([makeEvent('u1', 10, 11)]));

    const slots = await service.findCommonSlots('team-1', {
      start: '2026-06-02T09:00:00Z',
      end:   '2026-06-02T17:00:00Z',
    }, 90); // 90-minute minimum

    // 09-10 (60 min) is excluded, 11-17 (360 min) passes
    expect(slots.every((s) => s.durationMinutes >= 90)).toBe(true);
  });

  test('merges overlapping busy blocks', async () => {
    const members = [{ user_id: 'u1' }, { user_id: 'u2' }];
    const events = [
      makeEvent('u1', 10, 12),
      makeEvent('u2', 11, 13), // overlaps with u1's block
    ];
    mockFrom
      .mockReturnValueOnce(chainFor(members))
      .mockReturnValueOnce(chainFor(events));

    const slots = await service.findCommonSlots('team-1', {
      start: '2026-06-02T09:00:00Z',
      end:   '2026-06-02T17:00:00Z',
    }, 30);

    // Busy 10–13, free 09-10 and 13-17
    expect(slots).toHaveLength(2);
    expect(slots[0].durationMinutes).toBe(60);  // 09:00–10:00
    expect(slots[1].durationMinutes).toBe(240); // 13:00–17:00
  });

  describe('findUserFreeSlots', () => {
    test('returns all-day slot when user has no events', async () => {
      mockFrom.mockReturnValueOnce(chainFor([]));
      const slots = await service.findUserFreeSlots('u1', '2026-06-02');
      expect(slots.length).toBeGreaterThan(0);
      expect(slots[0].durationMinutes).toBe(24 * 60); // Math.round(23h 59m 59.999s) = 1440
    });
  });
});
