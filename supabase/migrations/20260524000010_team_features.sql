-- YuSay: 팀 공유 캘린더 — event_requests, team_events, team_invites

-- ── event_requests: 팀원 간 이벤트 요청 ──────────────────────────

CREATE TABLE public.event_requests (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id        UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  requester_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  start_at       TIMESTAMPTZ NOT NULL,
  end_at         TIMESTAMPTZ NOT NULL,
  location       TEXT,
  note           TEXT,
  status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'approved', 'rejected')),
  event_id       UUID REFERENCES public.events(id),   -- 승인 후 생성된 이벤트
  responded_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_event_requests_requester ON public.event_requests(requester_id);
CREATE INDEX idx_event_requests_target    ON public.event_requests(target_user_id);
CREATE INDEX idx_event_requests_pending   ON public.event_requests(status) WHERE status = 'pending';

-- ── team_events: 팀 브로드캐스트 일정 ────────────────────────────

CREATE TABLE public.team_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  created_by  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  start_at    TIMESTAMPTZ NOT NULL,
  end_at      TIMESTAMPTZ NOT NULL,
  location    TEXT,
  scope       TEXT NOT NULL DEFAULT 'broadcast'
                CHECK (scope IN ('broadcast', 'optional')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_team_events_team  ON public.team_events(team_id);
CREATE INDEX idx_team_events_start ON public.team_events(start_at);

-- ── team_invites: 팀 초대 ─────────────────────────────────────────

CREATE TABLE public.team_invites (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id    UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  email      TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  token      TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_team_invites_token ON public.team_invites(token);
CREATE INDEX idx_team_invites_team  ON public.team_invites(team_id);

-- ── display_name 컬럼 추가 (팀원 표시명) ─────────────────────────

ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS display_name TEXT;

-- ── RLS: event_requests ────────────────────────────────────────────

ALTER TABLE public.event_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "event_requests: select own"
  ON public.event_requests FOR SELECT
  USING (requester_id = auth.uid() OR target_user_id = auth.uid());

CREATE POLICY "event_requests: insert requester"
  ON public.event_requests FOR INSERT
  WITH CHECK (requester_id = auth.uid());

-- 대상자만 승인/거절 가능
CREATE POLICY "event_requests: update target"
  ON public.event_requests FOR UPDATE
  USING  (target_user_id = auth.uid())
  WITH CHECK (target_user_id = auth.uid());

-- 요청자만 pending 상태에서 취소 가능
CREATE POLICY "event_requests: delete requester"
  ON public.event_requests FOR DELETE
  USING (requester_id = auth.uid() AND status = 'pending');

-- ── RLS: team_events ──────────────────────────────────────────────

ALTER TABLE public.team_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team_events: select member"
  ON public.team_events FOR SELECT
  USING (
    team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
  );

CREATE POLICY "team_events: insert admin"
  ON public.team_events FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND team_id IN (
      SELECT team_id FROM public.team_members
       WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "team_events: update admin"
  ON public.team_events FOR UPDATE
  USING (
    team_id IN (
      SELECT team_id FROM public.team_members
       WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "team_events: delete admin"
  ON public.team_events FOR DELETE
  USING (
    team_id IN (
      SELECT team_id FROM public.team_members
       WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- ── RLS: team_invites ─────────────────────────────────────────────

ALTER TABLE public.team_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team_invites: select admin"
  ON public.team_invites FOR SELECT
  USING (
    invited_by = auth.uid()
    OR team_id IN (
      SELECT team_id FROM public.team_members
       WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "team_invites: insert admin"
  ON public.team_invites FOR INSERT
  WITH CHECK (
    invited_by = auth.uid()
    AND team_id IN (
      SELECT team_id FROM public.team_members
       WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- ── Supabase Realtime 활성화 ──────────────────────────────────────
-- 두 테이블에 REPLICA IDENTITY FULL 설정 (변경 전/후 데이터 모두 전송)

ALTER TABLE public.team_events    REPLICA IDENTITY FULL;
ALTER TABLE public.event_requests REPLICA IDENTITY FULL;

-- Realtime publication에 추가 (Supabase 기본 publication 사용)
-- 대시보드 Database > Replication에서 활성화하거나 아래 실행:
-- BEGIN; SELECT * FROM supabase_realtime.messages LIMIT 0; COMMIT;
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.team_events;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.event_requests;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- ── WokyToky 연동용 뷰 (같은 Supabase 인스턴스일 때) ─────────────
-- WokyToky의 workers / attendance 테이블이 public 스키마에 있다고 가정
-- 별도 인스턴스면 REST API로 대체

CREATE OR REPLACE VIEW public.wokytoky_work_schedule AS
SELECT
  w.user_id,
  a.date,
  a.clock_in,
  a.clock_out
FROM public.workers   w
JOIN public.attendance a ON a.worker_id = w.id
WHERE a.clock_in IS NOT NULL;

COMMENT ON VIEW public.wokytoky_work_schedule IS
  'WokyToky 근태 데이터 뷰 — workers/attendance 테이블이 없으면 무시됨';
