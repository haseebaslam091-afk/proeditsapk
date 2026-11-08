CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  path TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL,
  published INTEGER NOT NULL DEFAULT 1,
  app_name TEXT,
  official_icon_url TEXT,
  thumbnail_url TEXT,
  generated_thumbnail_url TEXT,
  raw_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_posts_published_date ON posts(published, date DESC);
CREATE INDEX IF NOT EXISTS idx_posts_slug ON posts(slug);
