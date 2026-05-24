-- YuSay: 월별 음성 사용량 추적 (Free 플랜 제한 적용)
-- Free: create 50회/월, modify 20회/월, query 3회/연속

CREATE TABLE public.user_quotas (
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  month        TEXT NOT NULL,    -- 'YYYY-MM' 형식
  create_count INT NOT NULL DEFAULT 0,
  modify_count INT NOT NULL DEFAULT 0,
  query_count  INT NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, month)
);

CREATE INDEX idx_user_quotas_month ON public.user_quotas(user_id, month);

-- 사용량 증가 함수 (RPC로 호출)
CREATE OR REPLACE FUNCTION public.increment_quota(
  p_user_id  UUID,
  p_month    TEXT,
  p_action   TEXT  -- 'create' | 'modify' | 'query'
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.user_quotas (user_id, month)
  VALUES (p_user_id, p_month)
  ON CONFLICT (user_id, month) DO NOTHING;

  IF p_action = 'create' THEN
    UPDATE public.user_quotas
       SET create_count = create_count + 1, updated_at = NOW()
     WHERE user_id = p_user_id AND month = p_month;
  ELSIF p_action = 'modify' THEN
    UPDATE public.user_quotas
       SET modify_count = modify_count + 1, updated_at = NOW()
     WHERE user_id = p_user_id AND month = p_month;
  ELSIF p_action = 'query' THEN
    UPDATE public.user_quotas
       SET query_count = query_count + 1, updated_at = NOW()
     WHERE user_id = p_user_id AND month = p_month;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
