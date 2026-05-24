import { ENTITLEMENTS } from '../constants/pricing';
import { PlanType } from '../constants/featureGates';

// ── Mocks ────────────────────────────────────────────────────

const mockGetCustomerInfo = jest.fn();
const mockPurchasePackage = jest.fn();
const mockRestorePurchases = jest.fn();
const mockGetOfferings = jest.fn();
const mockShowManagePurchases = jest.fn();

jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    getCustomerInfo: (...args: unknown[]) => mockGetCustomerInfo(...args),
    purchasePackage: (...args: unknown[]) => mockPurchasePackage(...args),
    restorePurchases: (...args: unknown[]) => mockRestorePurchases(...args),
    getOfferings: (...args: unknown[]) => mockGetOfferings(...args),
    showManagePurchases: (...args: unknown[]) => mockShowManagePurchases(...args),
  },
  LOG_LEVEL: { DEBUG: 'DEBUG' },
}));

const mockSetPlan = jest.fn();
const mockSetTrialEligible = jest.fn();
const mockGetState = jest.fn(() => ({
  plan: 'free' as PlanType,
  setPlan: mockSetPlan,
  setTrialEligible: mockSetTrialEligible,
}));

jest.mock('../stores/useSubscriptionStore', () => ({
  useSubscriptionStore: { getState: () => mockGetState() },
}));

jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-123' } } }),
    },
    from: jest.fn(() => ({
      update: jest.fn(() => ({ eq: jest.fn().mockResolvedValue({ error: null }) })),
    })),
  },
}));

// ── Helpers ──────────────────────────────────────────────────

function makeCustomerInfo(entitlements: string[] = []) {
  const active: Record<string, { periodType: string; expirationDate: string | null }> = {};
  const all: Record<string, unknown> = {};
  for (const e of entitlements) {
    active[e] = { periodType: 'NORMAL', expirationDate: '2026-12-31T00:00:00Z' };
    all[e] = active[e];
  }
  return { entitlements: { active, all } };
}

// ── Tests ────────────────────────────────────────────────────

describe('SubscriptionService', () => {
  let service: import('../services/subscription/SubscriptionService').SubscriptionService;

  beforeEach(() => {
    jest.clearAllMocks();
    const { SubscriptionService } = require('../services/subscription/SubscriptionService');
    service = new SubscriptionService();
  });

  describe('syncFromRevenueCat', () => {
    test('free plan when no active entitlements', async () => {
      mockGetCustomerInfo.mockResolvedValue(makeCustomerInfo([]));
      await service.syncFromRevenueCat();
      expect(mockSetPlan).toHaveBeenCalledWith('free');
    });

    test('pro plan when pro_access entitlement active', async () => {
      mockGetCustomerInfo.mockResolvedValue(makeCustomerInfo([ENTITLEMENTS.pro]));
      await service.syncFromRevenueCat();
      expect(mockSetPlan).toHaveBeenCalledWith('pro');
    });

    test('team plan when team_access entitlement active', async () => {
      mockGetCustomerInfo.mockResolvedValue(makeCustomerInfo([ENTITLEMENTS.team]));
      await service.syncFromRevenueCat();
      expect(mockSetPlan).toHaveBeenCalledWith('team');
    });

    test('team takes priority over pro when both active', async () => {
      mockGetCustomerInfo.mockResolvedValue(
        makeCustomerInfo([ENTITLEMENTS.pro, ENTITLEMENTS.team])
      );
      await service.syncFromRevenueCat();
      expect(mockSetPlan).toHaveBeenCalledWith('team');
    });
  });

  describe('purchaseSubscription', () => {
    test('returns pro plan and calls setPlan after successful purchase', async () => {
      const pkg = { packageType: 'MONTHLY', offeringIdentifier: 'default' };
      mockPurchasePackage.mockResolvedValue({
        customerInfo: makeCustomerInfo([ENTITLEMENTS.pro]),
      });

      const plan = await service.purchaseSubscription(pkg as never);
      expect(plan).toBe('pro');
      expect(mockSetPlan).toHaveBeenCalledWith('pro');
    });

    test('propagates error when purchase fails', async () => {
      const err = new Error('cancelled');
      mockPurchasePackage.mockRejectedValue(err);
      await expect(service.purchaseSubscription({} as never)).rejects.toThrow('cancelled');
    });
  });

  describe('restorePurchases', () => {
    test('restores to pro plan', async () => {
      mockRestorePurchases.mockResolvedValue(makeCustomerInfo([ENTITLEMENTS.pro]));
      const plan = await service.restorePurchases();
      expect(plan).toBe('pro');
      expect(mockSetPlan).toHaveBeenCalledWith('pro');
    });

    test('restores to free when no prior purchases', async () => {
      mockRestorePurchases.mockResolvedValue(makeCustomerInfo([]));
      const plan = await service.restorePurchases();
      expect(plan).toBe('free');
    });
  });

  describe('isEligibleForTrial', () => {
    test('eligible when never subscribed', async () => {
      mockGetCustomerInfo.mockResolvedValue(makeCustomerInfo([]));
      const eligible = await service.isEligibleForTrial();
      expect(eligible).toBe(true);
    });

    test('not eligible when previously subscribed', async () => {
      const info = makeCustomerInfo([]);
      // Add the entitlement to all (past subscription) but not active
      (info.entitlements as { all: Record<string, unknown> }).all[ENTITLEMENTS.pro] = {
        periodType: 'NORMAL',
        expirationDate: '2025-01-01T00:00:00Z',
      };
      mockGetCustomerInfo.mockResolvedValue(info);
      const eligible = await service.isEligibleForTrial();
      expect(eligible).toBe(false);
    });
  });

  describe('isFeatureAllowed', () => {
    test('ai_slot blocked on free plan', () => {
      mockGetState.mockReturnValue({ plan: 'free', setPlan: mockSetPlan, setTrialEligible: mockSetTrialEligible });
      expect(service.isFeatureAllowed('ai_slot')).toBe(false);
    });

    test('ai_slot allowed on pro plan', () => {
      expect(service.isFeatureAllowed('ai_slot', 'pro')).toBe(true);
    });

    test('voice_create allowed on free plan', () => {
      expect(service.isFeatureAllowed('voice_create', 'free')).toBe(true);
    });

    test('team_calendar blocked on pro plan', () => {
      expect(service.isFeatureAllowed('team_calendar', 'pro')).toBe(false);
    });
  });
});
