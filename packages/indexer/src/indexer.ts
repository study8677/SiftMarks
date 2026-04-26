import { SiftMarksDB } from '@siftmarks/db';
import { type AIProvider } from '@siftmarks/ai';
import {
  generateId,
  normalizeTagName,
  nowISO,
  type Bookmark,
  type Tag,
} from '@siftmarks/shared';
import { createHash } from 'node:crypto';

export interface IndexOptions {
  limit?: number;
  onlyMissing?: boolean;
  useAI?: boolean;
  onProgress?: (done: number, total: number, bookmark: Bookmark) => void;
}

/**
 * Index bookmarks: generate summaries, tags, and embeddings.
 */
export async function indexBookmarks(
  db: SiftMarksDB,
  provider: AIProvider,
  options: IndexOptions = {}
): Promise<{ processed: number; summaries: number; tags: number; embeddings: number }> {
  const { limit = 100, onlyMissing = true, useAI = true, onProgress } = options;

  let bookmarks: Bookmark[];
  if (onlyMissing) {
    bookmarks = db.getBookmarksMissingSummary(limit);
  } else {
    const result = db.listBookmarks({ limit });
    bookmarks = result.items.filter((b) => b.status !== 'deleted');
  }

  let summaries = 0;
  let tagsGenerated = 0;
  let embeddings = 0;

  for (let i = 0; i < bookmarks.length; i++) {
    const bookmark = bookmarks[i]!;
    onProgress?.(i + 1, bookmarks.length, bookmark);

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
        const tagResult = await provider.generateTags(bookmark);
        for (const tagData of tagResult.tags) {
          const normalizedName = normalizeTagName(tagData.name);
          if (!normalizedName) continue;

          let tag = db.getTagByNormalizedName(normalizedName);
          if (!tag) {
            tag = {
              id: generateId(),
              name: tagData.name.toLowerCase(),
              normalizedName,
              createdAt: nowISO(),
            };
            db.insertTag(tag);
          }

          db.addBookmarkTag({
            bookmarkId: bookmark.id,
            tagId: tag.id,
            source: 'ai',
            confidence: tagData.confidence,
          });
          tagsGenerated++;
        }
      }

      // Generate embedding
      const existingEmb = db.getEmbedding(bookmark.id);
      const contentForEmb = [
        bookmark.title ?? '',
        bookmark.summary ?? '',
        bookmark.description ?? '',
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
      console.error(`Failed to index bookmark ${bookmark.id}: ${err}`);

      // Still index FTS without AI data
      const allTags = db.getBookmarkTags(bookmark.id).map((t) => t.name);
      db.indexBookmarkFTS(bookmark, allTags);
    }
  }

  return { processed: bookmarks.length, summaries, tags: tagsGenerated, embeddings };
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
