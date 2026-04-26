import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { SCHEMA_SQL } from './schema.js';
import type {
  Bookmark,
  Tag,
  BookmarkTag,
  CleanupSuggestion,
  Folder,
  Embedding,
  AppSetting,
  BookmarkStats,
  BookmarkStatus,
  CleanupType,
  CleanupStatus,
} from '@siftmarks/shared';
import { generateId, nowISO } from '@siftmarks/shared';

export function getDataDir(): string {
  const envHome = process.env['SIFTMARKS_HOME'];
  if (envHome) return envHome;
  return join(homedir(), '.siftmarks');
}

export function getDbPath(): string {
  return join(getDataDir(), 'siftmarks.sqlite');
}

export class SiftMarksDB {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const path = dbPath ?? getDbPath();
    const dir = dirname(path);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
  }

  initialize(): void {
    this.db.exec(SCHEMA_SQL);
  }

  close(): void {
    this.db.close();
  }

  // --- Bookmarks ---

  insertBookmark(bookmark: Bookmark): void {
    this.db.prepare(`
      INSERT INTO bookmarks (
        id, url, normalized_url, title, original_title, description,
        content_text, summary, folder_path, favicon_url, status,
        http_status, is_duplicate, duplicate_group_id, created_at,
        imported_at, updated_at, last_checked_at, last_indexed_at, source,
        chrome_id, chrome_parent_id
      ) VALUES (
        @id, @url, @normalizedUrl, @title, @originalTitle, @description,
        @contentText, @summary, @folderPath, @faviconUrl, @status,
        @httpStatus, @isDuplicate, @duplicateGroupId, @createdAt,
        @importedAt, @updatedAt, @lastCheckedAt, @lastIndexedAt, @source,
        @chromeId, @chromeParentId
      )
    `).run({
      ...bookmark,
      isDuplicate: bookmark.isDuplicate ? 1 : 0,
    });
  }

  getBookmarkById(id: string): Bookmark | undefined {
    const row = this.db.prepare('SELECT * FROM bookmarks WHERE id = ?').get(id) as any;
    return row ? this.rowToBookmark(row) : undefined;
  }

  getBookmarkByNormalizedUrl(normalizedUrl: string): Bookmark | undefined {
    const row = this.db.prepare('SELECT * FROM bookmarks WHERE normalized_url = ? LIMIT 1').get(normalizedUrl) as any;
    return row ? this.rowToBookmark(row) : undefined;
  }

  listBookmarks(options: {
    limit?: number;
    offset?: number;
    status?: BookmarkStatus;
    folder?: string;
    tag?: string;
    isDuplicate?: boolean;
  } = {}): { items: Bookmark[]; total: number } {
    const { limit = 50, offset = 0, status, folder, tag, isDuplicate } = options;

    let where = 'WHERE 1=1';
    const params: any = {};

    if (status) {
      where += ' AND b.status = @status';
      params.status = status;
    }
    if (folder) {
      where += ' AND b.folder_path = @folder';
      params.folder = folder;
    }
    if (isDuplicate !== undefined) {
      where += ' AND b.is_duplicate = @isDuplicate';
      params.isDuplicate = isDuplicate ? 1 : 0;
    }

    let query: string;
    let countQuery: string;

    if (tag) {
      query = `
        SELECT b.* FROM bookmarks b
        JOIN bookmark_tags bt ON bt.bookmark_id = b.id
        JOIN tags t ON t.id = bt.tag_id
        ${where} AND t.normalized_name = @tag
        ORDER BY b.imported_at DESC
        LIMIT @limit OFFSET @offset
      `;
      countQuery = `
        SELECT COUNT(*) as count FROM bookmarks b
        JOIN bookmark_tags bt ON bt.bookmark_id = b.id
        JOIN tags t ON t.id = bt.tag_id
        ${where} AND t.normalized_name = @tag
      `;
      params.tag = tag;
    } else {
      query = `
        SELECT b.* FROM bookmarks b
        ${where}
        ORDER BY b.imported_at DESC
        LIMIT @limit OFFSET @offset
      `;
      countQuery = `
        SELECT COUNT(*) as count FROM bookmarks b
        ${where}
      `;
    }

    params.limit = limit;
    params.offset = offset;

    const rows = this.db.prepare(query).all(params) as any[];
    const countRow = this.db.prepare(countQuery).all(params)[0] as any;

    return {
      items: rows.map((r) => this.rowToBookmark(r)),
      total: countRow?.count ?? 0,
    };
  }

  updateBookmark(id: string, updates: Partial<Bookmark>): void {
    const fields: string[] = [];
    const params: any = { id };

    const fieldMap: Record<string, string> = {
      title: 'title',
      description: 'description',
      contentText: 'content_text',
      summary: 'summary',
      folderPath: 'folder_path',
      faviconUrl: 'favicon_url',
      status: 'status',
      httpStatus: 'http_status',
      isDuplicate: 'is_duplicate',
      duplicateGroupId: 'duplicate_group_id',
      lastCheckedAt: 'last_checked_at',
      lastIndexedAt: 'last_indexed_at',
      chromeId: 'chrome_id',
      chromeParentId: 'chrome_parent_id',
    };

    for (const [key, col] of Object.entries(fieldMap)) {
      if (key in updates) {
        fields.push(`${col} = @${key}`);
        const val = (updates as any)[key];
        params[key] = key === 'isDuplicate' ? (val ? 1 : 0) : val;
      }
    }

    if (fields.length === 0) return;

    fields.push('updated_at = @updatedAt');
    params.updatedAt = nowISO();

    this.db.prepare(`UPDATE bookmarks SET ${fields.join(', ')} WHERE id = @id`).run(params);
  }

  deleteBookmark(id: string): void {
    this.db.prepare('DELETE FROM bookmarks WHERE id = ?').run(id);
  }

  getBookmarksWithNormalizedUrl(normalizedUrl: string): Bookmark[] {
    const rows = this.db.prepare('SELECT * FROM bookmarks WHERE normalized_url = ?').all(normalizedUrl) as any[];
    return rows.map((r) => this.rowToBookmark(r));
  }

  getBookmarksMissingSummary(limit: number = 100): Bookmark[] {
    const rows = this.db.prepare(
      'SELECT * FROM bookmarks WHERE summary IS NULL AND status != ? LIMIT ?'
    ).all('deleted', limit) as any[];
    return rows.map((r) => this.rowToBookmark(r));
  }

  getBookmarksMissingTags(limit: number = 100): Bookmark[] {
    const rows = this.db.prepare(`
      SELECT b.* FROM bookmarks b
      LEFT JOIN bookmark_tags bt ON bt.bookmark_id = b.id
      WHERE bt.bookmark_id IS NULL AND b.status != ?
      LIMIT ?
    `).all('deleted', limit) as any[];
    return rows.map((r) => this.rowToBookmark(r));
  }

  getUncheckedBookmarks(limit: number = 100): Bookmark[] {
    const rows = this.db.prepare(
      'SELECT * FROM bookmarks WHERE status = ? LIMIT ?'
    ).all('unchecked', limit) as any[];
    return rows.map((r) => this.rowToBookmark(r));
  }

  // --- Tags ---

  insertTag(tag: Tag): void {
    this.db.prepare(`
      INSERT OR IGNORE INTO tags (id, name, normalized_name, created_at)
      VALUES (@id, @name, @normalizedName, @createdAt)
    `).run(tag);
  }

  getTagByNormalizedName(normalizedName: string): Tag | undefined {
    return this.db.prepare('SELECT * FROM tags WHERE normalized_name = ?').get(normalizedName) as Tag | undefined;
  }

  listTags(): Array<Tag & { count: number }> {
    return this.db.prepare(`
      SELECT t.*, COUNT(bt.bookmark_id) as count
      FROM tags t
      LEFT JOIN bookmark_tags bt ON bt.tag_id = t.id
      GROUP BY t.id
      ORDER BY count DESC
    `).all() as Array<Tag & { count: number }>;
  }

  // --- BookmarkTags ---

  addBookmarkTag(bookmarkTag: BookmarkTag): void {
    this.db.prepare(`
      INSERT OR IGNORE INTO bookmark_tags (bookmark_id, tag_id, source, confidence)
      VALUES (@bookmarkId, @tagId, @source, @confidence)
    `).run(bookmarkTag);
  }

  getBookmarkTags(bookmarkId: string): Array<Tag & { source: string; confidence: number | null }> {
    return this.db.prepare(`
      SELECT t.*, bt.source, bt.confidence
      FROM tags t
      JOIN bookmark_tags bt ON bt.tag_id = t.id
      WHERE bt.bookmark_id = ?
    `).all(bookmarkId) as any[];
  }

  removeBookmarkTag(bookmarkId: string, tagId: string): void {
    this.db.prepare('DELETE FROM bookmark_tags WHERE bookmark_id = ? AND tag_id = ?').run(bookmarkId, tagId);
  }

  // --- Folders ---

  insertFolder(folder: Folder): void {
    this.db.prepare(`
      INSERT OR IGNORE INTO folders (id, path, name, parent_path, created_at)
      VALUES (@id, @path, @name, @parentPath, @createdAt)
    `).run(folder);
  }

  listFolders(): Array<Folder & { count: number }> {
    return this.db.prepare(`
      SELECT f.*, COUNT(b.id) as count
      FROM folders f
      LEFT JOIN bookmarks b ON b.folder_path = f.path
      GROUP BY f.id
      ORDER BY f.path
    `).all() as any[];
  }

  // --- Cleanup Suggestions ---

  insertSuggestion(suggestion: CleanupSuggestion): void {
    this.db.prepare(`
      INSERT INTO cleanup_suggestions (
        id, type, status, bookmark_id, target_bookmark_id,
        before_json, after_json, reason, confidence, created_at, resolved_at
      ) VALUES (
        @id, @type, @status, @bookmarkId, @targetBookmarkId,
        @beforeJson, @afterJson, @reason, @confidence, @createdAt, @resolvedAt
      )
    `).run(suggestion);
  }

  listSuggestions(options: {
    status?: CleanupStatus;
    type?: CleanupType;
    limit?: number;
    offset?: number;
  } = {}): { items: CleanupSuggestion[]; total: number } {
    const { status, type, limit = 50, offset = 0 } = options;

    let where = 'WHERE 1=1';
    const params: any = {};

    if (status) {
      where += ' AND status = @status';
      params.status = status;
    }
    if (type) {
      where += ' AND type = @type';
      params.type = type;
    }

    params.limit = limit;
    params.offset = offset;

    const rows = this.db.prepare(`
      SELECT * FROM cleanup_suggestions ${where}
      ORDER BY confidence DESC, created_at DESC
      LIMIT @limit OFFSET @offset
    `).all(params) as any[];

    const countRow = this.db.prepare(`
      SELECT COUNT(*) as count FROM cleanup_suggestions ${where}
    `).all(params)[0] as any;

    return {
      items: rows.map((r) => this.rowToSuggestion(r)),
      total: countRow?.count ?? 0,
    };
  }

  updateSuggestionStatus(id: string, status: CleanupStatus): void {
    this.db.prepare(`
      UPDATE cleanup_suggestions SET status = ?, resolved_at = ? WHERE id = ?
    `).run(status, status !== 'pending' ? nowISO() : null, id);
  }

  dismissPendingSuggestionsForBookmarkType(bookmarkId: string, type: CleanupType, exceptId: string): void {
    this.db.prepare(`
      UPDATE cleanup_suggestions
      SET status = 'dismissed', resolved_at = ?
      WHERE bookmark_id = ? AND type = ? AND status = 'pending' AND id != ?
    `).run(nowISO(), bookmarkId, type, exceptId);
  }

  clearPendingSuggestions(): void {
    this.db.prepare("DELETE FROM cleanup_suggestions WHERE status = 'pending'").run();
  }

  clearPendingSuggestionsByType(type: CleanupType): void {
    this.db.prepare("DELETE FROM cleanup_suggestions WHERE status = 'pending' AND type = ?").run(type);
  }

  // --- Embeddings ---

  insertEmbedding(embedding: Embedding): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO embeddings (id, bookmark_id, model, vector_json, content_hash, created_at)
      VALUES (@id, @bookmarkId, @model, @vectorJson, @contentHash, @createdAt)
    `).run(embedding);
  }

  getEmbedding(bookmarkId: string): Embedding | undefined {
    return this.db.prepare('SELECT * FROM embeddings WHERE bookmark_id = ? LIMIT 1').get(bookmarkId) as Embedding | undefined;
  }

  getAllEmbeddings(): Embedding[] {
    return this.db.prepare('SELECT * FROM embeddings').all() as Embedding[];
  }

  // --- FTS ---

  indexBookmarkFTS(bookmark: Bookmark, tags: string[]): void {
    // Delete existing entry
    this.db.prepare('DELETE FROM bookmarks_fts WHERE bookmark_id = ?').run(bookmark.id);

    this.db.prepare(`
      INSERT INTO bookmarks_fts (bookmark_id, title, url, description, summary, content_text, tags, folder_path)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      bookmark.id,
      bookmark.title ?? '',
      bookmark.url,
      bookmark.description ?? '',
      bookmark.summary ?? '',
      bookmark.contentText ?? '',
      tags.join(' '),
      bookmark.folderPath ?? ''
    );
  }

  searchFTS(query: string, limit: number = 20): Array<{ bookmarkId: string; rank: number }> {
    // Escape FTS5 special chars and build query
    const sanitized = query.replace(/['"*()]/g, ' ').trim();
    if (!sanitized) return [];

    const terms = sanitized.split(/\s+/).filter(Boolean);
    const ftsQuery = terms.map((t) => `"${t}"`).join(' OR ');

    try {
      const rows = this.db.prepare(`
        SELECT bookmark_id, rank
        FROM bookmarks_fts
        WHERE bookmarks_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `).all(ftsQuery, limit) as any[];

      return rows.map((r) => ({
        bookmarkId: r.bookmark_id,
        rank: r.rank,
      }));
    } catch {
      return [];
    }
  }

  // --- Settings ---

  getSetting(key: string): string | undefined {
    const row = this.db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as any;
    return row?.value;
  }

  setSetting(key: string, value: string): void {
    this.db.prepare(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(key, value, nowISO());
  }

  // --- Stats ---

  getStats(): BookmarkStats {
    const bookmarks = (this.db.prepare("SELECT COUNT(*) as c FROM bookmarks WHERE status != 'deleted'").get() as any).c;
    const folders = (this.db.prepare('SELECT COUNT(*) as c FROM folders').get() as any).c;
    const tags = (this.db.prepare('SELECT COUNT(*) as c FROM tags').get() as any).c;
    const duplicates = (this.db.prepare('SELECT COUNT(*) as c FROM bookmarks WHERE is_duplicate = 1').get() as any).c;
    const broken = (this.db.prepare("SELECT COUNT(*) as c FROM bookmarks WHERE status = 'broken'").get() as any).c;
    const missingSummaries = (this.db.prepare("SELECT COUNT(*) as c FROM bookmarks WHERE summary IS NULL AND status != 'deleted'").get() as any).c;
    const missingTags = (this.db.prepare(`
      SELECT COUNT(*) as c FROM bookmarks b
      LEFT JOIN bookmark_tags bt ON bt.bookmark_id = b.id
      WHERE bt.bookmark_id IS NULL AND b.status != 'deleted'
    `).get() as any).c;

    return { bookmarks, folders, tags, duplicates, broken, missingSummaries, missingTags };
  }

  // --- Transaction helper ---

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  // --- Row mapping ---

  private rowToBookmark(row: any): Bookmark {
    return {
      id: row.id,
      url: row.url,
      normalizedUrl: row.normalized_url,
      title: row.title,
      originalTitle: row.original_title,
      description: row.description,
      contentText: row.content_text,
      summary: row.summary,
      folderPath: row.folder_path,
      faviconUrl: row.favicon_url,
      status: row.status,
      httpStatus: row.http_status,
      isDuplicate: row.is_duplicate === 1,
      duplicateGroupId: row.duplicate_group_id,
      createdAt: row.created_at,
      importedAt: row.imported_at,
      updatedAt: row.updated_at,
      lastCheckedAt: row.last_checked_at,
      lastIndexedAt: row.last_indexed_at,
      source: row.source,
      chromeId: row.chrome_id ?? null,
      chromeParentId: row.chrome_parent_id ?? null,
    };
  }

  // --- Chrome sync ---

  getAcceptedSuggestionsWithChromeIds(): Array<{
    suggestion: CleanupSuggestion;
    bookmark: Bookmark | undefined;
    targetBookmark: Bookmark | undefined;
  }> {
    const { items } = this.listSuggestions({ status: 'accepted', limit: 100000 });
    return items.map((s) => ({
      suggestion: s,
      bookmark: s.bookmarkId ? this.getBookmarkById(s.bookmarkId) : undefined,
      targetBookmark: s.targetBookmarkId ? this.getBookmarkById(s.targetBookmarkId) : undefined,
    }));
  }

  getBookmarkByChromeId(chromeId: string): Bookmark | undefined {
    const row = this.db.prepare('SELECT * FROM bookmarks WHERE chrome_id = ? LIMIT 1').get(chromeId) as any;
    return row ? this.rowToBookmark(row) : undefined;
  }

  markSuggestionSynced(id: string): void {
    this.db.prepare("UPDATE cleanup_suggestions SET status = 'synced' WHERE id = ?").run(id);
  }

  private rowToSuggestion(row: any): CleanupSuggestion {
    return {
      id: row.id,
      type: row.type,
      status: row.status,
      bookmarkId: row.bookmark_id,
      targetBookmarkId: row.target_bookmark_id,
      beforeJson: row.before_json,
      afterJson: row.after_json,
      reason: row.reason,
      confidence: row.confidence,
      createdAt: row.created_at,
      resolvedAt: row.resolved_at,
    };
  }
}
