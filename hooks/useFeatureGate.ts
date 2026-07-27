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
  const { plan, commandUsed, commandLimit } = useSubscriptionStore();

  const allowed = isFeatureAllowed(feature, plan);
  const gateType = getGateType(feature);
  const upgradeTarget = getUpgradeTarget(feature);

  // 음성 사용량은 서버 권위 단일 버킷(commandUsed/commandLimit)으로 표시.
  // limit는 서버 값 우선, 없으면 플랜 상수(getMonthlyLimit)로 폴백.
  let usageInfo: FeatureGateResult['usageInfo'];
  const quotaKey = QUOTA_FEATURE_MAP[feature];
  if (quotaKey) {
    const limit = commandLimit ?? getMonthlyLimit(
      feature as 'voice_create' | 'voice_modify' | 'voice_query',
      plan,
    );
    if (limit !== null) {
      const used = commandUsed;
      usageInfo = {
        used,
        limit,
        percentage: Math.min(100, Math.round((used / limit) * 100)),
      };
    }
  }

  return { isAllowed: allowed, gateType, upgradeTarget, usageInfo };
}
