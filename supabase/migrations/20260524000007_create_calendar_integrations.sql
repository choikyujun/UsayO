-- YuSay: 외부 캘린더 연동 (Pro 플랜 이상)
-- 주의: access_token, refresh_token은 Vault 암호화 저장 권장

CREATE TABLE public.calendar_integrations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider         TEXT NOT NULL
                     CHECK (provider IN ('google', 'apple', 'outlook')),
  access_token     TEXT,         -- 암호화 저장 (Supabase Vault 사용 권장)
  refresh_token    TEXT,         -- 암호화 저장
  token_expires_at TIMESTAMPTZ,
  calendar_id      TEXT,
  sync_enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  last_synced_at   TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_calendar_integrations_user_provider
  ON public.calendar_integrations(user_id, provider);
