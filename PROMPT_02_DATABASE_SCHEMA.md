# PROMPT 02 — Supabase 데이터베이스 스키마
> Claude Code에게 전달하는 YuSay DB 설계 프롬프트

---

당신은 Supabase + PostgreSQL 전문가입니다.
YuSay 앱의 전체 데이터베이스 스키마를 설계하고 migration 파일을 생성해주세요.

## 앱 개요
Voice-First 캘린더 앱. 개인 + 팀 일정 관리. 3티어 구독 (free/pro/team).

## 필요한 테이블 전체 목록

### 1. users (Supabase auth 확장)
```sql
-- auth.users를 확장하는 public.profiles
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  name TEXT,
  avatar_url TEXT,
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'team')),
  plan_expires_at TIMESTAMPTZ,
  trial_started_at TIMESTAMPTZ,
  preferred_language TEXT DEFAULT 'ko',
  tts_speed FLOAT DEFAULT 1.0,
  timezone TEXT DEFAULT 'Asia/Seoul',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2. events (핵심 일정 테이블)
```sql
CREATE TABLE public.events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  is_all_day BOOLEAN DEFAULT FALSE,
  location TEXT,
  color TEXT DEFAULT '#534AB7',
  category TEXT DEFAULT 'work' CHECK (category IN ('work', 'personal', 'important')),
  -- 반복 일정
  is_recurring BOOLEAN DEFAULT FALSE,
  recurrence_rule TEXT,  -- iCal RRULE 형식
  parent_event_id UUID REFERENCES public.events(id),
  -- 외부 캘린더 연동
  google_event_id TEXT,
  apple_event_id TEXT,
  -- 음성 생성 메타
  created_via TEXT DEFAULT 'manual' CHECK (created_via IN ('voice', 'manual', 'sync')),
  voice_transcript TEXT,  -- 원본 발화 텍스트
  -- 소프트 삭제
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3. teams (팀 플랜 전용)
```sql
CREATE TABLE public.teams (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id UUID REFERENCES public.profiles(id),
  plan TEXT DEFAULT 'team',
  plan_expires_at TIMESTAMPTZ,
  max_members INT DEFAULT 100,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.team_members (
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (team_id, user_id)
);
```

### 4. voice_logs (음성 사용 기록)
```sql
CREATE TABLE public.voice_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('create', 'update', 'delete', 'query')),
  intent_detected TEXT,
  confidence FLOAT,
  transcript TEXT,        -- STT 결과 (암호화 저장 후 처리)
  audio_deleted_at TIMESTAMPTZ,  -- 음성 파일 삭제 시각
  result_event_id UUID REFERENCES public.events(id),
  success BOOLEAN,
  error_code TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 5. user_quotas (사용량 추적)
```sql
CREATE TABLE public.user_quotas (
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  month TEXT NOT NULL,  -- 'YYYY-MM' 형식
  create_count INT DEFAULT 0,
  modify_count INT DEFAULT 0,
  query_count INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, month)
);
```

### 6. subscriptions (구독 정보)
```sql
CREATE TABLE public.subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan TEXT NOT NULL CHECK (plan IN ('free', 'pro', 'team')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'expired', 'trial')),
  revenuecat_customer_id TEXT,
  revenuecat_entitlement TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  trial_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  region TEXT,  -- 'KR', 'US', 'JP', 'SEA' 등
  price_local NUMERIC,
  currency TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 7. calendar_integrations (외부 캘린더 연동)
```sql
CREATE TABLE public.calendar_integrations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'apple', 'outlook')),
  access_token TEXT,      -- 암호화 저장
  refresh_token TEXT,     -- 암호화 저장
  token_expires_at TIMESTAMPTZ,
  calendar_id TEXT,
  sync_enabled BOOLEAN DEFAULT TRUE,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## RLS (Row Level Security) 정책
모든 테이블에 RLS를 활성화하고 다음 정책을 적용해주세요:

```sql
-- profiles: 본인만 조회·수정
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "본인 프로필 조회" ON public.profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "본인 프로필 수정" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- events: 본인 + 팀 멤버
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "본인 이벤트" ON public.events
  FOR ALL USING (
    auth.uid() = user_id OR
    team_id IN (
      SELECT team_id FROM public.team_members WHERE user_id = auth.uid()
    )
  );

-- user_quotas: 본인만
ALTER TABLE public.user_quotas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "본인 쿼터" ON public.user_quotas
  FOR ALL USING (auth.uid() = user_id);

-- voice_logs: 본인만 (개인정보)
ALTER TABLE public.voice_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "본인 음성 로그" ON public.voice_logs
  FOR ALL USING (auth.uid() = user_id);
```

## 인덱스
```sql
-- 자주 쿼리되는 컬럼에 인덱스 추가
CREATE INDEX idx_events_user_id ON public.events(user_id);
CREATE INDEX idx_events_start_at ON public.events(start_at);
CREATE INDEX idx_events_user_start ON public.events(user_id, start_at)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_voice_logs_user_month ON public.voice_logs(user_id, created_at);
CREATE INDEX idx_user_quotas_month ON public.user_quotas(user_id, month);
```

## Edge Functions (서버리스)
다음 Supabase Edge Functions도 작성해주세요:

1. `sync-google-calendar` — Google Calendar 양방향 동기화
2. `revenuecat-webhook` — RevenueCat 구독 상태 변경 처리
3. `delete-audio-data` — 음성 파일 즉시 삭제 (개인정보)
4. `reset-monthly-quota` — 매월 1일 사용량 리셋 (CRON)

migration 파일은 `supabase/migrations/` 폴더에 타임스탬프 파일명으로 생성해주세요.
TypeScript 타입도 `types/database.ts`로 자동 생성 명령어 포함해주세요.
