-- YuSay: Edge Function 3단계 — 서버 사이드 쿼터 강제 (Phase B)
--
-- 목적
--  ① user_quotas를 클라이언트가 조작하지 못하도록 쓰기를 서비스 롤 전용으로 잠금
--  ② 단일 "월 음성 명령" 버킷(command_count)으로 전환 + 원자적 검사·증가 RPC
--  ③ profiles.plan 클라이언트 스푸핑 차단 (권한 판정은 subscriptions만 사용)
--
-- 실행: Supabase 대시보드 SQL Editor에서 이 파일 전체를 실행.
-- (Edge Function 배포와 분리 — 배포 명령은 별도 안내 참고)

-- ── 1. 단일 버킷 컬럼 추가 ───────────────────────────────────────────
-- 기존 create/modify/query 3컬럼은 남겨두되(과거 데이터 보존), 강제는 command_count만 사용.
ALTER TABLE public.user_quotas
  ADD COLUMN IF NOT EXISTS command_count INT NOT NULL DEFAULT 0;

-- ── 2. RLS: 클라이언트 쓰기 차단, 본인 행 SELECT만 허용 ───────────────
-- 기존 "all own"(FOR ALL) 정책은 클라가 자기 카운트를 UPDATE/DELETE로 리셋 가능 → 제거.
DROP POLICY IF EXISTS "user_quotas: all own" ON public.user_quotas;

CREATE POLICY "user_quotas: select own"
  ON public.user_quotas FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT/UPDATE/DELETE 정책을 만들지 않음 → anon/authenticated는 쓰기 불가.
-- 서비스 롤(프록시)은 RLS를 우회하므로 아래 RPC로만 증가/감소.

-- ── 3. 원자적 검사+증가 RPC (경쟁 조건 방지) ─────────────────────────
-- 현재 카운트를 FOR UPDATE로 잠근 뒤 한도 검사 → 미만이면 +1, 초과면 증가 없이 거부.
-- 단일 트랜잭션이라 동시 호출에도 한도를 넘겨 증가되지 않음.
CREATE OR REPLACE FUNCTION public.check_and_increment_quota(
  p_user_id UUID,
  p_month   TEXT,   -- 'YYYY-MM' (프록시가 UTC 기준으로 전달)
  p_limit   INT
)
RETURNS jsonb AS $$
DECLARE
  v_used INT;
BEGIN
  INSERT INTO public.user_quotas (user_id, month)
  VALUES (p_user_id, p_month)
  ON CONFLICT (user_id, month) DO NOTHING;

  SELECT command_count INTO v_used
    FROM public.user_quotas
   WHERE user_id = p_user_id AND month = p_month
     FOR UPDATE;                          -- 행 잠금

  IF v_used >= p_limit THEN
    RETURN jsonb_build_object('allowed', false, 'used', v_used, 'limit', p_limit);
  END IF;

  UPDATE public.user_quotas
     SET command_count = command_count + 1, updated_at = NOW()
   WHERE user_id = p_user_id AND month = p_month;

  RETURN jsonb_build_object('allowed', true, 'used', v_used + 1, 'limit', p_limit);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 클라이언트 직접 호출 차단 — 서비스 롤(프록시)만.
REVOKE ALL ON FUNCTION public.check_and_increment_quota(UUID, TEXT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_and_increment_quota(UUID, TEXT, INT) FROM anon, authenticated;

-- ── 3b. 롤백용 감소 RPC ──────────────────────────────────────────────
-- 상류(Whisper) 호출이 실패했거나 무음(빈 텍스트)일 때 증가분을 되돌린다.
-- (실패/무음 호출은 카운트하지 않는다.)
CREATE OR REPLACE FUNCTION public.decrement_quota(
  p_user_id UUID,
  p_month   TEXT
)
RETURNS VOID AS $$
BEGIN
  UPDATE public.user_quotas
     SET command_count = GREATEST(command_count - 1, 0), updated_at = NOW()
   WHERE user_id = p_user_id AND month = p_month;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.decrement_quota(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decrement_quota(UUID, TEXT) FROM anon, authenticated;

-- ── 4. profiles.plan 클라이언트 스푸핑 차단 ──────────────────────────
-- ⚠️ [보류·미실행] 이 블록은 아직 적용하지 않았음 (2026-07-28 기준).
--    사유: 트리거의 current_user 판정(서비스 롤 vs authenticated)이 실제
--          RevenueCat 웹훅 경로에서 의도대로 동작하는지 샌드박스 결제로 검증 필요.
--          잘못 적용되면 웹훅의 정상 plan 갱신까지 막힐 위험이 있어 보류.
--    적용 조건: 샌드박스 결제로 (a) 클라의 profiles.plan 직접 수정이 무력화되고
--               (b) 웹훅(서비스 롤)의 plan 갱신은 정상 동작함을 확인한 뒤 아래 주석 해제.
--    ※ 지금은 profiles.plan을 "권한 판정"에 쓰지 않으므로(서버는 subscriptions만 신뢰,
--       클라 _syncPlanToSupabase는 no-op화) 이 트리거 미적용이 즉시 취약점은 아님.
/*  <<< 검증 완료 후 이 주석 블록을 해제하여 적용할 것 >>>
CREATE OR REPLACE FUNCTION public.protect_profile_plan()
RETURNS TRIGGER AS $$
BEGIN
  IF current_user <> 'service_role'
     AND (NEW.plan IS DISTINCT FROM OLD.plan
          OR NEW.plan_expires_at IS DISTINCT FROM OLD.plan_expires_at)
  THEN
    NEW.plan            := OLD.plan;
    NEW.plan_expires_at := OLD.plan_expires_at;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_profile_plan ON public.profiles;
CREATE TRIGGER trg_protect_profile_plan
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_plan();
*/
