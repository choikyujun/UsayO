import { create } from 'zustand';
import { PlanType } from '../constants/featureGates';

// backward compat alias
export type PlanTier = PlanType;

interface QuotaUsage {
  create: number;
  modify: number;
  query: number;
}

interface SubscriptionStore {
  plan: PlanType;
  quota: QuotaUsage;
  isTrialActive: boolean;

  // 서버 권위 단일 "월 음성 명령" 사용량 (stt-proxy 응답으로 갱신). limit=null → 무제한(유료).
  commandUsed: number;
  commandLimit: number | null;

  setPlan: (plan: PlanType) => void;
  setTrialEligible: (eligible: boolean) => void;
  setQuotaUsed: (type: keyof QuotaUsage, used: number) => void;
  setCommandUsage: (used: number, limit: number | null) => void;
  incrementCreate: () => void;
  incrementModify: () => void;
  incrementQuery: () => void;
  resetUsage: () => void;
}

const initialQuota: QuotaUsage = { create: 0, modify: 0, query: 0 };

export const useSubscriptionStore = create<SubscriptionStore>((set) => ({
  plan: 'free',
  quota: { ...initialQuota },
  isTrialActive: false,
  commandUsed: 0,
  commandLimit: null,

  setPlan: (plan) => set({ plan }),
  setTrialEligible: (eligible) => set({ isTrialActive: eligible }),
  setQuotaUsed: (type, used) =>
    set((s) => ({ quota: { ...s.quota, [type]: used } })),
  setCommandUsage: (used, limit) => set({ commandUsed: used, commandLimit: limit }),

  incrementCreate: () =>
    set((s) => ({ quota: { ...s.quota, create: s.quota.create + 1 } })),
  incrementModify: () =>
    set((s) => ({ quota: { ...s.quota, modify: s.quota.modify + 1 } })),
  incrementQuery: () =>
    set((s) => ({ quota: { ...s.quota, query: s.quota.query + 1 } })),
  resetUsage: () => set({ quota: { ...initialQuota } }),
}));
