-- monitors: the sites/endpoints being watched
CREATE TABLE IF NOT EXISTS monitors (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  url         TEXT    NOT NULL UNIQUE,
  interval    INTEGER NOT NULL DEFAULT 5,   -- check interval in minutes
  active      INTEGER NOT NULL DEFAULT 1,   -- 1 = enabled, 0 = paused
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- checks: every individual ping result
CREATE TABLE IF NOT EXISTS checks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  monitor_id   INTEGER NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  status       TEXT    NOT NULL CHECK (status IN ('up', 'down')),
  status_code  INTEGER,
  latency_ms   INTEGER,
  error        TEXT,
  checked_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_checks_monitor_id ON checks (monitor_id);
CREATE INDEX IF NOT EXISTS idx_checks_checked_at  ON checks (checked_at DESC);

-- seed a few example monitors
INSERT OR IGNORE INTO monitors (name, url) VALUES
  ('Cloudflare',  'https://www.cloudflare.com'),
  ('GitHub',      'https://github.com'),
  ('Hacker News', 'https://news.ycombinator.com');
