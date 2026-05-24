-- YuSay: 전체 테이블 RLS 정책

-- ── profiles ────────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles: select own"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "profiles: insert own"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles: update own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ── events ───────────────────────────────────────────────────
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- 본인 이벤트 또는 소속 팀 이벤트
CREATE POLICY "events: all own"
  ON public.events FOR ALL
  USING (
    auth.uid() = user_id
    OR team_id IN (
      SELECT team_id FROM public.team_members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = user_id
  );

-- ── teams ────────────────────────────────────────────────────
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "teams: select member"
  ON public.teams FOR SELECT
  USING (
    id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
    OR owner_id = auth.uid()
  );

CREATE POLICY "teams: insert owner"
  ON public.teams FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "teams: update owner"
  ON public.teams FOR UPDATE
  USING (owner_id = auth.uid());

-- ── team_members ─────────────────────────────────────────────
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team_members: select member"
  ON public.team_members FOR SELECT
  USING (
    team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
  );

CREATE POLICY "team_members: insert admin"
  ON public.team_members FOR INSERT
  WITH CHECK (
    team_id IN (
      SELECT team_id FROM public.team_members
       WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "team_members: delete admin"
  ON public.team_members FOR DELETE
  USING (
    user_id = auth.uid()
    OR team_id IN (
      SELECT team_id FROM public.team_members
       WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- ── user_quotas ───────────────────────────────────────────────
ALTER TABLE public.user_quotas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_quotas: all own"
  ON public.user_quotas FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── voice_logs ────────────────────────────────────────────────
ALTER TABLE public.voice_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "voice_logs: all own"
  ON public.voice_logs FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── subscriptions ─────────────────────────────────────────────
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subscriptions: select own"
  ON public.subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT/UPDATE는 revenuecat-webhook Edge Function (서비스 롤)만 허용

-- ── calendar_integrations ─────────────────────────────────────
ALTER TABLE public.calendar_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "calendar_integrations: all own"
  ON public.calendar_integrations FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
