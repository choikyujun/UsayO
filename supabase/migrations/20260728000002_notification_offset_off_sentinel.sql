-- YuSay: 알림 오프셋 "명시적 끄기" sentinel 지원
--
-- notification_offset_minutes 3-상태:
--   NULL        = 미설정 → 앱 설정 기본값(10/60분)  (기존 데이터 해석 불변)
--   -1          = 명시적 "알림 없음" (예약 안 함)     ← 이번에 추가
--   >= 0        = per-event 오프셋(분)
--
-- 기존 CHECK가 (NULL OR >= 0)이라 -1을 거부 → 완화. 기존 NULL/양수 행은 그대로 유효.
-- 실행: Supabase 대시보드 SQL Editor.

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_notification_offset_minutes_check;

ALTER TABLE public.events
  ADD CONSTRAINT events_notification_offset_minutes_check
  CHECK (notification_offset_minutes IS NULL OR notification_offset_minutes >= -1);
