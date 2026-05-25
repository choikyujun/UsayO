-- Device → user mapping for persistent anonymous auth
-- Client access intentionally disallowed (Service Role only via Edge Function)

CREATE TABLE IF NOT EXISTS device_user_mapping (
  device_id  TEXT        PRIMARY KEY,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_device_user_mapping_user_id
  ON device_user_mapping(user_id);

ALTER TABLE device_user_mapping ENABLE ROW LEVEL SECURITY;
-- No client-facing RLS policies — all access via service role (Edge Function)
