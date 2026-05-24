import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

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

  // RevenueCat 웹훅 시크릿 검증
  const secret = req.headers.get('X-RevenueCat-Secret');
  if (secret !== Deno.env.get('REVENUECAT_WEBHOOK_SECRET')) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body: RevenueCatEvent = await req.json();
  const { type, app_user_id, entitlement_id, expiration_at_ms } = body.event;

  let plan: 'free' | 'pro' | 'team' = 'free';
  let status: 'active' | 'canceled' | 'expired' | 'trial' = 'active';

  if (entitlement_id === 'pro') plan = 'pro';
  else if (entitlement_id === 'team') plan = 'team';

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
