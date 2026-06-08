import { SiftMarksDB } from '@siftmarks/db';
import { type AIProvider } from '@siftmarks/ai';
import { fetchPageMetadata } from '@siftmarks/core';
import {
  generateId,
  MAX_BOOKMARK_TAGS,
  normalizeTagName,
  nowISO,
  type Bookmark,
  type BookmarkStatus,
  type LinkCheckStatus,
} from '@siftmarks/shared';
import { createHash } from 'node:crypto';

export interface IndexOptions {
  limit?: number;
  onlyMissing?: boolean;
  useAI?: boolean;
  fetchContent?: boolean;
  fetchTimeout?: number;
  onProgress?: (done: number, total: number, bookmark: Bookmark) => void;
}

export interface IndexResult {
  processed: number;
  fetched: number;
  summaries: number;
  tags: number;
  embeddings: number;
  linkFailures: number;
  errors: number;
  firstError: string | null;
}

/**
 * Index bookmarks: generate summaries, tags, and embeddings.
 */
export async function indexBookmarks(
  db: SiftMarksDB,
  provider: AIProvider,
  options: IndexOptions = {}
): Promise<IndexResult> {
  const {
    limit = 100,
    onlyMissing = true,
    useAI = true,
    fetchContent = true,
    fetchTimeout = 10000,
    onProgress,
  } = options;

  let bookmarks: Bookmark[];
  if (onlyMissing) {
    bookmarks = db.getBookmarksNeedingAnalysis(limit);
  } else {
    const result = db.listBookmarks({ limit });
    bookmarks = result.items.filter((b) => b.status !== 'deleted');
  }

  let fetched = 0;
  let summaries = 0;
  let tagsGenerated = 0;
  let embeddings = 0;
  let linkFailures = 0;
  let errors = 0;
  let firstError: string | null = null;
  const knownTagNames = Array.from(new Set(db.listTags().map((tag) => tag.name).filter(Boolean)));

  for (let i = 0; i < bookmarks.length; i++) {
    let bookmark = bookmarks[i]!;
    onProgress?.(i + 1, bookmarks.length, bookmark);

    if (fetchContent && !bookmark.contentText) {
      const metadata = await fetchPageMetadata(bookmark.url, fetchTimeout);
      const status = toBookmarkStatus(metadata.status);

      if (status === 'broken') linkFailures++;

      db.updateBookmark(bookmark.id, {
        title: bookmark.title || metadata.title || bookmark.title,
        description: metadata.description ?? bookmark.description,
        contentText: metadata.contentText ?? bookmark.contentText,
        status,
        httpStatus: metadata.httpStatus,
        lastCheckedAt: nowISO(),
      });

      bookmark = db.getBookmarkById(bookmark.id) ?? bookmark;
      if (metadata.contentText) fetched++;
    }

    if (!useAI || provider.name === 'mock') {
      // Just index FTS without AI
      const existingTags = db.getBookmarkTags(bookmark.id).map((t) => t.name);
      db.indexBookmarkFTS(bookmark, existingTags);
      continue;
    }

    try {
      // Generate summary
      if (!bookmark.summary) {
        const summaryResult = await provider.summarizeBookmark(bookmark);
        db.updateBookmark(bookmark.id, {
          summary: summaryResult.summary,
          description: bookmark.description ?? summaryResult.shortSummary,
        });
        bookmark.summary = summaryResult.summary;
        summaries++;
      }

      // Generate tags
      const existingTags = db.getBookmarkTags(bookmark.id);
      if (existingTags.length === 0) {
        const tagResult = await provider.generateTags(bookmark, {
          existingTags: knownTagNames,
          maxTags: MAX_BOOKMARK_TAGS,
        });
        const seenTagKeys = new Set<string>();
        const knownTagKeys = new Set(knownTagNames.map((tag) => normalizeTagName(tag)).filter(Boolean));
        const orderedTags = [...tagResult.tags].sort((a, b) => {
          const aKnown = knownTagKeys.has(normalizeTagName(a.name));
          const bKnown = knownTagKeys.has(normalizeTagName(b.name));
          return Number(bKnown) - Number(aKnown);
        });

        for (const aiTag of orderedTags) {
          if (seenTagKeys.size >= MAX_BOOKMARK_TAGS) break;
          const normalizedName = normalizeTagName(aiTag.name);
          if (!normalizedName || seenTagKeys.has(normalizedName)) continue;
          seenTagKeys.add(normalizedName);

          let tag = db.getTagByNormalizedName(normalizedName);
          if (!tag) {
            tag = {
              id: generateId(),
              name: aiTag.name.toLowerCase(),
              normalizedName,
              createdAt: nowISO(),
            };
            db.insertTag(tag);
            knownTagNames.push(tag.name);
            knownTagKeys.add(normalizedName);
          }

          const added = db.addBookmarkTag({
            bookmarkId: bookmark.id,
            tagId: tag.id,
            source: 'ai',
            confidence: aiTag.confidence,
          });
          if (added) tagsGenerated++;
        }
      }

      // Generate embedding
      const existingEmb = db.getEmbedding(bookmark.id);
      const contentForEmb = [
        bookmark.title ?? '',
        bookmark.summary ?? '',
        bookmark.description ?? '',
        bookmark.contentText?.slice(0, 4000) ?? '',
        bookmark.folderPath ?? '',
      ].join(' ').trim();

      const contentHash = createHash('md5').update(contentForEmb).digest('hex');

      if (!existingEmb || existingEmb.contentHash !== contentHash) {
        const vector = await provider.generateEmbedding(contentForEmb);
        if (vector.length > 0) {
          db.insertEmbedding({
            id: generateId(),
            bookmarkId: bookmark.id,
            model: provider.name,
            vectorJson: JSON.stringify(vector),
            contentHash,
            createdAt: nowISO(),
          });
          embeddings++;
        }
      }

      // Update FTS index
      const allTags = db.getBookmarkTags(bookmark.id).map((t) => t.name);
      db.indexBookmarkFTS(bookmark, allTags);

      db.updateBookmark(bookmark.id, { lastIndexedAt: nowISO() });
    } catch (err) {
      // AI failure should not block other bookmarks
      const message = err instanceof Error ? err.message : String(err);
      errors++;
      if (!firstError) firstError = message;
      console.error(`Failed to index bookmark ${bookmark.id}: ${message}`);

      // Still index FTS without AI data
      const allTags = db.getBookmarkTags(bookmark.id).map((t) => t.name);
      db.indexBookmarkFTS(bookmark, allTags);
    }
  }

  return {
    processed: bookmarks.length,
    fetched,
    summaries,
    tags: tagsGenerated,
    embeddings,
    linkFailures,
    errors,
    firstError,
  };
}

/**
 * Rebuild FTS index for all bookmarks.
 */
export function rebuildFTSIndex(db: SiftMarksDB): number {
  const { items: bookmarks } = db.listBookmarks({ limit: 100000 });
  let indexed = 0;

  for (const bookmark of bookmarks) {
    if (bookmark.status === 'deleted') continue;
    const tags = db.getBookmarkTags(bookmark.id).map((t) => t.name);
    db.indexBookmarkFTS(bookmark, tags);
    indexed++;
  }

  return indexed;
}

function toBookmarkStatus(status: LinkCheckStatus): BookmarkStatus {
  if (status === 'ok') return 'ok';
  if (status === 'redirected') return 'redirected';
  if (status === 'dns_error') return 'broken';
  return 'unchecked';
}
