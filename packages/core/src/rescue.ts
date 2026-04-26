import { SiftMarksDB } from '@siftmarks/db';
import {
  generateId,
  isVagueTitle,
  normalizeTagName,
  nowISO,
  type CleanupSuggestion,
  type CleanupType,
} from '@siftmarks/shared';
import { detectDuplicates } from './duplicates.js';
import type { AIProvider } from '@siftmarks/ai';
import { generateAIRescueSuggestions } from '@siftmarks/ai';

const CHROME_SYNC_TYPES = new Set<CleanupType>([
  'rename',
  'move',
  'merge_duplicate',
  'delete_broken',
]);

/**
 * Generate cleanup suggestions — rule-based only.
 */
export function generateCleanupSuggestions(db: SiftMarksDB): CleanupSuggestion[] {
  const suggestions: CleanupSuggestion[] = [];
  const now = nowISO();

  db.clearPendingSuggestions();

  // 1. Duplicate detection
  const dupSuggestions = detectDuplicates(db);
  suggestions.push(...dupSuggestions);

  // 2. Vague title detection
  const { items: allBookmarks } = db.listBookmarks({ limit: 100000 });
  for (const bookmark of allBookmarks) {
    if (bookmark.status === 'deleted') continue;

    if (isVagueTitle(bookmark.title)) {
      const betterTitle = bookmark.description
        ? bookmark.description.slice(0, 100)
        : null;

      if (betterTitle) {
        suggestions.push({
          id: generateId(),
          type: 'rename',
          status: 'pending',
          bookmarkId: bookmark.id,
          targetBookmarkId: null,
          beforeJson: JSON.stringify({ title: bookmark.title }),
          afterJson: JSON.stringify({ title: betterTitle }),
          reason: `Title "${bookmark.title ?? '(empty)'}" is too vague.`,
          confidence: 0.7,
          createdAt: now,
          resolvedAt: null,
        });
      }
    }
  }

  // 3. Broken link suggestions
  for (const bookmark of allBookmarks.filter((b) => b.status === 'broken')) {
    suggestions.push({
      id: generateId(),
      type: 'delete_broken',
      status: 'pending',
      bookmarkId: bookmark.id,
      targetBookmarkId: null,
      beforeJson: JSON.stringify({ url: bookmark.url, title: bookmark.title, httpStatus: bookmark.httpStatus }),
      afterJson: JSON.stringify({ action: 'delete' }),
      reason: `Link is broken (HTTP ${bookmark.httpStatus ?? 'unreachable'})`,
      confidence: 0.85,
      createdAt: now,
      resolvedAt: null,
    });
  }

  db.transaction(() => {
    for (const suggestion of suggestions) {
      db.insertSuggestion(suggestion);
    }
  });

  return suggestions;
}

function dedupeCleanupSuggestions(suggestions: CleanupSuggestion[]): CleanupSuggestion[] {
  const best = new Map<string, CleanupSuggestion>();

  for (const suggestion of suggestions) {
    const key = `${suggestion.bookmarkId ?? ''}:${suggestion.type}`;
    const existing = best.get(key);
    if (!existing || (suggestion.confidence ?? 0) > (existing.confidence ?? 0)) {
      best.set(key, suggestion);
    }
  }

  return Array.from(best.values());
}

/**
 * Generate cleanup suggestions using LLM — smart rename, tagging, folder suggestions.
 */
export async function generateAICleanupSuggestions(
  db: SiftMarksDB,
  provider: AIProvider,
  onProgress?: (done: number, total: number) => void
): Promise<CleanupSuggestion[]> {
  const now = nowISO();

  // First run rule-based
  const ruleSuggestions = generateCleanupSuggestions(db);

  // If provider is mock, skip AI
  if (provider.name === 'mock') return ruleSuggestions;

  // Get all bookmarks for AI analysis
  const { items: allBookmarks } = db.listBookmarks({ limit: 100000 });
  const activeBookmarks = allBookmarks.filter((b) => b.status !== 'deleted');

  // Run AI analysis
  const aiSuggestions = await generateAIRescueSuggestions(
    provider,
    activeBookmarks,
    onProgress
  );

  // Convert AI suggestions to CleanupSuggestion and save
  const newSuggestions: CleanupSuggestion[] = [];

  for (const ai of aiSuggestions) {
    const suggestion: CleanupSuggestion = {
      id: generateId(),
      type: ai.type,
      status: 'pending',
      bookmarkId: ai.bookmarkId,
      targetBookmarkId: null,
      beforeJson: JSON.stringify(ai.before),
      afterJson: JSON.stringify(ai.after),
      reason: `[AI] ${ai.reason}`,
      confidence: ai.confidence,
      createdAt: now,
      resolvedAt: null,
    };
    newSuggestions.push(suggestion);
  }

  const dedupedNewSuggestions = dedupeCleanupSuggestions(newSuggestions);

  db.transaction(() => {
    for (const suggestion of dedupedNewSuggestions) {
      db.insertSuggestion(suggestion);
    }
  });

  return [...ruleSuggestions, ...dedupedNewSuggestions];
}

/**
 * Apply a single accepted suggestion.
 */
export function applySuggestion(db: SiftMarksDB, suggestionId: string): boolean {
  const { items } = db.listSuggestions({ limit: 100000 });
  const suggestion = items.find((s) => s.id === suggestionId);
  if (!suggestion || suggestion.status !== 'pending') return false;

  const after = JSON.parse(suggestion.afterJson);

  switch (suggestion.type) {
    case 'rename':
      if (suggestion.bookmarkId && after.title) {
        db.updateBookmark(suggestion.bookmarkId, { title: after.title });
      }
      break;

    case 'merge_duplicate':
      if (suggestion.bookmarkId) {
        db.updateBookmark(suggestion.bookmarkId, { status: 'deleted' as any });
      }
      break;

    case 'delete_broken':
      if (suggestion.bookmarkId) {
        db.updateBookmark(suggestion.bookmarkId, { status: 'deleted' as any });
      }
      break;

    case 'tag':
      if (suggestion.bookmarkId && after.tags) {
        const tags: string[] = after.tags;
        for (const tagName of tags) {
          const normalizedName = normalizeTagName(tagName);
          if (!normalizedName) continue;

          let tag = db.getTagByNormalizedName(normalizedName);
          if (!tag) {
            tag = {
              id: generateId(),
              name: tagName.toLowerCase(),
              normalizedName,
              createdAt: nowISO(),
            };
            db.insertTag(tag);
          }

          db.addBookmarkTag({
            bookmarkId: suggestion.bookmarkId,
            tagId: tag.id,
            source: 'ai',
            confidence: suggestion.confidence,
          });
        }
      }
      break;

    case 'move':
      if (suggestion.bookmarkId && after.folderPath) {
        db.updateBookmark(suggestion.bookmarkId, { folderPath: after.folderPath });
      }
      break;

    default:
      break;
  }

  if (suggestion.bookmarkId) {
    db.dismissPendingSuggestionsForBookmarkType(
      suggestion.bookmarkId,
      suggestion.type,
      suggestion.id
    );
  }

  const bookmark = suggestion.bookmarkId
    ? db.getBookmarkById(suggestion.bookmarkId)
    : undefined;
  const needsChromeSync =
    CHROME_SYNC_TYPES.has(suggestion.type) &&
    Boolean(bookmark?.chromeId);

  db.updateSuggestionStatus(suggestionId, needsChromeSync ? 'accepted' : 'synced');
  return true;
}
