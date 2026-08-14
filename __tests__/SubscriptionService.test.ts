import { PlanType } from '../constants/featureGates';

// RevenueCat 제거 후 재작성.
// 이전 테스트는 entitlement→plan 매핑과 체험 자격을 검증했지만, 그 판정은 이제 **서버**가 한다
// (verify-purchase가 subscriptions에 write, 클라는 읽기만). 클라에 남은 책임은
//   · 스토어 호출 위임(purchasePro / restorePurchases)
//   · 서버 권위 플랜 재조회(refreshFromServer)
//   · 게이트 판정(isFeatureAllowed / getGateType / getUpgradeTarget)
// 이라 그 세 가지를 검증한다.

// ── Mocks ────────────────────────────────────────────────────

const mockPurchasePro = jest.fn();
const mockRestorePurchases = jest.fn();
const mockLoadProducts = jest.fn();
const mockOpenManage = jest.fn();

jest.mock('../lib/iap', () => ({
  purchasePro: (...args: unknown[]) => mockPurchasePro(...args),
  restorePurchases: (...args: unknown[]) => mockRestorePurchases(...args),
  loadProducts: (...args: unknown[]) => mockLoadProducts(...args),
  openManageSubscriptions: (...args: unknown[]) => mockOpenManage(...args),
}));

const mockRefreshFromServer = jest.fn().mockResolvedValue(undefined);
jest.mock('../services/subscription/QuotaTracker', () => ({
  quotaTracker: { refreshFromServer: (...args: unknown[]) => mockRefreshFromServer(...args) },
}));

const mockSetPlan = jest.fn();
const mockGetState = jest.fn(() => ({ plan: 'free' as PlanType, setPlan: mockSetPlan }));
jest.mock('../stores/useSubscriptionStore', () => ({
  useSubscriptionStore: { getState: () => mockGetState() },
}));

// ── Tests ────────────────────────────────────────────────────

describe('SubscriptionService', () => {
  let service: import('../services/subscription/SubscriptionService').SubscriptionService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRefreshFromServer.mockResolvedValue(undefined);
    const { SubscriptionService } = require('../services/subscription/SubscriptionService');
    service = new SubscriptionService();
  });

  describe('getCurrentPlan', () => {
    test('캐시된 플랜을 즉시 반환한다', async () => {
      mockGetState.mockReturnValue({ plan: 'pro' as PlanType, setPlan: mockSetPlan });
      await expect(service.getCurrentPlan()).resolves.toBe('pro');
    });

    test('백그라운드로 서버 재조회를 건다', async () => {
      await service.getCurrentPlan();
      expect(mockRefreshFromServer).toHaveBeenCalled();
    });

    test('서버 재조회가 실패해도 캐시 값을 돌려준다', async () => {
      // clearAllMocks는 호출 기록만 지우고 mockReturnValue는 남는다 → 이 테스트에서 명시적으로 지정.
      mockGetState.mockReturnValue({ plan: 'free' as PlanType, setPlan: mockSetPlan });
      mockRefreshFromServer.mockRejectedValue(new Error('network'));
      await expect(service.getCurrentPlan()).resolves.toBe('free');
    });
  });

  describe('purchasePro', () => {
    test('선택한 주기를 그대로 전달한다', async () => {
      mockPurchasePro.mockResolvedValue(undefined);
      await service.purchasePro('annual');
      expect(mockPurchasePro).toHaveBeenCalledWith('annual');
    });

    test('스토어 오류를 호출부로 전파한다(로딩 해제용)', async () => {
      mockPurchasePro.mockRejectedValue(new Error('store unavailable'));
      await expect(service.purchasePro('monthly')).rejects.toThrow('store unavailable');
    });
  });

  describe('restorePurchases', () => {
    test('복원 성공 시 true', async () => {
      mockRestorePurchases.mockResolvedValue(true);
      await expect(service.restorePurchases()).resolves.toBe(true);
    });

    test('복원할 구매가 없으면 false', async () => {
      mockRestorePurchases.mockResolvedValue(false);
      await expect(service.restorePurchases()).resolves.toBe(false);
    });
  });

  describe('isFeatureAllowed', () => {
    test('ai_slot blocked on free plan', () => {
      mockGetState.mockReturnValue({ plan: 'free' as PlanType, setPlan: mockSetPlan });
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

  describe('게이트 메타', () => {
    test('team_calendar의 업그레이드 대상은 team', () => {
      expect(service.getUpgradeTarget('team_calendar')).toBe('team');
    });

    test('ai_slot의 업그레이드 대상은 pro', () => {
      expect(service.getUpgradeTarget('ai_slot')).toBe('pro');
    });
  });
});
