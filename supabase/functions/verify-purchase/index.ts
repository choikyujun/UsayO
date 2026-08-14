// verify-purchase — 스토어 구독 서버 검증 + subscriptions write.
//   흐름: JWT 검증(uid) → subscriptionsv2.get(purchaseToken) → 상태·만료·uid 대조 → 상품ID로 플랜 판정
//         → service_role upsert(plan/status/current_period_end) → acknowledge(미승인 시).
//   클라이언트가 "나 pro야"라고 주장하는 경로(스푸핑 가능)를 서버 검증으로 대체하는 핵심.
//   검증·조회·판정·upsert 로직은 _shared/google-play.ts 공용(play-rtdn과 재사용).
//
//   Ksori 이식본. UsayO 차이: free/premium 이진 → productId로 pro/team 판정.
//   배포: supabase functions deploy verify-purchase  (config.toml verify_jwt=true — 게이트웨이가
//         1차 검증하고 함수 내부에서 getUser로 uid를 다시 확정한다. Ksori처럼 --no-verify-jwt 쓰지 말 것.)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import {
  ANDROID_PUBLISHER,
  PACKAGE_NAME,
  deriveState,
  getAccessToken,
  getSubscriptionV2,
  peek,
  planFromProductId,
  upsertSubscription,
  type Derived,
} from '../_shared/google-play.ts'
import {
  APPLE_PROD,
  APPLE_SANDBOX,
  IOS_ACTIVE_STATUS,
  decodeJwsPayload,
  getAppleToken,
} from '../_shared/apple-appstore.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

type Body = { platform?: string; productId?: string; purchaseToken?: string }

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ verified: false, error: 'method_not_allowed' }, 405)

  // 단계 추적 — 최상위 catch가 어느 단계에서 예외났는지 응답·로그에 담는다.
  let stage = 'start'
  try {
    // 1) 사용자 JWT 검증 → uid (익명 포함)
    stage = 'auth'
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    console.log(`[verify] 1 auth: token=${peek(token)}`)
    if (!token) return jsonResponse({ verified: false, stage, error: 'missing_token' }, 401)
    const authClient = createClient(SUPABASE_URL, ANON_KEY)
    const { data: u, error: uErr } = await authClient.auth.getUser(token)
    if (uErr || !u.user) {
      console.error(`[verify] 1 auth 실패: ${uErr?.message ?? 'no user'}`)
      return jsonResponse({ verified: false, stage, error: 'invalid_token' }, 401)
    }
    const uid = u.user.id
    console.log(`[verify] 1 auth ok: uid=${peek(uid)}`)

    // 2) 입력 파싱 — platform·productId·purchaseToken. packageName은 서버 고정이라 안 받음.
    stage = 'body'
    let body: Body
    try {
      body = (await req.json()) as Body
    } catch {
      console.error('[verify] 2 body: JSON 파싱 실패')
      return jsonResponse({ verified: false, stage, error: 'invalid_body' }, 400)
    }
    const purchaseToken = body.purchaseToken?.trim()
    const productId = body.productId?.trim()
    console.log(
      `[verify] 2 body: platform=${body.platform} productId=${productId ?? '(none)'} token=${peek(purchaseToken)}`,
    )

    // ═══════════════ iOS 분기 (App Store Server API) ═══════════════
    //   자기완결 — 여기서 검증·subscriptions upsert까지 하고 return. 아래 Android 경로는 영향 없음.
    //   ⚠️ iOS 미출시 상태. 시크릿(APPLE_*)이 없으면 apple_auth_failed로 떨어진다(정상).
    if (body.platform === 'ios' || body.platform === 'apple') {
      stage = 'ios_body'
      const jws = purchaseToken // 클라가 iOS JWS(transaction)를 purchaseToken으로 보냄. productId는 Apple 응답에서.
      if (!jws) {
        console.error('[verify][ios] purchaseToken(JWS) 누락')
        return jsonResponse({ verified: false, stage, error: 'invalid_body' }, 400)
      }

      // (1) JWS payload 디코드 → transactionId (서명검증은 Apple 조회가 대체)
      stage = 'ios_decode'
      let txId: string
      let jwsEnv = ''
      try {
        const p = decodeJwsPayload(jws)
        txId = String(p.transactionId ?? '')
        jwsEnv = String((p as { environment?: unknown }).environment ?? '')
        if (!txId) throw new Error('transactionId 없음')
        console.log(`[verify][ios] 1 decode ok: txId=${txId} jwsEnv=${jwsEnv || '(none)'}`)
      } catch (e) {
        console.error(`[verify][ios] 1 JWS 디코드 실패: ${String(e)}`)
        return jsonResponse({ verified: false, stage, error: 'invalid_jws' }, 400)
      }

      // (2) Apple JWT(ES256)
      stage = 'ios_apple_jwt'
      let appleToken: string
      try {
        appleToken = await getAppleToken()
      } catch (e) {
        console.error(`[verify][ios] 2 apple jwt 실패: ${String(e)}`)
        return jsonResponse({ verified: false, stage, error: 'apple_auth_failed', message: String(e) }, 502)
      }

      // (3) App Store Server API 조회 — JWS environment로 1차 엔드포인트, 404/401 시 반대 환경 폴백.
      stage = 'ios_appstore_get'
      let apiJson: { data?: { lastTransactions?: { status?: number; signedTransactionInfo?: string }[] }[] } | null = null
      let environment = 'Production'
      const endpoints: [string, string][] =
        jwsEnv === 'Sandbox'
          ? [['Sandbox', APPLE_SANDBOX], ['Production', APPLE_PROD]]
          : [['Production', APPLE_PROD], ['Sandbox', APPLE_SANDBOX]]
      console.log(`[verify][ios] 3 appstore 순서: ${endpoints.map((e) => e[0]).join(' → ')} (jwsEnv=${jwsEnv || '(none)'})`)
      for (const [envName, base] of endpoints) {
        const url = `${base}/inApps/v1/subscriptions/${encodeURIComponent(txId)}`
        const res = await fetch(url, { headers: { Authorization: `Bearer ${appleToken}` } })
        console.log(`[verify][ios] 3 appstore ${envName}: HTTP ${res.status}`)
        if (res.ok) {
          apiJson = await res.json()
          environment = envName
          break
        }
        const errBody = await res.text().catch(() => '')
        console.error(`[verify][ios] 3 appstore ${envName} 실패: ${res.status} body=${errBody.slice(0, 300)}`)
        // 404(그 환경에 트랜잭션 없음)·401(잘못된 환경/토큰)이면 반대 환경 폴백. 그 외는 즉시 502.
        if (res.status === 404 || res.status === 401) continue
        return jsonResponse({ verified: false, stage, error: 'appstore_failed', appleStatus: res.status }, 502)
      }
      if (!apiJson) {
        console.error('[verify][ios] 3 appstore: 양쪽 환경 모두 실패(404/401) — 위조/자격증명 설정 의심')
        return jsonResponse({ verified: false, stage, error: 'transaction_not_found_or_auth' }, 200)
      }

      // (4) lastTransactions[].signedTransactionInfo 디코드 → 우리 상품 중 만료 최신 트랜잭션 선택
      stage = 'ios_extract'
      const cands: {
        status: number
        productId: string
        expiresMs: number
        appAccountToken: string
        originalTransactionId: string
        transactionId: string
      }[] = []
      for (const d of apiJson.data ?? []) {
        for (const lt of d.lastTransactions ?? []) {
          if (!lt.signedTransactionInfo) continue
          try {
            const info = decodeJwsPayload(lt.signedTransactionInfo) as {
              productId?: unknown
              expiresDate?: unknown
              appAccountToken?: unknown
              originalTransactionId?: unknown
              transactionId?: unknown
            }
            const pid = String(info.productId ?? '')
            // 우리 상품(pro/team)만 인정 — 클라가 보낸 productId가 아니라 Apple 응답값으로 판정.
            if (!planFromProductId(pid)) continue
            cands.push({
              status: Number(lt.status ?? 0),
              productId: pid,
              expiresMs: Number(info.expiresDate ?? 0),
              appAccountToken: info.appAccountToken ? String(info.appAccountToken) : '',
              originalTransactionId: info.originalTransactionId ? String(info.originalTransactionId) : '',
              transactionId: info.transactionId ? String(info.transactionId) : txId,
            })
          } catch {
            /* 개별 tx 디코드 실패는 무시 */
          }
        }
      }
      if (cands.length === 0) {
        console.error('[verify][ios] 4 매핑되는 productId 없음')
        return jsonResponse({ verified: false, stage, error: 'unknown_product' }, 200)
      }
      cands.sort((a, b) => b.expiresMs - a.expiresMs)
      const chosen = cands[0]
      console.log(
        `[verify][ios] 4 chosen: productId=${chosen.productId} status=${chosen.status} expiresMs=${chosen.expiresMs} env=${environment} appAcct=${chosen.appAccountToken || '(none)'}`,
      )

      // (5) uid 바인딩 — appAccountToken === uid. 값 없으면(구버전 구매) 경고만 남기고 통과.
      stage = 'ios_bind'
      if (chosen.appAccountToken && chosen.appAccountToken !== uid) {
        console.error(`[verify][ios] 5 account_mismatch: appAccountToken=${peek(chosen.appAccountToken)} uid=${peek(uid)}`)
        return jsonResponse({ verified: false, stage, error: 'account_mismatch' }, 403)
      }
      if (!chosen.appAccountToken) console.warn('[verify][ios] 5 appAccountToken 없음(구버전 구매) → 바인딩 검사 스킵')

      // (6) 활성 판정 — status 1/4 + 만료 미도래
      stage = 'ios_decide'
      const activeIos = IOS_ACTIVE_STATUS.has(chosen.status) && chosen.expiresMs > Date.now()
      const iosExpiry = chosen.expiresMs ? new Date(chosen.expiresMs).toISOString() : undefined
      console.log(`[verify][ios] 6 decide: status=${chosen.status} expiry=${iosExpiry ?? '(none)'} active=${activeIos}`)
      if (!activeIos) {
        return jsonResponse({ verified: false, stage, appleStatus: chosen.status, expiry: iosExpiry ?? null, environment }, 200)
      }

      // (7) DB write — 구독 안정키: Apple은 originalTransactionId(갱신돼도 불변) → purchase_token에 매핑.
      stage = 'upsert'
      const svc = createClient(SUPABASE_URL, SERVICE_KEY)
      const derived: Derived = { state: `IOS_STATUS_${chosen.status}`, expiry: iosExpiry, active: true, autoRenewing: true }
      const { error: wErr } = await upsertSubscription(svc, {
        uid,
        purchaseToken: chosen.originalTransactionId || chosen.transactionId,
        productId: chosen.productId,
        derived,
        platform: 'ios',
      })
      if (wErr) {
        console.error(`[verify][ios] 7 upsert 실패: ${wErr}`)
        return jsonResponse({ verified: false, stage, error: 'db_write_failed', message: wErr }, 500)
      }
      // iOS는 acknowledge 없음(StoreKit이 처리) → 스킵.
      const iosPlan = planFromProductId(chosen.productId)
      console.log(`[verify][ios] done: verified=true uid=${peek(uid)} plan=${iosPlan} period_end=${iosExpiry} env=${environment}`)
      return jsonResponse({ verified: true, plan: iosPlan, periodEnd: iosExpiry, environment }, 200)
    }
    // ═══════════════ /iOS 분기 ═══════════════

    if (body.platform !== 'android' || !purchaseToken || !productId) {
      console.error('[verify] 2 body: 필수 필드 누락/비Android')
      return jsonResponse({ verified: false, stage, error: 'invalid_body' }, 400)
    }

    // 2.5) 상품 ID가 우리 상품인지 먼저 판정 — 모르는 상품이면 구글 조회조차 하지 않는다.
    stage = 'product'
    const plan = planFromProductId(productId)
    if (!plan) {
      console.error(`[verify] 2.5 unknown_product: ${productId}`)
      return jsonResponse({ verified: false, stage, error: 'unknown_product', productId }, 200)
    }
    console.log(`[verify] 2.5 product ok: ${productId} → plan=${plan}`)

    // 3) OAuth2 액세스 토큰 발급(google-play) — 실패 시 어느 단계인지 명확히.
    stage = 'oauth'
    let accessToken: string
    try {
      accessToken = await getAccessToken()
      console.log(`[verify] 3 oauth ok: access_token=${peek(accessToken)}`)
    } catch (e) {
      console.error(`[verify] 3 oauth 실패: ${String(e)}`)
      return jsonResponse({ verified: false, stage, error: 'oauth_failed', message: String(e) }, 502)
    }

    // 4) Google Play 구독 조회(subscriptionsv2)
    stage = 'google_get'
    console.log(`[verify] 4 google_get: pkg=${PACKAGE_NAME} token=${peek(purchaseToken)} (${ANDROID_PUBLISHER})`)
    const got = await getSubscriptionV2(accessToken, PACKAGE_NAME, purchaseToken)
    if (!got.ok || !got.sub) {
      console.error(`[verify] 4 google_get 실패: HTTP ${got.status} body=${(got.body ?? '').slice(0, 300)}`)
      // 404/410 = 토큰 무효·만료 → 미검증(정상 응답). 그 외(401=인증·403=권한·400=요청) = 일시/설정 오류.
      const terminal = got.status === 404 || got.status === 410
      return jsonResponse(
        { verified: false, stage, error: 'google_verify_failed', googleStatus: got.status, message: (got.body ?? '').slice(0, 300) },
        terminal ? 200 : 502,
      )
    }
    const sub = got.sub
    console.log(
      `[verify] 4 google_get ok: state=${sub.subscriptionState} ack=${sub.acknowledgementState} lineItems=${sub.lineItems?.length ?? 0}`,
    )

    // 5) uid 대조 + 상태·만료 판정
    stage = 'decide'
    const planted = sub.externalAccountIdentifiers?.obfuscatedExternalAccountId
    console.log(`[verify] 5 decide: planted=${planted ? peek(planted) : '(none)'} uid=${peek(uid)} match=${!planted || planted === uid}`)
    if (planted && planted !== uid) {
      console.error('[verify] 5 decide: account_mismatch(도용 의심)')
      return jsonResponse({ verified: false, stage, error: 'account_mismatch' }, 403)
    }
    const derived = deriveState(sub, productId)
    console.log(`[verify] 5 decide: state=${derived.state} expiry=${derived.expiry ?? '(none)'} active=${derived.active} autoRenew=${derived.autoRenewing}`)
    if (!derived.active) {
      // 신규 구매인데 활성 아님 → 플랜 부여 안 함(기존 행 강등도 안 함 — RTDN 담당).
      return jsonResponse({ verified: false, stage, state: derived.state, expiry: derived.expiry ?? null }, 200)
    }

    // 6) service_role로 subscriptions upsert(plan/status/current_period_end).
    stage = 'upsert'
    const svc = createClient(SUPABASE_URL, SERVICE_KEY)
    const { error: wErr } = await upsertSubscription(svc, { uid, purchaseToken, productId, sub, derived })
    if (wErr) {
      console.error(`[verify] 6 upsert 실패: ${wErr}`)
      return jsonResponse({ verified: false, stage, error: 'db_write_failed', message: wErr }, 500)
    }
    console.log(`[verify] 6 upsert ok: uid=${peek(uid)} plan=${plan} period_end=${derived.expiry}`)

    // 7) acknowledge — 미승인이면 서버에서 승인(3일 내 미승인=자동환불 방지). 서버가 권위 있는 승인자.
    //   실패해도 검증·write는 이미 성공 → 치명 아님(다음 검증/RTDN에서 재시도).
    stage = 'acknowledge'
    if (sub.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING') {
      try {
        const ackUrl = `${ANDROID_PUBLISHER}/applications/${PACKAGE_NAME}/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`
        const ackRes = await fetch(ackUrl, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: '{}',
        })
        console.log(`[verify] 7 acknowledge: HTTP ${ackRes.status}`)
      } catch (e) {
        console.error(`[verify] 7 acknowledge 실패(무시): ${String(e)}`)
      }
    } else {
      console.log(`[verify] 7 acknowledge: skip(state=${sub.acknowledgementState ?? 'n/a'})`)
    }

    console.log(`[verify] done: verified=true uid=${peek(uid)} plan=${plan}`)
    return jsonResponse({ verified: true, plan, periodEnd: derived.expiry, cancelAtPeriodEnd: !derived.autoRenewing }, 200)
  } catch (e) {
    // 최상위 캐치 — 예상 못 한 예외가 어느 단계에서 났는지 stage로 특정.
    console.error(`[verify] uncaught @${stage}: ${String(e)}`)
    return jsonResponse({ verified: false, stage, error: 'unexpected', message: String(e) }, 500)
  }
})
