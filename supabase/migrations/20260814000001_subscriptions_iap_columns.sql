-- IAP 전환 2단계: 스토어 직접 검증(verify-purchase / play-rtdn)에 필요한 컬럼 추가.
--
-- 배경: 기존 구독 정보는 RevenueCat 경유(revenuecat_customer_id/entitlement)로만 채워졌다.
--       react-native-iap 직접 연동으로 넘어가면서 구글 플레이의 purchaseToken을 저장해야
--       (a) RTDN이 uid 없이도 purchase_token으로 해당 행을 찾아 갱신·강등할 수 있고,
--       (b) 어느 상품/플랫폼에서 온 구독인지 추적할 수 있다.
--
-- ⚠️ revenuecat_* 컬럼은 지우지 않는다. RevenueCat 병행 기간 동안 기존 값이 살아 있어야 하고,
--    문제가 생겼을 때 되돌릴 경로가 남아야 한다.
--
-- 재실행 안전(IF NOT EXISTS). 전부 nullable — 기존 행은 NULL로 남고 stt-proxy 판정에 영향 없다
-- (stt-proxy는 plan/status/current_period_end만 읽는다).

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS purchase_token TEXT,   -- 구글: purchaseToken / 애플: originalTransactionId
  ADD COLUMN IF NOT EXISTS product_id     TEXT,   -- com.yusay.pro.monthly | .pro.annual | .team.monthly
  ADD COLUMN IF NOT EXISTS platform       TEXT;   -- 'android' | 'ios'

-- purchase_token 조회 인덱스.
-- RTDN은 uid를 모를 때(구글 응답에 obfuscatedExternalAccountId가 없는 경우) 이 컬럼으로
-- 행을 찾아 갱신·강등한다. 인덱스가 없으면 알림마다 풀스캔이 된다.
CREATE INDEX IF NOT EXISTS idx_subscriptions_purchase_token
  ON public.subscriptions(purchase_token)
  WHERE purchase_token IS NOT NULL;

-- 참고 — 매핑 메모(컬럼을 새로 만들지 않고 기존 것을 쓰는 부분):
--   Ksori의 auto_renewing        → UsayO는 cancel_at_period_end(반대 의미)로 표현한다.
--                                   자동갱신 off = 해지 예약 = cancel_at_period_end TRUE.
--   Ksori의 latest_verified_at   → UsayO는 updated_at(트리거가 자동 갱신)으로 대체한다.
--   Ksori의 order_id / environment / obfuscated_account_id → 이번 범위에서는 저장하지 않는다.
--                                   (환불 추적·샌드박스 구분이 필요해지면 그때 추가.)

COMMENT ON COLUMN public.subscriptions.purchase_token IS
  '스토어 구독 안정키. 구글=purchaseToken, 애플=originalTransactionId. RTDN이 uid 없이 행을 찾는 키.';
COMMENT ON COLUMN public.subscriptions.product_id IS
  '스토어 상품 ID. 패키지명(com.usayo.app)과 달리 상품 ID는 com.yusay 접두사를 유지한다(콘솔 등록값).';
COMMENT ON COLUMN public.subscriptions.platform IS
  '구매 플랫폼: android | ios. RevenueCat 경유 기존 행은 NULL.';
