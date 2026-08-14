import { useSubscriptionStore } from '../../stores/useSubscriptionStore';
import {
  FeatureKey,
  GateType,
  PlanType,
  getGateType,
  getUpgradeTarget,
  isFeatureAllowed,
} from '../../constants/featureGates';
import {
  loadProducts,
  openManageSubscriptions,
  purchasePro,
  restorePurchases,
  type ProPeriod,
} from '../../lib/iap';
import { quotaTracker } from './QuotaTracker';

// 구독 서비스 — RevenueCat을 걷어내고 react-native-iap + 서버 검증(verify-purchase)으로 교체.
//
// 플랜 판정의 권위는 **서버**다:
//   · 구매/복원 → lib/iap가 verify-purchase Edge 호출 → Edge가 구글 API로 검증 후 subscriptions write
//   · 클라는 subscriptions를 읽기만 한다(quotaTracker.refreshFromServer → store.plan)
//   클라가 플랜을 스스로 정하는 경로는 없다(스푸핑 차단). 게이트 판정 함수는 그대로 유지.
export class SubscriptionService {
  /** 캐시된 플랜 즉시 반환 + 백그라운드로 서버 재조회. */
  async getCurrentPlan(): Promise<PlanType> {
    const cached = useSubscriptionStore.getState().plan;
    this.refreshFromServer().catch(() => {});
    return cached;
  }

  /** 서버(subscriptions)에서 권위 플랜·사용량을 로드해 store에 반영. */
  async refreshFromServer(): Promise<void> {
    await quotaTracker.refreshFromServer();
  }

  /** 스토어 상품 조회(가격 표시용). 페이월이 열릴 때 호출. */
  async loadProducts() {
    return loadProducts();
  }

  /**
   * Pro 구독 구매 요청. 결제창을 띄우기만 하고, 실제 성공 처리는
   * purchaseUpdatedListener(lib/iap의 connectIAP에서 등록)에서 서버 검증 후 이뤄진다.
   * 호출부는 onPurchased 콜백으로 완료를 받는다.
   */
  async purchasePro(period: ProPeriod): Promise<void> {
    await purchasePro(period);
  }

  /** 구매 복원(구글 플레이 필수 요건). true=복원됨 / false=복원할 구매 없음. */
  async restorePurchases(): Promise<boolean> {
    return restorePurchases();
  }

  /** 스토어 구독 관리 화면(해지·결제수단 변경). */
  openManageSubscription(): void {
    openManageSubscriptions();
  }

  isFeatureAllowed(feature: FeatureKey, plan?: PlanType): boolean {
    const currentPlan = plan ?? useSubscriptionStore.getState().plan;
    return isFeatureAllowed(feature, currentPlan);
  }

  getGateType(feature: FeatureKey): GateType {
    return getGateType(feature);
  }

  getUpgradeTarget(feature: FeatureKey): 'pro' | 'team' {
    return getUpgradeTarget(feature);
  }
}

export const subscriptionService = new SubscriptionService();
