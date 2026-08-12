-- subscriptions.user_id UNIQUE 제약 추가.
-- 목적: revenuecat-webhook 의 upsert(onConflict: 'user_id') 가 동작하려면
--       user_id 에 UNIQUE(또는 exclusion) 제약이 필요하다. 현재는 비유니크 인덱스만 있어
--       upsert 가 런타임 에러가 나거나 중복 행이 쌓일 수 있다.
--
-- 주의: 기존에 같은 user_id 로 여러 행이 있으면 제약 추가가 실패하므로 먼저 중복을 정리한다.
--       (테스트 중 수동 INSERT 한 pro 행 등으로 중복 가능.)

-- ── 1) 중복 정리: user_id 별 최신 1행만 남기고 삭제 ────────────────────────
--    최신 기준 = updated_at 내림차순, 동률이면 id 로 tie-break(임의의 단일 행 확정).
DELETE FROM public.subscriptions AS s
USING public.subscriptions AS keep
WHERE s.user_id = keep.user_id
  AND s.id <> keep.id
  AND (
        s.updated_at < keep.updated_at
     OR (s.updated_at = keep.updated_at AND s.id < keep.id)
      );

-- ── 2) UNIQUE 제약 추가 ───────────────────────────────────────────────────
--    이미 존재하면 무시(재실행 안전).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscriptions_user_id_key'
      AND conrelid = 'public.subscriptions'::regclass
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_user_id_key UNIQUE (user_id);
  END IF;
END $$;
