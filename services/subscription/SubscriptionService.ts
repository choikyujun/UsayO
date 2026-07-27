import Purchases, { CustomerInfo, PurchasesPackage } from 'react-native-purchases';
import { supabase } from '../../lib/supabase';
import { useSubscriptionStore } from '../../stores/useSubscriptionStore';
import {
  FeatureKey,
  GateType,
  PlanType,
  getGateType,
  getUpgradeTarget,
  isFeatureAllowed,
} from '../../constants/featureGates';
import { ENTITLEMENTS, OFFERINGS } from '../../constants/pricing';

export class SubscriptionService {
  async getCustomerInfo(): Promise<CustomerInfo> {
    return Purchases.getCustomerInfo();
  }

  async getCurrentPlan(): Promise<PlanType> {
    const cached = useSubscriptionStore.getState().plan;
    // Refresh in background
    this.syncFromRevenueCat().catch(() => {});
    return cached;
  }

  async syncFromRevenueCat(): Promise<void> {
    const info = await Purchases.getCustomerInfo();
    const plan = this._planFromCustomerInfo(info);
    useSubscriptionStore.getState().setPlan(plan);
    useSubscriptionStore.getState().setTrialEligible(
      info.entitlements.active[ENTITLEMENTS.pro]?.periodType === 'TRIAL'
    );
    await this._syncPlanToSupabase(plan, info);
  }

  async purchaseSubscription(pkg: PurchasesPackage): Promise<PlanType> {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    const plan = this._planFromCustomerInfo(customerInfo);
    useSubscriptionStore.getState().setPlan(plan);
    await this._syncPlanToSupabase(plan, customerInfo);
    return plan;
  }

  async restorePurchases(): Promise<PlanType> {
    const info = await Purchases.restorePurchases();
    const plan = this._planFromCustomerInfo(info);
    useSubscriptionStore.getState().setPlan(plan);
    await this._syncPlanToSupabase(plan, info);
    return plan;
  }

  async isEligibleForTrial(): Promise<boolean> {
    const info = await Purchases.getCustomerInfo();
    const proEntitlement = info.entitlements.all[ENTITLEMENTS.pro];
    // If they've never had the entitlement, they're trial-eligible
    return !proEntitlement;
  }

  async getOfferings() {
    return Purchases.getOfferings();
  }

  openManageSubscription(): void {
    Purchases.showManageSubscriptions().catch(() => {});
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

  private _planFromCustomerInfo(info: CustomerInfo): PlanType {
    if (info.entitlements.active[ENTITLEMENTS.team]) return 'team';
    if (info.entitlements.active[ENTITLEMENTS.pro]) return 'pro';
    return 'free';
  }

  // profiles.plan은 클라이언트가 쓰지 않는다 (스푸핑 벡터 제거).
  // 권한 판정용 플랜은 RevenueCat 웹훅(서비스 롤)이 profiles/subscriptions에 기록하고,
  // 서버(stt-proxy)는 subscriptions만 신뢰한다. DB 트리거(protect_profile_plan)로도 클라 변경은 무력화됨.
  // (구매 직후 즉시 반영이 필요하면 웹훅 수신까지 store.plan을 로컬로만 갱신 — DB 기록 안 함.)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private async _syncPlanToSupabase(_plan: PlanType, _info: CustomerInfo): Promise<void> {
    /* no-op: 서버 권위. 클라 profiles.plan 쓰기 제거됨. */
  }
}

// Package identifier helpers used by OFFERINGS
export function proMonthlyOffering(offerings: Awaited<ReturnType<typeof Purchases.getOfferings>>) {
  return offerings.all[OFFERINGS.default]?.availablePackages.find(
    p => p.offeringIdentifier === OFFERINGS.default && p.packageType === 'MONTHLY'
  ) ?? null;
}

export function proAnnualOffering(offerings: Awaited<ReturnType<typeof Purchases.getOfferings>>) {
  return offerings.all[OFFERINGS.default]?.availablePackages.find(
    p => p.offeringIdentifier === OFFERINGS.default && p.packageType === 'ANNUAL'
  ) ?? null;
}

export const subscriptionService = new SubscriptionService();
