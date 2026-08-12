import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// sync-subscription — 구매 직후/쿼터초과 self-heal 시 클라이언트가 호출하는 즉시 반영 경로.
// 클라이언트 주장(플랜)을 신뢰하지 않고, 서버가 RevenueCat REST API로 직접 검증한 뒤
// service role로 subscriptions/profiles에 기록한다(스푸핑 안전). 갱신·해지·만료 등
// 앱 미실행 중 이벤트는 여전히 revenuecat-webhook이 처리한다(이 함수는 즉시 반영 보강).

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

// RevenueCat Entitlement 식별자.
// ⚠️ 세 곳(클라 constants/pricing.ts ENTITLEMENTS / revenuecat-webhook / 이 파일)이
//    RevenueCat 대시보드 identifier와 정확히 일치해야 서버가 유료를 인식한다.
const ENTITLEMENT_PRO = 'pro_access';
const ENTITLEMENT_TEAM = 'team_access';

const RC_API = 'https://api.revenuecat.com/v1/subscribers';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type RCEntitlement = { expires_date: string | null; product_identifier?: string };

function isActive(ent?: RCEntitlement): boolean {
  if (!ent) return false;
  if (!ent.expires_date) return true; // 만료 없음(라이프타임)
  return new Date(ent.expires_date).getTime() > Date.now();
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    // 1. 호출자 인증 (verify_jwt=true + getUser로 본인 확정)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'missing Authorization' }, 401);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return json({ error: 'unauthorized' }, 401);
    const userId = user.id; // RevenueCat appUserID = Supabase user_id (configure에서 설정)

    // 2. RevenueCat REST API로 서버 측 검증
    const rcKey = Deno.env.get('REVENUECAT_REST_API_KEY');
    if (!rcKey) return json({ error: 'server misconfigured: REVENUECAT_REST_API_KEY' }, 500);

    const rcResp = await fetch(`${RC_API}/${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${rcKey}` },
    });
    if (!rcResp.ok) {
      console.error('[sync-subscription] RC fetch failed:', rcResp.status);
      return json({ error: 'revenuecat_fetch_failed', status: rcResp.status }, 502);
    }
    const rc = await rcResp.json() as {
      subscriber?: {
        entitlements?: Record<string, RCEntitlement>;
        subscriptions?: Record<string, { period_type?: string }>;
      };
    };
    const ents = rc.subscriber?.entitlements ?? {};
    const team = ents[ENTITLEMENT_TEAM];
    const pro = ents[ENTITLEMENT_PRO];

    // 3. 플랜 판정 (team 우선)
    let plan: 'free' | 'pro' | 'team' = 'free';
    let entitlementId: string | null = null;
    let expiresAt: string | null = null;

    if (isActive(team)) { plan = 'team'; entitlementId = ENTITLEMENT_TEAM; expiresAt = team.expires_date; }
    else if (isActive(pro)) { plan = 'pro'; entitlementId = ENTITLEMENT_PRO; expiresAt = pro.expires_date; }

    // 활성 유료가 없으면 DB를 건드리지 않는다(웹훅의 만료 처리와 경합 방지).
    if (plan === 'free') return json({ plan: 'free' });

    // 트라이얼 판정: 해당 상품 subscription의 period_type
    let status: 'active' | 'trial' = 'active';
    const activeEnt = plan === 'team' ? team : pro;
    const prodId = activeEnt.product_identifier;
    const sub = prodId ? rc.subscriber?.subscriptions?.[prodId] : undefined;
    if (sub?.period_type === 'trial' || sub?.period_type === 'intro') status = 'trial';

    // 4. service role로 반영 (subscriptions UNIQUE(user_id) 필요 — 마이그레이션 선행)
    await supabase.from('subscriptions').upsert({
      user_id: userId,
      plan,
      status,
      revenuecat_customer_id: userId,
      revenuecat_entitlement: entitlementId,
      current_period_end: expiresAt,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

    await supabase.from('profiles').update({ plan, plan_expires_at: expiresAt }).eq('id', userId);

    console.log('[sync-subscription] synced:', userId, plan, status);
    return json({ plan, status });

  } catch (err) {
    console.error('[sync-subscription]', err);
    return json({ error: (err as Error).message }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
