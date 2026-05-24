-- YuSay: 팀 플랜 관련 테이블 (Phase 3)

CREATE TABLE public.teams (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  owner_id        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  plan            TEXT NOT NULL DEFAULT 'team',
  plan_expires_at TIMESTAMPTZ,
  max_members     INT NOT NULL DEFAULT 100,
  settings        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.team_members (
  team_id   UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id   UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  role      TEXT NOT NULL DEFAULT 'member'
              CHECK (role IN ('owner', 'admin', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (team_id, user_id)
);

CREATE INDEX idx_team_members_user ON public.team_members(user_id);
