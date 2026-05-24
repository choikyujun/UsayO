-- YuSay: schedules 테이블 생성
-- Voice-First 캘린더 앱의 핵심 테이블

create table public.schedules (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  title         text not null,
  start_at      timestamptz not null,
  end_at        timestamptz,
  is_recurring  boolean not null default false,
  -- RFC 5545 RRULE 형식: 'FREQ=WEEKLY;BYDAY=MO' 등
  recurrence_rule text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- updated_at 자동 갱신 트리거
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger schedules_updated_at
  before update on public.schedules
  for each row execute function public.handle_updated_at();

-- 인덱스: user_id + start_at 조합 조회 (월간 캘린더, 일간 조회 등)
create index idx_schedules_user_start on public.schedules(user_id, start_at);

-- 인덱스: 반복 일정 조회용
create index idx_schedules_recurring on public.schedules(user_id, is_recurring) where is_recurring = true;
