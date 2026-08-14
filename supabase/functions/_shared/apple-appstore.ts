// Apple App Store Server API 검증 공용 모듈 — verify-purchase(iOS 구매 검증) 재사용.
//   google-play.ts(Google 경로)와 대칭 구조. Ksori의 같은 모듈을 이식 + 상수 교체.
//   getAppleToken:    .p8(ES256) → App Store Server API용 JWT(모듈 캐시).
//   decodeJwsPayload: JWS payload만 base64url 디코드(서명검증은 Apple 조회가 대체).
//
// ⚠️ 현재 iOS는 미출시다. 이 파일은 **미리 두는 것**이며 지금 경로가 돌지 않는다.
//    APPLE_* 시크릿이 없으면 getAppleToken이 throw하고, verify-purchase의 iOS 분기는
//    platform:'ios'로 호출될 때만 진입한다(안드로이드 경로에 영향 없음).
//    ASSN V2(Apple 서버 알림) 수신은 범위 밖 — 여기 없다.
import { importPKCS8, SignJWT } from 'https://esm.sh/jose@5.9.6'

const KEY_ID = Deno.env.get('APPLE_KEY_ID') ?? ''
const ISSUER_ID = Deno.env.get('APPLE_ISSUER_ID') ?? ''
// 번들 ID — UsayO는 com.usayo.app. env로 덮어쓸 수 있게 유지.
const BUNDLE_ID = Deno.env.get('APPLE_BUNDLE_ID') ?? 'com.usayo.app'

// App Store Server API 엔드포인트 + 활성 status(1=활성, 4=유예). 공용 상수.
export const APPLE_PROD = 'https://api.storekit.itunes.apple.com'
export const APPLE_SANDBOX = 'https://api.storekit-sandbox.itunes.apple.com'
export const IOS_ACTIVE_STATUS = new Set([1, 4])

let cachedToken: string | null = null
let cachedExpMs = 0

export function appleBundleId(): string {
  return BUNDLE_ID
}

// JWS(header.payload.signature)의 payload만 base64url 디코드. 서명검증은 하지 않음 —
//   App Store Server API 조회가 진짜 검증(위조 토큰은 Apple에 트랜잭션이 없어 걸러짐).
export function decodeJwsPayload(jws: string): Record<string, unknown> {
  const parts = jws.split('.')
  if (parts.length !== 3) throw new Error('invalid jws format')
  const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
  const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : ''
  const bytes = Uint8Array.from(atob(b64 + pad), (c) => c.charCodeAt(0))
  return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>
}

// Apple App Store Server API용 JWT(ES256). 헤더 { alg, kid, typ }, payload { iss, iat, exp(<=20분),
//   aud:'appstoreconnect-v1', bid:BUNDLE_ID }. 토큰은 모듈 스코프 캐시(만료 60초 전까지 재사용).
export async function getAppleToken(): Promise<string> {
  const now = Date.now()
  if (cachedToken && now < cachedExpMs - 60_000) {
    console.log('[verify][ios] apple jwt: 캐시 토큰 재사용')
    return cachedToken
  }
  // secret 저장 시 개행이 \n으로 escape될 수 있어 실제 개행으로 복원(PEM 파싱 필수).
  const p8 = (Deno.env.get('APPLE_INAPP_PRIVATE_KEY') ?? '').replace(/\\n/g, '\n')
  console.log(
    `[verify][ios] apple secret: keyId=${KEY_ID ? 'present' : 'MISSING'} issuer=${ISSUER_ID ? 'present' : 'MISSING'} bundle=${BUNDLE_ID || 'MISSING'} p8=${p8 ? 'present' : 'MISSING'}`,
  )
  if (!p8 || !KEY_ID || !ISSUER_ID || !BUNDLE_ID) {
    throw new Error('missing APPLE_* secrets (APPLE_KEY_ID/APPLE_ISSUER_ID/APPLE_BUNDLE_ID/APPLE_INAPP_PRIVATE_KEY)')
  }
  const key = await importPKCS8(p8, 'ES256')
  const iat = Math.floor(now / 1000)
  const exp = iat + 20 * 60 // 20분(Apple 최대 허용)
  const token = await new SignJWT({ bid: BUNDLE_ID })
    .setProtectedHeader({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' })
    .setIssuer(ISSUER_ID)
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .setAudience('appstoreconnect-v1')
    .sign(key)
  cachedToken = token
  cachedExpMs = exp * 1000
  console.log('[verify][ios] apple jwt 발급 완료')
  return token
}
