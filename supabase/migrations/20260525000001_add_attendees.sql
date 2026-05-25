-- YuSay: 참석자 필드 추가
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS attendees JSONB;
