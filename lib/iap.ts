// IAP 결제 — react-native-iap v15(Nitro). RevenueCat을 걷어내고 스토어 직접 연동 + 서버 검증.
//
//   구매 성공 시 클라는 verify-purchase Edge를 호출하고, Edge가 구글 Play API로 검증한 뒤
//   service_role로 subscriptions를 write한다(클라 직접 write 없음 → "나 pro야" 스푸핑 차단).
//   클라는 검증 결과만 받고 서버에서 플랜을 다시 읽는다(quotaTracker.refreshFromServer).
//
//   네이티브 모듈 → 재빌드 필요(Expo Go 불가). SDK 54.
//   Ksori(lib/iap.ts) 이식본. UsayO 차이:
//     · 단일 premium → Pro 월/연 2종(Team은 인앱 구매 없음 — 문의 안내만, 아래 주석 참조).
//     · 검증 성공 후 freshenSession 대신 quotaTracker.refreshFromServer로 서버 권위 플랜을 로드.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking, Platform } from 'react-native';
import {
  ErrorCode,
  endConnection,
  fetchProducts,
  finishTransaction,
  getAvailablePurchases,
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
  type Purchase,
  type PurchaseError,
  type ProductSubscription,
} from 'react-native-iap';

import { supabase } from './supabase';
import { LINKS } from '../constants/links';
import { PRODUCT_IDS } from '../constants/pricing';
import { PlanType } from '../constants/featureGates';

// ⚠️ 상품 ID는 패키지명(com.usayo.app)과 달리 com.yusay 접두사를 유지한다(플레이 콘솔 등록값).
//    달라 보이는 것이 정상이며 서버(_shared/google-play.ts)와 반드시 일치해야 한다.
//    Team(com.yusay.team.monthly)은 **인앱 구매 대상이 아니다** — 영업 문의로만 전환하므로
//    여기서 조회·구매하지 않는다(서버는 team 상품도 판정할 수 있게 열어둠).
export const PRO_SKUS = {
  monthly: PRODUCT_IDS.proMonthly,
  annual: PRODUCT_IDS.proAnnual,
} as const;

export type ProPeriod = 'monthly' | 'annual';

/**
 * 구매 실패의 종류. 문구가 완전히 달라지므로 호출부가 구분할 수 있어야 한다.
 *   cancelled       사용자가 결제창을 닫음 — 조용히 처리
 *   verify_retry    **결제는 성공**했으나 서버 검증 실패. 트랜잭션을 끝내지 않아 다음 앱
 *                   실행에서 자동 재검증된다 → "잠시 후 다시 열어달라"고 안내
 *   verify_gave_up  재시도 상한까지 검증 실패. 트랜잭션을 종료했으므로 자동 재시도는
 *                   더 없다 → "구매 복원"으로 안내
 *   error           결제 자체가 실패(스토어 오류 등)
 */
export type PurchaseFailureKind = 'cancelled' | 'verify_retry' | 'verify_gave_up' | 'error';

type Callbacks = {
  /** 구매·복원이 서버 검증까지 성공 → 플랜 반영됨 */
  onPurchased?: (plan: PlanType) => void;
  /** 실패(취소 포함). userCancelled면 조용히 처리할 것. kind로 문구를 가른다. */
  onError?: (userCancelled: boolean, kind?: PurchaseFailureKind) => void;
};

// ── 검증 실패 재시도 상한 ──────────────────────────────────
// 검증에 실패하면 트랜잭션을 끝내지 않는다(= 다음 실행에서 스토어가 다시 전달 → 자동 재검증).
// 다만 영구 실패(상품 ID 불일치, 시크릿 오설정 등)면 매 실행마다 같은 오류가 반복되므로
// 상한을 둔다. 상한에 닿으면 트랜잭션을 종료하고 '구매 복원' 경로로 넘긴다 — 구독은
// getAvailablePurchases에 계속 잡히므로 복원으로 회복 가능하다(자격이 사라지지 않는다).
//
// 3회로 정한 이유: Android는 미승인 구매를 **3일 뒤 자동 환불**한다(acknowledge는 검증
// 성공 시 서버가 한다). 즉 실패가 계속되면 어차피 사용자는 환불받는다. 그 사이 앱 실행
// 기회를 몇 번 주되 오류 안내가 무한 반복되지 않는 지점이 3회다.
const MAX_VERIFY_ATTEMPTS = 3;
const VERIFY_ATTEMPT_KEY = 'iap_verify_attempts';
// 기록이 무한히 쌓이지 않도록 오래된 항목은 버린다(구독 갱신마다 새 트랜잭션이 생긴다).
const VERIFY_ATTEMPT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type AttemptRecord = { n: number; firstAt: number };

// 재시도 카운터의 키 — iOS는 transactionId, Android는 purchaseToken이 안정적이다.
function purchaseKey(p: Purchase): string {
  const txId = (p as { transactionId?: string | null }).transactionId;
  return String(txId ?? p.purchaseToken ?? p.productId ?? 'unknown');
}

async function readAttempts(): Promise<Record<string, AttemptRecord>> {
  try {
    const raw = await AsyncStorage.getItem(VERIFY_ATTEMPT_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function writeAttempts(map: Record<string, AttemptRecord>): Promise<void> {
  const now = Date.now();
  const pruned: Record<string, AttemptRecord> = {};
  for (const [k, v] of Object.entries(map)) {
    if (v && now - (v.firstAt ?? 0) <= VERIFY_ATTEMPT_MAX_AGE_MS) pruned[k] = v;
  }
  await AsyncStorage.setItem(VERIFY_ATTEMPT_KEY, JSON.stringify(pruned)).catch(() => {});
}

/** 실패 1회 기록 → 누적 횟수 반환. 저장소 오류 시에도 최소 1을 돌려 흐름을 막지 않는다. */
async function bumpVerifyFailure(key: string): Promise<number> {
  const map = await readAttempts();
  const rec = map[key] ?? { n: 0, firstAt: Date.now() };
  rec.n += 1;
  map[key] = rec;
  await writeAttempts(map);
  return rec.n;
}

async function clearVerifyFailure(key: string): Promise<void> {
  const map = await readAttempts();
  if (map[key]) {
    delete map[key];
    await writeAttempts(map);
  }
}

let products: ProductSubscription[] = [];
let updateSub: { remove: () => void } | null = null;
let errorSub: { remove: () => void } | null = null;
let cbs: Callbacks = {};
let connected = false;
// iOS 중복 트랜잭션 가드 — StoreKit이 같은 transactionId를 재전달할 때 재검증·중복 finish 방지(세션 단위).
const processedIosTxIds = new Set<string>();

// ── 서버 검증 ────────────────────────────────────────────────
// 구매/복원 → verify-purchase Edge. 검증된 플랜을 돌려주고, 실패면 null.
// 클라는 subscriptions를 직접 쓰지 않는다(서버 권위).
async function verifyWithServer(purchase: Purchase): Promise<PlanType | null> {
  // react-native-iap v15 통합 필드. iOS=Apple 트랜잭션 JWS / Android=구글 purchaseToken.
  // 구형 Android 전용 필드는 폴백으로만 유지.
  const purchaseToken =
    purchase.purchaseToken ??
    (purchase as { purchaseTokenAndroid?: string | null }).purchaseTokenAndroid ??
    null;
  if (!purchaseToken) {
    console.warn('[iap] purchaseToken 없음 — 검증 불가');
    return null;
  }
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  console.log(`[iap] purchaseUpdated → verify 호출 sku=${purchase.productId} platform=${platform} token=${purchaseToken.slice(0, 8)}…(len=${purchaseToken.length})`);

  // functions.invoke가 Authorization에 사용자 JWT를 자동 첨부. packageName은 서버 고정.
  const { data, error } = await supabase.functions.invoke('verify-purchase', {
    body: { platform, productId: purchase.productId, purchaseToken },
  });

  if (error) {
    // FunctionsHttpError는 원본 Response를 context에 담고 있다 — 상태 코드와 본문을 꺼내야
    // 원인이 갈린다. 이게 없으면 "결제 확인 중 문제가 발생했어요"만 남고 서버 로그도 비어 있다
    // (게이트웨이에서 막히면 함수가 아예 실행되지 않아 Edge 로그에 아무것도 안 찍힌다).
    const ctx = (error as { context?: { status?: number; text?: () => Promise<string> } }).context;
    const status = ctx?.status;
    let body = '';
    try { body = ctx?.text ? (await ctx.text()).slice(0, 500) : ''; } catch { /* 본문 이미 소비됨 */ }
    console.warn(
      `[iap] verify 응답 status=${status ?? 'n/a'} name=${error.name} message=${error.message} body=${body || '(none)'}`,
    );
    // 상태 코드별 1차 판정 — 어디를 봐야 하는지 바로 알 수 있게.
    if (status === 401)      console.warn('[iap] verify 401 → 사용자 JWT 문제(세션 만료/미인증). 로그인 상태 확인.');
    else if (status === 403) console.warn('[iap] verify 403 → 서비스 계정 권한 문제. Play Console API 액세스 권한(재무 데이터 보기/주문 관리) 확인.');
    else if (status === 404) console.warn('[iap] verify 404 → 함수 미배포 또는 경로 불일치. supabase functions deploy verify-purchase 확인.');
    else if (status === 500) console.warn('[iap] verify 500 → 서버 내부 오류. Edge 로그의 stage 값 확인.');
    else if (status === 502) console.warn('[iap] verify 502 → 구글 API 호출 실패(oauth/google_get). GOOGLE_SERVICE_ACCOUNT_JSON 확인.');
    return null;
  }

  const res = data as { verified?: boolean; plan?: PlanType; stage?: string; error?: string } | null;
  console.log(`[iap] verify 응답 status=200 body=${JSON.stringify(res)?.slice(0, 500)}`);
  if (res?.verified !== true) {
    // 200이지만 미검증 — 서버가 stage/error로 이유를 알려준다(unknown_product, account_mismatch 등).
    console.warn(`[iap] 미검증 구매 — 플랜 부여 안 함 stage=${res?.stage ?? 'n/a'} error=${res?.error ?? 'n/a'}`);
    return null;
  }
  console.log(`[iap] 검증 성공 plan=${res.plan}`);
  return res.plan ?? 'pro';
}

// 검증 성공 후 서버 권위 플랜을 다시 읽어 store에 반영.
// (Edge가 이미 subscriptions를 write했으므로 여기서는 읽기만 — 클라가 플랜을 지어내지 않는다.)
async function refreshPlanFromServer(): Promise<void> {
  try {
    const { quotaTracker } = await import('../services/subscription/QuotaTracker');
    await quotaTracker.refreshFromServer();
  } catch (e) {
    console.warn('[iap] 서버 플랜 재조회 실패(다음 부팅에 반영):', (e as Error)?.message);
  }
}

// ── 연결/해제 ────────────────────────────────────────────────
export async function connectIAP(callbacks: Callbacks = {}): Promise<void> {
  cbs = callbacks;
  if (connected) return; // 중복 초기화 방지(리스너 이중 등록 시 검증이 두 번 돈다)
  try {
    await initConnection();
    connected = true;
  } catch (e) {
    // 스토어 연결 실패(에뮬레이터·미지원 기기) — graceful. 구매 버튼은 눌러도 안내만.
    console.log('[iap] initConnection 실패(스토어 미지원 환경일 수 있음):', (e as Error)?.message);
    return;
  }

  updateSub = purchaseUpdatedListener((purchase: Purchase) => {
    void (async () => {
      // iOS: 같은 transactionId 재전달 방지(세션 단위). Android는 미적용(발화 패턴이 다름).
      // 세션 단위라 검증 실패로 미완료된 트랜잭션은 **다음 앱 실행에서 다시 올라온다**(= 재시도).
      const iosTxId =
        Platform.OS === 'ios' && purchase.transactionId ? String(purchase.transactionId) : '';
      if (iosTxId) {
        if (processedIosTxIds.has(iosTxId)) return;
        processedIosTxIds.add(iosTxId);
      }

      const key = purchaseKey(purchase);
      const plan = await verifyWithServer(purchase);

      if (plan) {
        // 검증 성공 → 완료 처리. 구독(비소비형)이라 isConsumable=false.
        await finishTransaction({ purchase, isConsumable: false }).catch(() => {});
        await clearVerifyFailure(key);
        await refreshPlanFromServer();
        cbs.onPurchased?.(plan);
        return;
      }

      // ── 검증 실패 ──
      // **트랜잭션을 끝내지 않는다.** 끝내면 스토어가 재전달하지 않아 "결제는 됐는데 플랜이
      // 안 오르는" 상태로 굳는다. 미완료로 두면 다음 실행에서 리스너로 다시 올라와 자동
      // 재검증된다(사용자가 '구매 복원'을 눌러야 한다는 걸 알 필요가 없다).
      const attempts = await bumpVerifyFailure(key);
      if (attempts < MAX_VERIFY_ATTEMPTS) {
        console.warn(
          `[iap] 검증 실패 ${attempts}/${MAX_VERIFY_ATTEMPTS} — 트랜잭션 미완료 유지(다음 실행에서 자동 재검증) key=${key.slice(0, 12)}…`,
        );
        cbs.onError?.(false, 'verify_retry');
        return;
      }

      // 상한 도달 — 더 끌면 앱을 열 때마다 같은 오류가 반복된다. 완료 처리하고 복원으로 넘긴다.
      // 자격이 사라지는 것은 아니다: 구독은 getAvailablePurchases에 계속 잡히므로
      // '구매 복원'이 그대로 동작한다.
      console.warn(
        `[iap] 검증 ${attempts}회 실패 — 트랜잭션 종료. 복원 경로로 안내한다. key=${key.slice(0, 12)}…`,
      );
      await finishTransaction({ purchase, isConsumable: false }).catch(() => {});
      await clearVerifyFailure(key);
      cbs.onError?.(false, 'verify_gave_up');
    })();
  });

  errorSub = purchaseErrorListener((e: PurchaseError) => {
    // 취소도 여기로 온다 — 사용자 취소인지 실제 오류인지 코드로 구분해 남긴다.
    const cancelled = e.code === ErrorCode.UserCancelled;
    console.log(
      `[iap] purchaseError code=${e.code} message=${e.message ?? '(none)'}` +
      ` productId=${(e as PurchaseError & { productId?: string }).productId ?? 'n/a'}` +
      ` cancelled=${cancelled}`,
    );
    cbs.onError?.(cancelled, cancelled ? 'cancelled' : 'error');
  });

  await loadProducts();
}

export async function disconnectIAP(): Promise<void> {
  updateSub?.remove();
  updateSub = null;
  errorSub?.remove();
  errorSub = null;
  cbs = {};
  products = [];
  connected = false;
  await endConnection().catch(() => {});
}

/** 리스너 콜백만 교체(연결은 유지). 모달이 열릴 때 자기 핸들러를 붙이는 용도. */
export function setIAPCallbacks(callbacks: Callbacks): void {
  cbs = callbacks;
}

// ── 상품 조회 ────────────────────────────────────────────────

// 상품 1개의 진단 문자열. 플랫폼마다 의미 있는 필드가 다르다.
//
// Android
//  · status=not-found           → 그 SKU가 Play에 없음(오타/미등록/전파 전)
//  · status=no-offers-available → SKU는 있으나 이 사용자가 받을 수 있는 오퍼가 없음
//  · offers=0                   → 기본 요금제가 비활성/가격 미설정 → 구매 자체가 불가
function androidDiag(p: ProductSubscription): string {
  const st = (p as ProductSubscription & { productStatusAndroid?: string }).productStatusAndroid;
  return `${p.id}(status=${st ?? 'n/a'} offers=${offerCount(p)})`;
}

// iOS
//  · price/currency → 스토어가 실제로 돌려준 가격. 여기가 비면 상품이 덜 설정된 것이다.
//  · period         → 결제 주기(1MONTH / 1YEAR 등). 월/연 상품이 뒤바뀌지 않았는지 확인용.
//  · group          → 구독 그룹 ID. 월·연이 **같은 그룹**이어야 상호 전환이 정상 동작한다.
//  · offers         → 도입 오퍼(무료 체험) 개수. 페이월의 "7일 무료 체험" 표시와 대조할 값.
function iosDiag(p: ProductSubscription): string {
  const ios = p as ProductSubscription & {
    displayPrice?: string | null;
    currency?: string | null;
    subscriptionPeriodNumberIOS?: string | null;
    subscriptionPeriodUnitIOS?: string | null;
    subscriptionGroupIdIOS?: string | null;
  };
  const num = ios.subscriptionPeriodNumberIOS;
  const unit = ios.subscriptionPeriodUnitIOS;
  const period = num && unit ? `${num}${unit}` : 'n/a';
  return (
    `${p.id}(price=${ios.displayPrice ?? 'n/a'}` +
    ` cur=${ios.currency ?? 'n/a'}` +
    ` period=${period}` +
    ` group=${ios.subscriptionGroupIdIOS ?? 'n/a'}` +
    ` offers=${offerCount(p)})`
  );
}

// 구매 가능한 오퍼 개수. iOS는 표준 필드(subscriptionOffers), Android는 전용 필드를 본다.
function offerCount(p: ProductSubscription): number {
  if (Platform.OS === 'ios') {
    return (p as ProductSubscription & { subscriptionOffers?: unknown[] | null })
      .subscriptionOffers?.length ?? 0;
  }
  return (p as ProductSubscription & { subscriptionOfferDetailsAndroid?: unknown[] })
    .subscriptionOfferDetailsAndroid?.length ?? 0;
}
export async function loadProducts(): Promise<ProductSubscription[]> {
  const requested = [PRO_SKUS.monthly, PRO_SKUS.annual];
  try {
    const res = await fetchProducts({ skus: requested, type: 'subs' });
    products = (res ?? []).filter(Boolean) as ProductSubscription[];

    // 진단: 조회 실패한 SKU는 **예외도 경고도 없이 배열에서 빠진다**(라이브러리 문서:
    // "Unknown SKUs are simply omitted from the result, not thrown"). 개수만으로는 어느 쪽이
    // 빠졌는지 알 수 없어 요청↔수신을 대조하고 상품별 상태를 함께 남긴다.
    //
    // ⚠️ 플랫폼별로 읽는 필드가 다르다. Android 전용 필드(productStatusAndroid,
    //    subscriptionOfferDetailsAndroid)는 iOS에서 항상 undefined라, 그대로 찍으면 정상
    //    상품도 `status=n/a offers=0`으로 나와 "오퍼가 없다"고 오독하게 된다.
    const received = products.map((p) => (Platform.OS === 'ios' ? iosDiag(p) : androidDiag(p)));
    const missing = requested.filter((sku) => !products.some((p) => p.id === sku));
    console.log(
      `[iap] fetchProducts: ${products.length}/${requested.length}개` +
      ` 요청=[${requested.join(', ')}]` +
      ` 수신=[${received.join(' | ')}]` +
      ` 누락=[${missing.join(', ') || '없음'}]`,
    );
    if (missing.length > 0) {
      console.warn(
        Platform.OS === 'ios'
          ? `[iap] 상품 누락 — App Store Connect에서 확인: 상품 존재 여부 / 구독 그룹 배정 / 상태가 "제출 준비 완료" 이상 / 유료 계약(Paid Applications) 체결 / 해당 지역 가격 설정. 누락=${missing.join(', ')}`
          : `[iap] 상품 누락 — Play Console에서 확인: 상품 존재 여부 / 기본 요금제 활성 / 해당 국가 가격 설정 / 변경 후 전파 지연. 누락=${missing.join(', ')}`,
      );
    }
    // 페이월이 "7일 무료 체험"을 표시하므로 오퍼가 0이면 표시와 실제가 어긋난다(심사 반려 사유).
    const noOffer = products.filter((p) => offerCount(p) === 0).map((p) => p.id);
    if (noOffer.length > 0) {
      console.warn(
        Platform.OS === 'ios'
          ? `[iap] 오퍼 없음 — App Store Connect에 '무료 체험(Introductory Offer)'이 등록되지 않았다. 페이월의 "7일 무료 체험" 표시와 어긋난다. 대상=${noOffer.join(', ')}`
          : `[iap] 오퍼 없음 — 기본 요금제가 비활성이거나 가격이 없어 구매가 불가능하다. 대상=${noOffer.join(', ')}`,
      );
    }
  } catch (e) {
    // skus가 비었거나 스토어 미연결·네트워크 오류일 때만 throw된다(개별 SKU 실패는 여기 안 옴).
    console.log('[iap] fetchProducts 실패:', (e as Error)?.message);
    products = [];
  }
  return products;
}

/** 캐시된 Pro 상품. 비어 있으면 loadProducts()로 재조회할 것. */
export function getProProducts(): { monthly?: ProductSubscription; annual?: ProductSubscription } {
  return {
    monthly: products.find((p) => p.id === PRO_SKUS.monthly),
    annual: products.find((p) => p.id === PRO_SKUS.annual),
  };
}

// 표시용 가격 문자열 — 스토어 제공값. 없으면 호출부가 참조가(DEFAULT_PRICE)로 폴백.
export function priceStringOf(p?: ProductSubscription): string | undefined {
  if (!p) return undefined;
  const withDisplay = p as ProductSubscription & { displayPrice?: string };
  return withDisplay.displayPrice;
}

// 비교용 숫자 가격(절약률 계산). 스토어가 숫자를 안 주면 undefined.
export function priceNumberOf(p?: ProductSubscription): number | undefined {
  if (!p) return undefined;
  const withPrice = p as ProductSubscription & { price?: number };
  return typeof withPrice.price === 'number' ? withPrice.price : undefined;
}

// ── 구매 ─────────────────────────────────────────────────────
// 성공은 purchaseUpdatedListener(비동기)에서 처리된다. throw는 호출부 로딩 해제용.
export async function purchasePro(period: ProPeriod): Promise<void> {
  const sku = PRO_SKUS[period];
  // 상품 캐시가 비었으면(초기화 실패·앱 백그라운드 복귀 등) 한 번 재조회.
  if (products.length === 0) await loadProducts();

  // Android 구독은 offerToken(기본 오퍼) 필요 — 조회한 상품의 첫 오퍼 사용.
  const prod = products.find((p) => p.id === sku);
  const offerToken =
    Platform.OS === 'android'
      ? (prod as ProductSubscription & { subscriptionOfferDetailsAndroid?: { offerToken: string }[] })
          ?.subscriptionOfferDetailsAndroid?.[0]?.offerToken
      : undefined;

  // 구매를 현재 Supabase 계정에 묶는다 — 서버 검증에서 대조(한 스토어계정 → 여러 앱계정 도용 방지).
  // 익명 사용자도 uid가 있으므로 그대로 심는다(Supabase uid는 UUID라 iOS appAccountToken과 호환).
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;

  // 진단: 어떤 SKU로 요청했고 offerToken이 실렸는지. Android는 offerToken이 없으면 구매창이
  // 뜨지 않거나 즉시 실패한다(= 상품은 조회됐지만 기본 요금제가 없는 경우).
  console.log(
    `[iap] requestPurchase sku=${sku} offerToken=${offerToken ? '있음' : '없음'}` +
    ` 상품캐시=${products.length}개 uid=${uid ? uid.slice(0, 8) + '…' : '(없음)'}`,
  );
  if (Platform.OS === 'android' && !offerToken) {
    console.warn(`[iap] offerToken 없음 — ${sku}의 기본 요금제가 조회되지 않았다(비활성/가격 미설정/전파 전). 구매가 실패할 수 있다.`);
  }

  await requestPurchase({
    type: 'subs',
    request: {
      apple: { sku, appAccountToken: uid },
      google: {
        skus: [sku],
        subscriptionOffers: offerToken ? [{ sku, offerToken }] : [],
        obfuscatedAccountId: uid,
      },
    },
  });
}

// ── 복원 ─────────────────────────────────────────────────────
// 구글 플레이 필수 요건(재설치·기기 변경 시 구매 복구 경로).
// 활성 구독이 있으면 서버 검증을 다시 태워 subscriptions를 재기록한다.
// true = 복원됨 / false = 복원할 구매 없음.
export async function restorePurchases(): Promise<boolean> {
  const purchases = await getAvailablePurchases().catch(() => [] as Purchase[]);
  const ours = (purchases ?? []).filter(
    (p) => p.productId === PRO_SKUS.monthly || p.productId === PRO_SKUS.annual,
  );
  if (ours.length === 0) return false;

  // 여러 건이면 최신 것부터 시도(기기 이관 후 과거 만료건이 섞여 올 수 있다).
  const sorted = ours.slice().sort((a, b) => {
    const at = Number((a as { transactionDate?: number }).transactionDate ?? 0);
    const bt = Number((b as { transactionDate?: number }).transactionDate ?? 0);
    return bt - at;
  });

  for (const p of sorted) {
    const plan = await verifyWithServer(p);
    if (plan) {
      // 복원된 구매가 미승인 상태로 남아 있을 수 있어 완료 처리(중복 호출은 무해).
      await finishTransaction({ purchase: p, isConsumable: false }).catch(() => {});
      // 이 구매로 쌓였던 검증 실패 기록을 지운다 — 복원으로 회복됐으므로 상한을 리셋한다.
      await clearVerifyFailure(purchaseKey(p));
      await refreshPlanFromServer();
      cbs.onPurchased?.(plan);
      return true;
    }
  }
  return false;
}

/** 스토어의 구독 관리 화면. 해지·결제수단 변경은 스토어에서만 가능하다. */
export function openManageSubscriptions(): void {
  // react-native-iap는 전용 API를 노출하지 않아 스토어 URL로 연다.
  // 플랫폼 분기와 패키지 파라미터는 LINKS.manageSubscription이 이미 반영하고 있다.
  Linking.openURL(LINKS.manageSubscription).catch(() => {});
}
