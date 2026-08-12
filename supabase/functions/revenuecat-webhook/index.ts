import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

// RevenueCat Entitlement 식별자.
// ⚠️ 반드시 클라이언트 constants/pricing.ts 의 ENTITLEMENTS 및 RevenueCat 대시보드
//    Entitlement identifier와 정확히 일치해야 한다. (Edge Function은 별도 배포라 코드 공유 불가 —
//    세 곳: pricing.ts / 이 파일 / RC 대시보드가 동일 문자열이어야 서버가 유료를 인식한다.)
const ENTITLEMENT_PRO = 'pro_access';
const ENTITLEMENT_TEAM = 'team_access';

// 상수 시간 비교(타이밍 공격 방지). 웹훅 시크릿처럼 짧은 문자열도 === 비교는
// 조기 종료로 미세한 타이밍 차이를 노출할 수 있어 바이트 XOR 누적으로 비교한다.
function timingSafeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a == null || b == null) return false;
  const enc = new TextEncoder();
  const ba = enc.encode(a);
  const bb = enc.encode(b);
  if (ba.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ba.length; i++) diff |= ba[i] ^ bb[i];
  return diff === 0;
}

// RevenueCat 이벤트 타입
type RevenueCatEvent = {
  event: {
    type: string;   // 'INITIAL_PURCHASE' | 'RENEWAL' | 'CANCELLATION' | 'EXPIRATION' etc.
    app_user_id: string;
    entitlement_id: string;
    period_type: string;
    expiration_at_ms: number;
  };
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // RevenueCat 웹훅 시크릿 검증 (게이트웨이 verify_jwt=false — 이 헤더가 유일한 인증).
  // 상수 시간 비교로 타이밍 공격 방지.
  const secret = req.headers.get('X-RevenueCat-Secret');
  if (!timingSafeEqual(secret, Deno.env.get('REVENUECAT_WEBHOOK_SECRET'))) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body: RevenueCatEvent = await req.json();
  const { type, app_user_id, entitlement_id, expiration_at_ms } = body.event;

  let plan: 'free' | 'pro' | 'team' = 'free';
  let status: 'active' | 'canceled' | 'expired' | 'trial' = 'active';

  if (entitlement_id === ENTITLEMENT_PRO) plan = 'pro';
  else if (entitlement_id === ENTITLEMENT_TEAM) plan = 'team';

  if (type === 'CANCELLATION') status = 'canceled';
  else if (type === 'EXPIRATION') { status = 'expired'; plan = 'free'; }
  else if (type === 'TRIAL_STARTED') status = 'trial';

  const expiresAt = expiration_at_ms
    ? new Date(expiration_at_ms).toISOString()
    : null;

  // profiles.plan 업데이트
  await supabase
    .from('profiles')
    .update({ plan, plan_expires_at: expiresAt })
    .eq('id', app_user_id);

  // subscriptions 테이블 upsert
  await supabase.from('subscriptions').upsert({
    user_id: app_user_id,
    plan,
    status,
    revenuecat_customer_id: app_user_id,
    revenuecat_entitlement: entitlement_id,
    current_period_end: expiresAt,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
