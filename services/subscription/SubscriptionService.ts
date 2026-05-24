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

  private async _syncPlanToSupabase(plan: PlanType, info: CustomerInfo): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const proEntitlement = info.entitlements.active[ENTITLEMENTS.pro];
    const teamEntitlement = info.entitlements.active[ENTITLEMENTS.team];
    const activeEntitlement = teamEntitlement ?? proEntitlement;
    const expiresAt = activeEntitlement?.expirationDate ?? null;

    await supabase
      .from('profiles')
      .update({ plan, plan_expires_at: expiresAt, updated_at: new Date().toISOString() })
      .eq('id', user.id);
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
