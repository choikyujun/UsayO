import {
  FEATURE_GATES,
  FeatureKey,
  getGateType,
  getMonthlyLimit,
  getUpgradeTarget,
  isFeatureAllowed,
  PlanType,
} from '../constants/featureGates';

// ── isFeatureAllowed ──────────────────────────────────────

describe('isFeatureAllowed', () => {
  // 사용량 제한 피처 (free 허용, limit 있음)
  test('voice_create: free 플랜 → 허용 (사용량 제한 있음)', () => {
    expect(isFeatureAllowed('voice_create', 'free')).toBe(true);
  });

  test('voice_create: pro/team 플랜 → 허용', () => {
    expect(isFeatureAllowed('voice_create', 'pro')).toBe(true);
    expect(isFeatureAllowed('voice_create', 'team')).toBe(true);
  });

  // Boolean — 전 플랜 허용
  test('google_sync: 전 플랜 허용', () => {
    expect(isFeatureAllowed('google_sync', 'free')).toBe(true);
    expect(isFeatureAllowed('google_sync', 'pro')).toBe(true);
    expect(isFeatureAllowed('google_sync', 'team')).toBe(true);
  });

  // Team-only 피처
  test('team_calendar: free/pro → 거부', () => {
    expect(isFeatureAllowed('team_calendar', 'free')).toBe(false);
    expect(isFeatureAllowed('team_calendar', 'pro')).toBe(false);
  });

  test('team_calendar: team → 허용', () => {
    expect(isFeatureAllowed('team_calendar', 'team')).toBe(true);
  });

  test('wokytoky_sync: free/pro → 거부, team → 허용', () => {
    expect(isFeatureAllowed('wokytoky_sync', 'free')).toBe(false);
    expect(isFeatureAllowed('wokytoky_sync', 'pro')).toBe(false);
    expect(isFeatureAllowed('wokytoky_sync', 'team')).toBe(true);
  });

});

// ── getGateType ───────────────────────────────────────────

describe('getGateType', () => {
  test('voice_create → usage', () => {
    expect(getGateType('voice_create')).toBe('usage');
  });

  test('voice_modify → usage', () => {
    expect(getGateType('voice_modify')).toBe('usage');
  });

  test('google_sync → hard', () => {
    expect(getGateType('google_sync')).toBe('hard');
  });

  test('ai_slot → hard', () => {
    expect(getGateType('ai_slot')).toBe('hard');
  });

  test('team_calendar → team', () => {
    expect(getGateType('team_calendar')).toBe('team');
  });

  test('wokytoky_sync → team', () => {
    expect(getGateType('wokytoky_sync')).toBe('team');
  });

  test('widget_medium → hard', () => {
    expect(getGateType('widget_medium')).toBe('hard');
  });
});

// ── getUpgradeTarget ──────────────────────────────────────

describe('getUpgradeTarget', () => {
  test('google_sync → pro', () => {
    expect(getUpgradeTarget('google_sync')).toBe('pro');
  });

  test('ai_slot → pro', () => {
    expect(getUpgradeTarget('ai_slot')).toBe('pro');
  });

  test('team_calendar → team', () => {
    expect(getUpgradeTarget('team_calendar')).toBe('team');
  });

  test('wokytoky_sync → team', () => {
    expect(getUpgradeTarget('wokytoky_sync')).toBe('team');
  });

  test('on_device → team', () => {
    expect(getUpgradeTarget('on_device')).toBe('team');
  });
});

// ── getMonthlyLimit ───────────────────────────────────────

describe('getMonthlyLimit', () => {
  test('voice_create: free → 50', () => {
    expect(getMonthlyLimit('voice_create', 'free')).toBe(50);
  });

  test('voice_modify: free → 20', () => {
    expect(getMonthlyLimit('voice_modify', 'free')).toBe(20);
  });

  test('voice_query: free → 30', () => {
    expect(getMonthlyLimit('voice_query', 'free')).toBe(30);
  });

  test('voice_create: pro → null (unlimited)', () => {
    expect(getMonthlyLimit('voice_create', 'pro')).toBeNull();
  });

  test('voice_create: team → null (unlimited)', () => {
    expect(getMonthlyLimit('voice_create', 'team')).toBeNull();
  });
});

// ── FEATURE_GATES 구조 검증 ───────────────────────────────

describe('FEATURE_GATES 상수 구조', () => {
  const allFeatures = Object.keys(FEATURE_GATES) as FeatureKey[];
  const allPlans: PlanType[] = ['free', 'pro', 'team'];

  test('모든 피처가 3개 플랜 값을 가짐', () => {
    for (const feature of allFeatures) {
      for (const plan of allPlans) {
        const val = FEATURE_GATES[feature][plan];
        expect(val).toBeDefined();
      }
    }
  });

  test('team 전용 피처는 pro도 false', () => {
    const teamOnly: FeatureKey[] = ['team_calendar', 'on_device', 'wokytoky_sync', 'admin_dashboard'];
    for (const f of teamOnly) {
      expect(FEATURE_GATES[f].pro).toBe(false);
      expect(FEATURE_GATES[f].team).not.toBe(false);
    }
  });

  test('pro 이상에서 unlimited인 피처는 team도 unlimited', () => {
    for (const feature of allFeatures) {
      const gate = FEATURE_GATES[feature];
      if (gate.pro === 'unlimited') {
        expect(gate.team).toBe('unlimited');
      }
    }
  });

  test('총 13개 피처 정의', () => {
    expect(allFeatures).toHaveLength(13);
  });
});
