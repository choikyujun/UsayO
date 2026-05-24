import { useSubscriptionStore } from '../stores/useSubscriptionStore';
import {
  FeatureKey,
  GateType,
  getGateType,
  getMonthlyLimit,
  getUpgradeTarget,
  isFeatureAllowed,
} from '../constants/featureGates';

export interface FeatureGateResult {
  isAllowed: boolean;
  gateType: GateType;
  upgradeTarget: 'pro' | 'team';
  usageInfo?: {
    used: number;
    limit: number;
    percentage: number;
  };
}

const QUOTA_FEATURE_MAP: Partial<Record<FeatureKey, 'create' | 'modify' | 'query'>> = {
  voice_create: 'create',
  voice_modify: 'modify',
  voice_query:  'query',
};

export function useFeatureGate(feature: FeatureKey): FeatureGateResult {
  const { plan, quota } = useSubscriptionStore();

  const allowed = isFeatureAllowed(feature, plan);
  const gateType = getGateType(feature);
  const upgradeTarget = getUpgradeTarget(feature);

  // 사용량 기반 피처는 한도 정보도 반환
  let usageInfo: FeatureGateResult['usageInfo'];
  const quotaKey = QUOTA_FEATURE_MAP[feature];
  if (quotaKey) {
    const limit = getMonthlyLimit(
      feature as 'voice_create' | 'voice_modify' | 'voice_query',
      plan,
    );
    if (limit !== null) {
      const used = quota[quotaKey];
      usageInfo = {
        used,
        limit,
        percentage: Math.min(100, Math.round((used / limit) * 100)),
      };
    }
  }

  return { isAllowed: allowed, gateType, upgradeTarget, usageInfo };
}
