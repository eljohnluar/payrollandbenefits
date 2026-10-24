-- 008_announcements.sql — company announcements shown on the employee dashboard.
CREATE TABLE IF NOT EXISTS announcements (
  id          SERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL DEFAULT '',
  created_by  TEXT NOT NULL DEFAULT 'HR',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS announcements_created_at_idx ON announcements (created_at DESC);
