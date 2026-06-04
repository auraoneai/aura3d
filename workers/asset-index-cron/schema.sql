-- Aura3D asset-index D1 schema.
-- Replaces the single-JSON index (which breaks past ~30-50k) with a queryable
-- store that scales to hundreds of thousands of rows.

CREATE TABLE IF NOT EXISTS assets (
  id                       TEXT PRIMARY KEY,
  source                   TEXT NOT NULL,
  title                    TEXT NOT NULL,
  url                      TEXT NOT NULL,
  access                   TEXT NOT NULL,           -- 'direct-download' | 'deep-link-only'
  format                   TEXT NOT NULL,           -- 'glb' | 'gltf'
  license_spdx             TEXT NOT NULL,
  license_verified         INTEGER NOT NULL,        -- 0 | 1
  license_redistributable  INTEGER NOT NULL,        -- 0 | 1
  attribution_required     INTEGER NOT NULL,        -- 0 | 1
  triangles                INTEGER,
  has_animations           INTEGER,                 -- 0 | 1 | NULL
  thumbnail_url            TEXT,
  source_page              TEXT,
  attribution              TEXT,
  tags                     TEXT,                    -- space-joined, for fallback LIKE
  updated_at               TEXT
);

CREATE INDEX IF NOT EXISTS idx_assets_source ON assets(source);
-- Fast "auto-pullable only" filter (the common constraint).
CREATE INDEX IF NOT EXISTS idx_assets_pullable
  ON assets(access, license_verified, license_redistributable);

-- FTS5 over title + tags for fast relevance search at scale. Kept in sync by the
-- writer (insert into both tables) or rebuilt after a bulk load.
CREATE VIRTUAL TABLE IF NOT EXISTS assets_fts USING fts5(
  id UNINDEXED,
  text
);

-- Per-source crawl cursors / watermarks (e.g. Sketchfab cursor to resume).
CREATE TABLE IF NOT EXISTS watermarks (
  source     TEXT PRIMARY KEY,
  cursor     TEXT,
  updated_at TEXT
);
