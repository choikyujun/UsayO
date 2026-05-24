-- YuSay: schedules 테이블 RLS 정책
-- 사용자는 자신의 일정만 접근 가능

alter table public.schedules enable row level security;

-- 본인 일정만 조회
create policy "schedules: select own"
  on public.schedules for select
  using (auth.uid() = user_id);

-- 본인 계정으로만 생성 (user_id 위조 방지)
create policy "schedules: insert own"
  on public.schedules for insert
  with check (auth.uid() = user_id);

-- 본인 일정만 수정
create policy "schedules: update own"
  on public.schedules for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 본인 일정만 삭제
create policy "schedules: delete own"
  on public.schedules for delete
  using (auth.uid() = user_id);
