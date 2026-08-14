// Google Play 구독 검증 공용 모듈 — verify-purchase(신규 구매 검증)·play-rtdn(실시간 알림) 재사용.
//   getAccessToken:     서비스계정 → OAuth2 액세스 토큰(jose RS256, 모듈 캐시).
//   getSubscriptionV2:  purchases.subscriptionsv2.get(purchaseToken) 권위 조회.
//   deriveState:        상태·만료 판정.
//   planFromProductId:  상품 ID → UsayO 플랜(pro/team).
//   upsertSubscription: 판정 결과 → subscriptions upsert(stt-proxy가 읽는 컬럼을 채운다).
//
// Ksori(app.ksori)의 같은 모듈을 이식했다. UsayO와의 차이는 두 곳뿐이고, 둘 다 의도된 것이다:
//   1) Ksori는 free/premium 이진이지만 UsayO는 productId로 pro/team을 판정한다.
//   2) Ksori는 tier/period_end 컬럼에 쓰지만 UsayO는 plan/status/current_period_end에 쓴다
//      (stt-proxy가 그 세 컬럼으로 유료를 판정한다 — 컬럼명을 바꾸면 유료 사용자가 무료로 떨어진다).
import { importPKCS8, SignJWT } from 'https://esm.sh/jose@5.9.6'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher'

export const ANDROID_PUBLISHER = 'https://androidpublisher.googleapis.com/androidpublisher/v3'
// 패키지명은 서버 고정(클라 신뢰 안 함). env 미설정 시 com.usayo.app.
export const PACKAGE_NAME = Deno.env.get('ANDROID_PACKAGE_NAME') ?? 'com.usayo.app'

// ⚠️ 상품 ID는 패키지명(com.usayo.app)과 달리 **com.yusay 접두사를 유지**한다.
//    플레이 콘솔에 이미 등록된 상품 ID는 변경이 불가능해 그대로 쓰기로 한 결정이다(오타 아님).
//    클라이언트 constants/pricing.ts PRODUCT_IDS와 반드시 일치해야 한다 — 어긋나면
//    "결제는 됐는데 플랜이 안 올라가는" 증상이 난다.
export const PRO_PRODUCT_IDS = new Set(['com.yusay.pro.monthly', 'com.yusay.pro.annual'])
export const TEAM_PRODUCT_IDS = new Set(['com.yusay.team.monthly'])

export type PlanTier = 'pro' | 'team'

// 상품 ID → 플랜. 모르는 상품이면 null(권한을 주지 않는다 — 임의 상품으로 유료 승격 방지).
export function planFromProductId(productId: string): PlanTier | null {
  if (PRO_PRODUCT_IDS.has(productId)) return 'pro'
  if (TEAM_PRODUCT_IDS.has(productId)) return 'team'
  return null
}

// 유료 자격이 유지되는 상태.
//   ACTIVE          — 정상 결제 중
//   IN_GRACE_PERIOD — 결제 실패 유예(아직 유료)
//   CANCELED        — **해지 예약**. 구글에서 CANCELED는 "자동갱신만 꺼졌고 만료일까지는 유효"라는
//                     뜻이다. 이걸 무효로 보면 이미 값을 지불한 기간을 빼앗는다.
//                     → 만료 전까지 유료 유지 + cancel_at_period_end=true로 표시한다.
//                     (Ksori는 ACTIVE/IN_GRACE만 유효로 봤다. UsayO는 cancel_at_period_end 컬럼이
//                      있어 해지 예약을 정확히 표현할 수 있으므로 여기서 갈라진다.)
// ON_HOLD·PAUSED·EXPIRED는 무효.
export const VALID_STATES = new Set([
  'SUBSCRIPTION_STATE_ACTIVE',
  'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
  'SUBSCRIPTION_STATE_CANCELED',
])

// subscriptionsv2.get 응답(필요 필드만).
export type SubV2 = {
  subscriptionState?: string
  latestOrderId?: string
  startTime?: string
  lineItems?: { expiryTime?: string; productId?: string; autoRenewingPlan?: { autoRenewEnabled?: boolean } }[]
  externalAccountIdentifiers?: { obfuscatedExternalAccountId?: string }
  acknowledgementState?: string
}

// 민감정보 축약 — 토큰은 앞 8자 + 길이만 로깅(전체 금지).
export function peek(s?: string | null): string {
  if (!s) return '(none)'
  return `${s.slice(0, 8)}…(len=${s.length})`
}

// ============================================================================
// OAuth2 액세스 토큰 — 서비스계정 JWT(RS256) → token 엔드포인트. 모듈 스코프 캐시(만료 60초 전 재사용).
// ============================================================================
type ServiceAccount = { client_email: string; private_key: string }
let cachedToken: string | null = null
let cachedExpMs = 0

function loadServiceAccount(): ServiceAccount {
  const raw = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON') ?? ''
  if (!raw) throw new Error('missing GOOGLE_SERVICE_ACCOUNT_JSON')
  let j: { client_email?: string; private_key?: string }
  try {
    j = JSON.parse(raw) as { client_email?: string; private_key?: string }
  } catch (e) {
    throw new Error(`service account JSON 파싱 실패: ${String(e)}`)
  }
  // 민감정보 제외 — client_email과 private_key 존재 여부만 로깅.
  console.log(`[gplay] sa load: client_email=${j.client_email ?? '(none)'} private_key=${j.private_key ? 'present' : 'MISSING'}`)
  if (!j.client_email || !j.private_key) throw new Error('bad service account json(client_email/private_key 누락)')
  // secret 저장 시 개행이 \n으로 escape될 수 있어 실제 개행으로 복원(PEM 파싱 필수).
  return { client_email: j.client_email, private_key: j.private_key.replace(/\\n/g, '\n') }
}

export async function getAccessToken(): Promise<string> {
  const now = Date.now()
  if (cachedToken && now < cachedExpMs - 60_000) {
    console.log('[gplay] oauth: 캐시 토큰 재사용')
    return cachedToken
  }
  const sa = loadServiceAccount()
  const key = await importPKCS8(sa.private_key, 'RS256')
  const iat = Math.floor(now / 1000)
  const assertion = await new SignJWT({ scope: SCOPE })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(sa.client_email)
    .setSubject(sa.client_email)
    .setAudience(TOKEN_URL)
    .setIssuedAt(iat)
    .setExpirationTime(iat + 3600)
    .sign(key)

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    console.error(`[gplay] oauth token 실패: HTTP ${res.status} body=${body.slice(0, 300)}`)
    throw new Error(`oauth token ${res.status}: ${body.slice(0, 300)}`)
  }
  const data = (await res.json()) as { access_token: string; expires_in: number }
  cachedToken = data.access_token
  cachedExpMs = now + data.expires_in * 1000
  console.log(`[gplay] oauth token ok: expires_in=${data.expires_in}s`)
  return cachedToken
}

// ============================================================================
// 구독 조회 — subscriptionsv2.get. ok=false면 status·body로 원인 판정(404/410=무효·만료).
// ============================================================================
export async function getSubscriptionV2(
  accessToken: string,
  packageName: string,
  purchaseToken: string,
): Promise<{ ok: boolean; status: number; sub?: SubV2; body?: string }> {
  const url = `${ANDROID_PUBLISHER}/applications/${packageName}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    return { ok: false, status: res.status, body }
  }
  return { ok: true, status: res.status, sub: (await res.json()) as SubV2 }
}

// ============================================================================
// 상태·만료 판정 — productId 라인의 expiryTime. active = 유효상태 && 만료 미래.
// ============================================================================
export type Derived = {
  state: string
  expiry?: string
  start?: string
  active: boolean
  autoRenewing: boolean
}

export function deriveState(sub: SubV2, productId: string): Derived {
  const state = sub.subscriptionState ?? ''
  const line = sub.lineItems?.find((l) => l.productId === productId) ?? sub.lineItems?.[0]
  const expiry = line?.expiryTime // RFC3339
  const active = VALID_STATES.has(state) && !!expiry && new Date(expiry).getTime() > Date.now()
  const autoRenewing = !!line?.autoRenewingPlan?.autoRenewEnabled
  return { state, expiry, start: sub.startTime, active, autoRenewing }
}

// ============================================================================
// subscriptions upsert — stt-proxy가 읽는 3컬럼(plan/status/current_period_end)을 채운다.
//   active=true  → plan=pro|team, status='active', current_period_end=만료일
//   active=false → plan='free',   status='expired', current_period_end=now()(즉시 강등)
//   해지 예약(자동갱신 off)은 cancel_at_period_end=true로 표시하되 만료 전까지는 유료 유지.
//
//   revenuecat_* 컬럼은 건드리지 않는다(upsert가 넘긴 컬럼만 갱신). RevenueCat 병행 기간 동안
//   기존 값이 살아 있어야 하고, 지우면 롤백 경로가 사라진다.
// ============================================================================
export async function upsertSubscription(
  svc: SupabaseClient,
  args: {
    uid: string
    purchaseToken: string
    productId: string
    sub?: SubV2
    derived: Derived
    // 플랫폼 중립 확장 — 미지정 시 Google(android) 기본값이라 기존 호출은 그대로 동작.
    //   Apple 경로가 platform:'apple' + Apple 트랜잭션 값을 넘긴다.
    platform?: string
  },
): Promise<{ error?: string }> {
  const { uid, purchaseToken, productId, derived } = args
  const nowIso = new Date().toISOString()

  // 활성인데 모르는 상품 = 우리 상품이 아님 → 승격하지 않는다(호출부에서 이미 걸러야 정상).
  const plan = derived.active ? planFromProductId(productId) : 'free'
  if (plan === null) {
    return { error: `unknown_product:${productId}` }
  }

  const row: Record<string, unknown> = {
    user_id: uid,
    plan,
    status: derived.active ? 'active' : 'expired',
    current_period_end: derived.active ? derived.expiry : nowIso, // 무효면 now()로 즉시 만료
    cancel_at_period_end: derived.active ? !derived.autoRenewing : false,
    purchase_token: purchaseToken,
    product_id: productId,
    platform: args.platform ?? 'android',
  }
  if (derived.start) row.current_period_start = derived.start

  const { error } = await svc.from('subscriptions').upsert(row, { onConflict: 'user_id' })
  return { error: error?.message }
}
