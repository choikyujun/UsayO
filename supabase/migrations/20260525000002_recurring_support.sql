-- YuSay: 반복 일정 지원 추가

-- 반복 종료일 (없으면 무한 반복)
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS recurrence_end_date DATE;

-- 반복 일정 예외 (개별 인스턴스 수정/삭제)
CREATE TABLE IF NOT EXISTS public.event_exceptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id       UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  instance_date   DATE NOT NULL,
  is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
  override_start  TIMESTAMPTZ,
  override_end    TIMESTAMPTZ,
  override_title  TEXT,
  override_location TEXT,
  override_notes  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (parent_id, instance_date)
);

-- RLS: 본인 일정 예외만 관리
ALTER TABLE public.event_exceptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can manage own exceptions"
  ON public.event_exceptions
  USING (
    parent_id IN (
      SELECT id FROM public.events WHERE user_id = auth.uid()
    )
  );
