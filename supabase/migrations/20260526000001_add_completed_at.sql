-- events 테이블에 completed_at 컬럼 추가 (완료 처리용 소프트 플래그)
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS completed_at timestamptz DEFAULT NULL;
