-- YuSay: 핵심 일정 테이블 (schedules 테이블 완전판)
-- 기존 schedules 테이블은 보존 — 마이그레이션 완료 후 deprecate 예정

CREATE TABLE public.events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  team_id         UUID REFERENCES public.teams(id) ON DELETE SET NULL,

  title           TEXT NOT NULL,
  description     TEXT,
  start_at        TIMESTAMPTZ NOT NULL,
  end_at          TIMESTAMPTZ NOT NULL,
  is_all_day      BOOLEAN NOT NULL DEFAULT FALSE,
  location        TEXT,
  color           TEXT NOT NULL DEFAULT '#534AB7',
  category        TEXT NOT NULL DEFAULT 'work'
                    CHECK (category IN ('work', 'personal', 'important')),

  -- 반복 일정 (RFC 5545 RRULE)
  is_recurring    BOOLEAN NOT NULL DEFAULT FALSE,
  recurrence_rule TEXT,
  parent_event_id UUID REFERENCES public.events(id) ON DELETE CASCADE,

  -- 외부 캘린더 연동
  google_event_id TEXT,
  apple_event_id  TEXT,

  -- 음성 생성 메타
  created_via     TEXT NOT NULL DEFAULT 'manual'
                    CHECK (created_via IN ('voice', 'manual', 'sync')),
  voice_transcript TEXT,

  -- 소프트 삭제 (5초 되돌리기용)
  deleted_at      TIMESTAMPTZ,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER events_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 기존 schedules → events 데이터 이관
INSERT INTO public.events (
  id, user_id, title, start_at, end_at,
  is_recurring, recurrence_rule, created_via, created_at, updated_at
)
SELECT
  id,
  user_id,
  title,
  start_at,
  COALESCE(end_at, start_at + INTERVAL '1 hour') AS end_at,
  is_recurring,
  recurrence_rule,
  'manual' AS created_via,
  created_at,
  updated_at
FROM public.schedules
ON CONFLICT (id) DO NOTHING;
