// 무료 플랜 월 음성 명령 상한 (단일 버킷). 서버 stt-proxy FREE_COMMAND_LIMIT와 동일 값 유지.
// 1 음성 명령 = STT(default) 1회 + 인텐트 1회를 1로 계수. confirm STT·멀티 저장은 미계수.
export const FREE_COMMAND_LIMIT = 60;

export const FEATURE_GATES = {
  // ── 음성 사용량: 단일 "월 음성 명령" 버킷(FREE_COMMAND_LIMIT) / Pro·Team 무제한 ──
  // (create/modify/query 3버킷은 폐기 — 서버는 command 단일 버킷만 강제. 아래 값은 표시/호환용)
  voice_create:      { free: { limit: FREE_COMMAND_LIMIT }, pro: 'unlimited', team: 'unlimited' },
  voice_modify:      { free: { limit: FREE_COMMAND_LIMIT }, pro: 'unlimited', team: 'unlimited' },
  voice_query:       { free: { limit: FREE_COMMAND_LIMIT }, pro: 'unlimited', team: 'unlimited' },

  // ── 캘린더 연동: 모든 플랜 무료 ───────────────────────────
  google_sync:       { free: true,             pro: true,            team: true         },
  apple_sync:        { free: true,             pro: true,            team: true         },

  // ── AI 슬롯 제안: Pro 전용 ────────────────────────────────
  ai_slot:           { free: false,            pro: true,            team: true         },

  // ── 위젯: 모든 플랜 무료 ─────────────────────────────────
  widget_small:      { free: true,             pro: true,            team: true         },
  widget_medium:     { free: true,             pro: true,            team: true         },
  widget_lockscreen: { free: true,             pro: true,            team: true         },

  // ── 팀 전용 ───────────────────────────────────────────────
  team_calendar:     { free: false,            pro: false,           team: true         },
  on_device:         { free: false,            pro: false,           team: true         },
  wokytoky_sync:     { free: false,            pro: false,           team: true         },
  admin_dashboard:   { free: false,            pro: false,           team: true         },
} as const;

export type FeatureKey = keyof typeof FEATURE_GATES;
export type PlanType = 'free' | 'pro' | 'team';
export type GateType = 'hard' | 'usage' | 'team';

// 플랜에서 해당 피처가 허용되는지 (사용량 초과 여부는 별도 체크)
export function isFeatureAllowed(feature: FeatureKey, plan: PlanType): boolean {
  const gate = FEATURE_GATES[feature][plan];
  if (gate === false) return false;
  return true; // true | 'unlimited' | 'all' | { limit } | { count } 모두 허용
}

// 피처의 게이트 유형 반환
export function getGateType(feature: FeatureKey): GateType {
  const gate = FEATURE_GATES[feature];

  // TEAM: pro도 false인 경우
  if (gate.pro === false) return 'team';

  // USAGE: free 플랜에 수치 제한이 있는 경우
  const freeGate = gate.free;
  if (typeof freeGate === 'object') return 'usage';

  return 'hard';
}

// 피처를 해제하려면 어느 플랜으로 업그레이드해야 하는지
export function getUpgradeTarget(feature: FeatureKey): 'pro' | 'team' {
  return FEATURE_GATES[feature].pro === false ? 'team' : 'pro';
}

// 사용량 기반 피처의 월별 한도 (unlimited이면 null)
export function getMonthlyLimit(
  feature: 'voice_create' | 'voice_modify' | 'voice_query',
  plan: PlanType,
): number | null {
  const gate = FEATURE_GATES[feature][plan];
  if (gate === 'unlimited') return null;
  if (typeof gate === 'object' && 'limit' in gate) return gate.limit;
  return null;
}
