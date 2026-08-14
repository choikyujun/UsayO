// play-rtdn — Google Play 실시간 개발자 알림(RTDN) 수신 → 구독 상태 실시간 반영.
//   흐름: Pub/Sub push 수신 → OIDC 검증 → 봉투 디코드 → notificationType 무관하게
//         purchaseToken으로 subscriptionsv2.get 재조회(권위 소스) → subscriptions 갱신.
//   핵심 원칙: 웹훅 페이로드를 신뢰하지 않고 항상 구글 API 재조회로 현재 상태 확정(스푸핑 무력화).
//   응답: 정상·no-op → 2xx(ack) / 일시 오류 → 5xx(Pub/Sub 재시도). 빠른 ack.
//
//   Ksori 이식본. UsayO 차이: tier/period_end → plan/status/current_period_end 컬럼.
//   배포: supabase functions deploy play-rtdn --no-verify-jwt
//         (config.toml verify_jwt=false — Pub/Sub은 Supabase JWT를 못 보낸다. 대신 함수 내부에서
//          구글 OIDC 토큰을 직접 검증한다.)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { createRemoteJWKSet, jwtVerify } from 'https://esm.sh/jose@5.9.6'

import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import {
  PACKAGE_NAME,
  deriveState,
  getAccessToken,
  getSubscriptionV2,
  peek,
  planFromProductId,
  upsertSubscription,
} from '../_shared/google-play.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
// OIDC 검증 파라미터 — Pub/Sub push 구독에 설정한 audience·서비스계정 email.
const RTDN_PUSH_AUDIENCE = Deno.env.get('RTDN_PUSH_AUDIENCE') ?? ''
const RTDN_PUSH_SA_EMAIL = Deno.env.get('RTDN_PUSH_SA_EMAIL') ?? ''
// 구글 OIDC 공개키 — 모듈 스코프(내부 캐시).
const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'))

// notificationType → 라벨(로그용). 처리는 재조회 상태로 통일하므로 분기엔 안 씀.
const SUB_TYPE: Record<number, string> = {
  1: 'RECOVERED', 2: 'RENEWED', 3: 'CANCELED', 4: 'PURCHASED', 5: 'ON_HOLD', 6: 'IN_GRACE',
  7: 'RESTARTED', 8: 'PRICE_CHANGE', 9: 'DEFERRED', 10: 'PAUSED', 11: 'PAUSE_SCHEDULE', 12: 'REVOKED', 13: 'EXPIRED',
}

// Pub/Sub push 봉투 / RTDN 페이로드(필요 필드만).
type PubSubEnvelope = { message?: { data?: string; messageId?: string; publishTime?: string } }
type DeveloperNotification = {
  packageName?: string
  eventTimeMillis?: string
  subscriptionNotification?: { notificationType?: number; purchaseToken?: string; subscriptionId?: string }
  voidedPurchaseNotification?: { purchaseToken?: string; orderId?: string; productType?: number }
  testNotification?: { version?: string }
}

// 환불·취소·만료 등 무효 → purchase_token으로 기존 행 즉시 강등(uid 몰라도). 없는 행이면 no-op.
//   plan='free' + status='expired' + current_period_end=now() → stt-proxy가 즉시 무료로 판정.
async function downgradeByToken(svc: ReturnType<typeof createClient>, purchaseToken: string): Promise<void> {
  const nowIso = new Date().toISOString()
  const { error } = await svc
    .from('subscriptions')
    .update({ plan: 'free', status: 'expired', current_period_end: nowIso, cancel_at_period_end: false })
    .eq('purchase_token', purchaseToken)
  if (error) console.error(`[rtdn] downgradeByToken 실패: ${error.message}`)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)

  try {
    // 1) OIDC 검증 — push가 진짜 구글에서 왔는지(서명·iss·aud·email).
    const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    if (!bearer) {
      console.error('[rtdn] 1 oidc: missing bearer')
      return jsonResponse({ error: 'missing_oidc' }, 401)
    }
    try {
      const { payload } = await jwtVerify(bearer, GOOGLE_JWKS, {
        issuer: ['https://accounts.google.com', 'accounts.google.com'],
        audience: RTDN_PUSH_AUDIENCE || undefined, // 설정됐을 때만 aud 강제(미설정 시 경고).
      })
      if (!RTDN_PUSH_AUDIENCE) console.warn('[rtdn] RTDN_PUSH_AUDIENCE 미설정 — aud 검증 생략(설정 권장)')
      const email = (payload as { email?: string; email_verified?: boolean }).email
      const emailVerified = (payload as { email_verified?: boolean }).email_verified
      if (RTDN_PUSH_SA_EMAIL && (email !== RTDN_PUSH_SA_EMAIL || emailVerified !== true)) {
        console.error(`[rtdn] 1 oidc: email 불일치 email=${email ?? '(none)'} verified=${emailVerified}`)
        return jsonResponse({ error: 'oidc_email_mismatch' }, 401)
      }
      console.log(`[rtdn] 1 oidc ok: email=${email ?? '(none)'}`)
    } catch (e) {
      console.error(`[rtdn] 1 oidc 검증 실패: ${String(e)}`)
      return jsonResponse({ error: 'oidc_invalid' }, 401)
    }

    // 2) Pub/Sub 봉투 → base64 디코드 → DeveloperNotification
    let envelope: PubSubEnvelope
    try {
      envelope = (await req.json()) as PubSubEnvelope
    } catch {
      console.error('[rtdn] 2 envelope: JSON 파싱 실패')
      return jsonResponse({ error: 'bad_envelope' }, 400)
    }
    const dataB64 = envelope.message?.data
    if (!dataB64) {
      console.log('[rtdn] 2 envelope: data 없음 → ack')
      return jsonResponse({ ok: true, skip: 'no_data' }, 200)
    }
    let notif: DeveloperNotification
    try {
      notif = JSON.parse(atob(dataB64)) as DeveloperNotification
    } catch {
      console.error('[rtdn] 2 envelope: data 디코드 실패 → ack(재시도 방지)')
      return jsonResponse({ ok: true, skip: 'bad_data' }, 200)
    }

    // 테스트 알림 → 배선 확인용, ack만.
    if (notif.testNotification) {
      console.log('[rtdn] test notification → ack')
      return jsonResponse({ ok: true, test: true }, 200)
    }

    const svc = createClient(SUPABASE_URL, SERVICE_KEY)

    // 환불·차지백 → 즉시 강등(재조회 없이 token 매칭).
    if (notif.voidedPurchaseNotification?.purchaseToken) {
      const vt = notif.voidedPurchaseNotification.purchaseToken
      console.log(`[rtdn] voided → downgrade token=${peek(vt)}`)
      await downgradeByToken(svc, vt)
      return jsonResponse({ ok: true, handled: 'voided' }, 200)
    }

    // 구독 알림
    const sn = notif.subscriptionNotification
    if (!sn?.purchaseToken || !sn?.subscriptionId) {
      console.log('[rtdn] subscriptionNotification 아님 → ack')
      return jsonResponse({ ok: true, skip: 'not_subscription' }, 200)
    }
    const { purchaseToken, subscriptionId } = sn
    const typeLabel = SUB_TYPE[sn.notificationType ?? -1] ?? String(sn.notificationType)
    console.log(`[rtdn] sub notif: type=${typeLabel} product=${subscriptionId} token=${peek(purchaseToken)}`)

    // 3) 권위 재조회 — notificationType 신뢰 안 함.
    let accessToken: string
    try {
      accessToken = await getAccessToken()
    } catch (e) {
      console.error(`[rtdn] 3 oauth 실패(재시도 유도): ${String(e)}`)
      return jsonResponse({ error: 'oauth_failed', message: String(e) }, 502)
    }
    const got = await getSubscriptionV2(accessToken, PACKAGE_NAME, purchaseToken)
    if (!got.ok || !got.sub) {
      // 404/410 = 만료·무효 → 강등(정상 ack). 그 외 = 일시 오류 → 5xx 재시도.
      if (got.status === 404 || got.status === 410) {
        console.log(`[rtdn] 3 재조회 ${got.status} → downgrade`)
        await downgradeByToken(svc, purchaseToken)
        return jsonResponse({ ok: true, handled: 'gone' }, 200)
      }
      console.error(`[rtdn] 3 재조회 실패: HTTP ${got.status} body=${(got.body ?? '').slice(0, 300)}`)
      return jsonResponse({ error: 'requery_failed', googleStatus: got.status }, 502)
    }
    const sub = got.sub
    const derived = deriveState(sub, subscriptionId)
    console.log(`[rtdn] 4 decide: state=${derived.state} expiry=${derived.expiry ?? '(none)'} active=${derived.active} autoRenew=${derived.autoRenewing}`)

    // 4) 갱신 — 1차 uid(재조회 obfuscated id)로 upsert / 2차 폴백 purchase_token 조회.
    const uid = sub.externalAccountIdentifiers?.obfuscatedExternalAccountId
    if (uid) {
      const { error } = await upsertSubscription(svc, { uid, purchaseToken, productId: subscriptionId, sub, derived })
      if (error) {
        console.error(`[rtdn] 5 upsert 실패(재시도 유도): ${error}`)
        return jsonResponse({ error: 'db_write_failed', message: error }, 500)
      }
      console.log(`[rtdn] 5 upsert ok: uid=${peek(uid)} active=${derived.active} period_end=${derived.active ? derived.expiry : 'now'}`)
    } else {
      // uid 미확인(재조회에 obfuscated id 없음) → purchase_token으로 기존 행만 갱신(신규행 생성 안 함).
      //   행 없으면 update 0행 no-op — uid 없이는 어느 사용자인지 몰라 새로 못 만든다(정상).
      if (derived.active) {
        // 플랜은 상품 ID로 판정. 모르는 상품이면 건드리지 않는다(임의 승격 방지).
        const plan = planFromProductId(subscriptionId)
        if (!plan) {
          console.error(`[rtdn] 5 token-fallback: unknown_product=${subscriptionId} → 갱신 안 함`)
          return jsonResponse({ ok: true, skip: 'unknown_product' }, 200)
        }
        const { error } = await svc
          .from('subscriptions')
          .update({
            plan,
            status: 'active',
            current_period_end: derived.expiry,
            cancel_at_period_end: !derived.autoRenewing,
          })
          .eq('purchase_token', purchaseToken)
        if (error) console.error(`[rtdn] 5 token-fallback update 오류: ${error.message}`)
      } else {
        await downgradeByToken(svc, purchaseToken)
      }
      console.log(`[rtdn] 5 token-fallback: active=${derived.active} token=${peek(purchaseToken)}`)
    }

    return jsonResponse({ ok: true, type: typeLabel, active: derived.active }, 200)
  } catch (e) {
    console.error(`[rtdn] uncaught: ${String(e)}`)
    return jsonResponse({ error: 'unexpected', message: String(e) }, 500)
  }
})
