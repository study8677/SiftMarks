export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS bookmarks (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  normalized_url TEXT NOT NULL,
  title TEXT,
  original_title TEXT,
  description TEXT,
  content_text TEXT,
  summary TEXT,
  folder_path TEXT,
  favicon_url TEXT,
  status TEXT NOT NULL DEFAULT 'unchecked',
  http_status INTEGER,
  is_duplicate INTEGER NOT NULL DEFAULT 0,
  duplicate_group_id TEXT,
  created_at TEXT,
  imported_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_checked_at TEXT,
  last_indexed_at TEXT,
  source TEXT NOT NULL DEFAULT 'import',
  chrome_id TEXT,
  chrome_parent_id TEXT
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  normalized_name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bookmark_tags (
  bookmark_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'ai',
  confidence REAL,
  PRIMARY KEY (bookmark_id, tag_id),
  FOREIGN KEY (bookmark_id) REFERENCES bookmarks(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS cleanup_suggestions (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  bookmark_id TEXT,
  target_bookmark_id TEXT,
  before_json TEXT NOT NULL,
  after_json TEXT NOT NULL,
  reason TEXT,
  confidence REAL,
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  FOREIGN KEY (bookmark_id) REFERENCES bookmarks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  parent_path TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS embeddings (
  id TEXT PRIMARY KEY,
  bookmark_id TEXT NOT NULL,
  model TEXT NOT NULL,
  vector_json TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (bookmark_id) REFERENCES bookmarks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bookmarks_normalized_url ON bookmarks(normalized_url);
CREATE INDEX IF NOT EXISTS idx_bookmarks_status ON bookmarks(status);
CREATE INDEX IF NOT EXISTS idx_bookmarks_folder_path ON bookmarks(folder_path);
CREATE INDEX IF NOT EXISTS idx_bookmarks_is_duplicate ON bookmarks(is_duplicate);
CREATE INDEX IF NOT EXISTS idx_bookmarks_duplicate_group_id ON bookmarks(duplicate_group_id);
CREATE INDEX IF NOT EXISTS idx_bookmark_tags_bookmark_id ON bookmark_tags(bookmark_id);
CREATE INDEX IF NOT EXISTS idx_bookmark_tags_tag_id ON bookmark_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_cleanup_suggestions_status ON cleanup_suggestions(status);
CREATE INDEX IF NOT EXISTS idx_cleanup_suggestions_type ON cleanup_suggestions(type);
CREATE INDEX IF NOT EXISTS idx_embeddings_bookmark_id ON embeddings(bookmark_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_chrome_id ON bookmarks(chrome_id);

-- FTS5 virtual table for full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS bookmarks_fts USING fts5(
  bookmark_id,
  title,
  url,
  description,
  summary,
  content_text,
  tags,
  folder_path,
  tokenize='porter unicode61'
);
`;
