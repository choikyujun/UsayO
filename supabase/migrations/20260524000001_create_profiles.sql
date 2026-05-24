-- YuSay: auth.users 확장 프로필 테이블
-- 회원가입/익명 로그인 시 자동 생성됨

CREATE TABLE public.profiles (
  id               UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name             TEXT,
  avatar_url       TEXT,
  plan             TEXT NOT NULL DEFAULT 'free'
                     CHECK (plan IN ('free', 'pro', 'team')),
  plan_expires_at  TIMESTAMPTZ,
  trial_started_at TIMESTAMPTZ,
  preferred_language TEXT NOT NULL DEFAULT 'ko',
  tts_speed        FLOAT NOT NULL DEFAULT 1.0,
  timezone         TEXT NOT NULL DEFAULT 'Asia/Seoul',
  onboarding_done  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- updated_at 자동 갱신 (schedules와 동일 함수 재사용)
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- auth.users INSERT 시 자동 프로필 생성
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
