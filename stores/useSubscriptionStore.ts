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

  setPlan: (plan: PlanType) => void;
  setTrialEligible: (eligible: boolean) => void;
  setQuotaUsed: (type: keyof QuotaUsage, used: number) => void;
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

  setPlan: (plan) => set({ plan }),
  setTrialEligible: (eligible) => set({ isTrialActive: eligible }),
  setQuotaUsed: (type, used) =>
    set((s) => ({ quota: { ...s.quota, [type]: used } })),

  incrementCreate: () =>
    set((s) => ({ quota: { ...s.quota, create: s.quota.create + 1 } })),
  incrementModify: () =>
    set((s) => ({ quota: { ...s.quota, modify: s.quota.modify + 1 } })),
  incrementQuery: () =>
    set((s) => ({ quota: { ...s.quota, query: s.quota.query + 1 } })),
  resetUsage: () => set({ quota: { ...initialQuota } }),
}));
