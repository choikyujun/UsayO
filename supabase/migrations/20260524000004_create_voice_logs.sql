-- YuSay: 음성 사용 로그 (개인정보 — 오디오 파일은 서버 저장 금지)

CREATE TABLE public.voice_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action_type      TEXT NOT NULL
                     CHECK (action_type IN ('create', 'update', 'delete', 'query')),
  intent_detected  TEXT,
  confidence       FLOAT,
  transcript       TEXT,         -- STT 결과 텍스트만 저장 (오디오 파일 저장 금지)
  audio_deleted_at TIMESTAMPTZ,  -- 오디오 처리 완료 즉시 기록
  result_event_id  UUID REFERENCES public.events(id) ON DELETE SET NULL,
  success          BOOLEAN,
  error_code       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_voice_logs_user_month ON public.voice_logs(user_id, created_at);
