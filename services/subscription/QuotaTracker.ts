import { supabase } from '../../lib/supabase';
import { useSubscriptionStore } from '../../stores/useSubscriptionStore';
import { FREE_COMMAND_LIMIT, PlanType } from '../../constants/featureGates';

// 서버 사이드 쿼터 강제(Phase B)로 전환됨.
// 카운트·한도의 권위는 서버(stt-proxy + user_quotas). 이 클래스는:
//  · 서버 값을 store로 로드(refreshFromServer)
//  · UX용 사전 검사(checkQuota) — 최종 강제는 항상 서버가 함
// 로컬 AsyncStorage 카운팅/increment_quota 직접 호출은 신뢰 불가라 제거함.

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7); // UTC 'YYYY-MM' — 서버와 동일 기준
}

function daysUntilMonthEnd(): number {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return lastDay.getDate() - now.getDate();
}

interface QuotaStatus {
  used: number;
  limit: number | null; // null = unlimited
  percentage: number;
  daysUntilReset: number;
}

export class QuotaTracker {
  // 앱 시작·복귀 시 서버 권위 플랜/사용량을 store에 로드.
  // 플랜은 subscriptions(웹훅 권위)만 신뢰 — profiles.plan은 클라 수정 가능이라 사용 안 함.
  async refreshFromServer(): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const store = useSubscriptionStore.getState();

    const { data: sub } = await supabase
      .from('subscriptions')
      .select('plan, status, current_period_end')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const active = !!sub
      && (sub.status === 'active' || sub.status === 'trial')
      && (!sub.current_period_end || new Date(sub.current_period_end).getTime() > Date.now());
    const plan: PlanType = active && (sub!.plan === 'pro' || sub!.plan === 'team')
      ? (sub!.plan as PlanType)
      : 'free';
    store.setPlan(plan);

    // 현재 달 사용량 (SELECT own 허용). 유료면 한도 null(무제한).
    const { data: q } = await supabase
      .from('user_quotas')
      .select('command_count')
      .eq('user_id', user.id)
      .eq('month', currentMonth())
      .maybeSingle();
    const limit = plan === 'free' ? FREE_COMMAND_LIMIT : null;
    store.setCommandUsage(q?.command_count ?? 0, limit);
  }

  // UX용 사전 검사 — 서버 권위 store 값 기반. (최종 강제는 stt-proxy)
  // 인자(type)는 하위호환용으로 받되 단일 버킷이라 무시.
  async checkQuota(_type?: 'create' | 'modify' | 'query'): Promise<boolean> {
    const { commandUsed, commandLimit } = useSubscriptionStore.getState();
    if (commandLimit === null) return true; // 무제한(유료)
    return commandUsed < commandLimit;
  }

  getStatus(): QuotaStatus {
    const { commandUsed, commandLimit } = useSubscriptionStore.getState();
    return {
      used: commandUsed,
      limit: commandLimit,
      percentage: commandLimit ? Math.min(100, Math.round((commandUsed / commandLimit) * 100)) : 0,
      daysUntilReset: daysUntilMonthEnd(),
    };
  }
}

export const quotaTracker = new QuotaTracker();
