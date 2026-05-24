import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabase';
import { useSubscriptionStore } from '../../stores/useSubscriptionStore';
import { getMonthlyLimit, PlanType } from '../../constants/featureGates';

type QuotaType = 'create' | 'modify' | 'query';

interface QuotaEntry {
  used: number;
  month: string; // "2026-05"
}

interface QuotaStatus {
  used: number;
  limit: number | null;  // null = unlimited
  percentage: number;
  daysUntilReset: number;
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function daysUntilMonthEnd(): number {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return lastDay.getDate() - now.getDate();
}

function storageKey(type: QuotaType): string {
  return `yusay_quota_${type}_${currentMonth()}`;
}

const FEATURE_MAP: Record<QuotaType, 'voice_create' | 'voice_modify' | 'voice_query'> = {
  create: 'voice_create',
  modify: 'voice_modify',
  query: 'voice_query',
};

export class QuotaTracker {
  async incrementUsage(type: QuotaType): Promise<void> {
    const key = storageKey(type);
    const raw = await AsyncStorage.getItem(key);
    const entry: QuotaEntry = raw
      ? JSON.parse(raw)
      : { used: 0, month: currentMonth() };

    entry.used += 1;
    entry.month = currentMonth();
    await AsyncStorage.setItem(key, JSON.stringify(entry));

    // Zustand store 동기화
    const store = useSubscriptionStore.getState();
    store.setQuotaUsed(type, entry.used);

    // 백그라운드 서버 동기화
    this.syncToServer(type, entry.used).catch(() => {});
  }

  async getStatus(type: QuotaType): Promise<QuotaStatus> {
    const key = storageKey(type);
    const raw = await AsyncStorage.getItem(key);
    const entry: QuotaEntry = raw
      ? JSON.parse(raw)
      : { used: 0, month: currentMonth() };

    // 월이 바뀌었으면 리셋
    const used = entry.month === currentMonth() ? entry.used : 0;

    const plan = useSubscriptionStore.getState().plan as PlanType;
    const limit = getMonthlyLimit(FEATURE_MAP[type], plan);
    const percentage = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;

    return {
      used,
      limit,
      percentage,
      daysUntilReset: daysUntilMonthEnd(),
    };
  }

  async checkQuota(type: QuotaType): Promise<boolean> {
    const status = await this.getStatus(type);
    if (status.limit === null) return true; // unlimited
    return status.used < status.limit;
  }

  // AsyncStorage에서 모든 타입 로드해서 store 초기화
  async loadAllFromStorage(): Promise<void> {
    const types: QuotaType[] = ['create', 'modify', 'query'];
    const store = useSubscriptionStore.getState();

    for (const type of types) {
      const key = storageKey(type);
      const raw = await AsyncStorage.getItem(key);
      if (raw) {
        const entry: QuotaEntry = JSON.parse(raw);
        if (entry.month === currentMonth()) {
          store.setQuotaUsed(type, entry.used);
        }
      }
    }
  }

  private async syncToServer(type: QuotaType, used: number): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.rpc('increment_quota', {
      p_user_id: user.id,
      p_month: currentMonth(),
      p_action: type,
    });
  }
}

export const quotaTracker = new QuotaTracker();
