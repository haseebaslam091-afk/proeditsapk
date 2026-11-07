-- ProEditsAPK CMS: Cloudflare D1
-- Run with: npx wrangler d1 execute proeditsapk-db --remote --file=migrations/0001_initial_schema.sql

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  app_name TEXT NOT NULL DEFAULT '',
  path TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL,
  published INTEGER NOT NULL DEFAULT 1,
  official_icon_url TEXT,
  thumbnail_url TEXT,
  generated_thumbnail_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_posts_published_date
  ON posts (published, date DESC);

CREATE INDEX IF NOT EXISTS idx_posts_slug
  ON posts (slug);

CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO site_settings (key, value)
VALUES ('schema_version', '1');
