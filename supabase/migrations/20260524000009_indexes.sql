-- YuSay: 성능 인덱스

-- events 인덱스
CREATE INDEX idx_events_user_id    ON public.events(user_id);
CREATE INDEX idx_events_start_at   ON public.events(start_at);
CREATE INDEX idx_events_team_id    ON public.events(team_id) WHERE team_id IS NOT NULL;
CREATE INDEX idx_events_user_start ON public.events(user_id, start_at)
  WHERE deleted_at IS NULL;

-- 반복 일정 조회
CREATE INDEX idx_events_recurring  ON public.events(user_id, is_recurring)
  WHERE is_recurring = TRUE AND deleted_at IS NULL;

-- 외부 캘린더 연동 조회
CREATE INDEX idx_events_google_id  ON public.events(google_event_id)
  WHERE google_event_id IS NOT NULL;

-- 퍼지 검색용 trigram 인덱스 (pg_trgm 익스텐션 필요)
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- CREATE INDEX idx_events_title_trgm ON public.events USING gin(title gin_trgm_ops);
