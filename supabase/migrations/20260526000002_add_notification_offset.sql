-- notification_offset_minutes: 일정별 알림 시점 (단위: 분)
-- NULL = 알림 없음
-- 0    = 시작 시 알림
-- N    = N분 전 알림 (양수만 허용)
-- 종일 일정의 경우: 당일 9AM = start 당일 00:00 기준 540분 후 (별도 계산)

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS notification_offset_minutes INTEGER
  CHECK (notification_offset_minutes IS NULL OR notification_offset_minutes >= 0);

-- 기존 이벤트는 NULL (알림 없음) 유지 — 앱에서 신규 생성 시 디폴트 적용
