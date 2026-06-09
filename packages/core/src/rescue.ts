import { SiftMarksDB } from '@siftmarks/db';
import {
  generateId,
  isLowValueFolderPath,
  isVagueTitle,
  MAX_BOOKMARK_TAGS,
  normalizeFolderPath,
  normalizeTagName,
  nowISO,
  type CleanupSuggestion,
  type CleanupType,
} from '@siftmarks/shared';
import type { AIProvider } from '@siftmarks/ai';
import { generateAIRescueSuggestions } from '@siftmarks/ai';

const CHROME_SYNC_TYPES = new Set<CleanupType>([
  'rename',
  'move',
  'delete_broken',
]);

/**
 * Generate cleanup suggestions — rule-based only.
 */
export function generateCleanupSuggestions(db: SiftMarksDB): CleanupSuggestion[] {
  const suggestions: CleanupSuggestion[] = [];
  const now = nowISO();

  db.clearPendingSuggestions();

  // 1. Vague title detection
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

  // 2. Broken link suggestions
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

  // Folder classification is AI-led. Rule-based rescue only handles
  // deterministic issues such as vague titles and broken links.

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
  const folders = db
    .listFolders()
    .map((folder) => folder.path)
    .filter((path) => !isLowValueFolderPath(path));
  const folderDepth = db.getSetting('folderDepth') === '2' ? 2 : 1;
  const rawTopLevelFolderLimit = Number(db.getSetting('topLevelFolderLimit'));
  const topLevelFolderLimit = Number.isFinite(rawTopLevelFolderLimit)
    ? Math.min(Math.max(Math.round(rawTopLevelFolderLimit), 3), 50)
    : 10;
  const existingTopLevelFolders = new Set(folders.map((folder) => folder.split('/')[0]).filter(Boolean));
  const plannedTopLevelFolders = new Set(existingTopLevelFolders);

  // Run AI analysis
  const aiSuggestions = await generateAIRescueSuggestions(
    provider,
    activeBookmarks,
    onProgress,
    { folders, folderDepth, topLevelFolderLimit }
  );

  // Convert AI suggestions to CleanupSuggestion and save
  const newSuggestions: CleanupSuggestion[] = [];

  for (const ai of aiSuggestions) {
    if (ai.type === 'move') {
      let folderPath = normalizeFolderPath(String(ai.after?.folderPath ?? ''));
      if (folderDepth === 1 && folderPath.includes('/')) continue;
      if (folderDepth === 2 && folderPath.split('/').filter(Boolean).length > 2) continue;
      if (!folderPath || isLowValueFolderPath(folderPath)) continue;
      const topLevel = folderPath.split('/')[0];
      if (topLevel && !plannedTopLevelFolders.has(topLevel)) {
        if (plannedTopLevelFolders.size >= topLevelFolderLimit) continue;
        plannedTopLevelFolders.add(topLevel);
      }
      ai.after = { ...ai.after, folderPath };
    }

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
        const seenTagKeys = new Set<string>();
        for (const tagName of tags) {
          if (seenTagKeys.size >= MAX_BOOKMARK_TAGS) break;
          const normalizedName = normalizeTagName(tagName);
          if (!normalizedName || seenTagKeys.has(normalizedName)) continue;
          seenTagKeys.add(normalizedName);

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
        const folderPath = normalizeFolderPath(after.folderPath);
        if (folderPath && !isLowValueFolderPath(folderPath)) {
          db.updateBookmark(suggestion.bookmarkId, { folderPath });
        }
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

export function revertSuggestion(
  db: SiftMarksDB,
  suggestionId: string,
  options: { includeSynced?: boolean } = {}
): boolean {
  const { items } = db.listSuggestions({ limit: 100000 });
  const suggestion = items.find((s) => s.id === suggestionId);
  const canRevertSynced = options.includeSynced === true;
  if (!suggestion || (suggestion.status !== 'accepted' && !(canRevertSynced && suggestion.status === 'synced'))) {
    return false;
  }
  if (!suggestion.bookmarkId) return false;

  const before = JSON.parse(suggestion.beforeJson);
  const after = JSON.parse(suggestion.afterJson);

  switch (suggestion.type) {
    case 'rename':
      if ('title' in before) {
        db.updateBookmark(suggestion.bookmarkId, { title: before.title ?? null });
      }
      break;

    case 'move': {
      const folderPath = normalizeFolderPath(String(before.folderPath ?? ''));
      db.updateBookmark(suggestion.bookmarkId, { folderPath: folderPath || null });
      break;
    }

    case 'delete_broken':
      db.updateBookmark(suggestion.bookmarkId, {
        status: 'broken' as any,
        httpStatus: typeof before.httpStatus === 'number' ? before.httpStatus : null,
      });
      break;

    case 'tag':
    case 'normalize_tag': {
      const currentTags = db.getBookmarkTags(suggestion.bookmarkId);
      const beforeTags: string[] = Array.isArray(before.tags)
        ? before.tags.map((tag: unknown) => String(tag ?? '').trim()).filter(Boolean)
        : [];
      const afterTags: string[] = Array.isArray(after.tags)
        ? after.tags.map((tag: unknown) => String(tag ?? '').trim()).filter(Boolean)
        : [];

      for (const tag of currentTags) {
        const normalized = normalizeTagName(tag.name);
        const shouldRemove = beforeTags.length > 0
          ? !beforeTags.some((name) => normalizeTagName(name) === normalized)
          : afterTags.some((name) => normalizeTagName(name) === normalized);
        if (shouldRemove) db.removeBookmarkTag(suggestion.bookmarkId, tag.id);
      }

      for (const name of beforeTags) {
        const normalizedName = normalizeTagName(name);
        if (!normalizedName) continue;

        let tag = db.getTagByNormalizedName(normalizedName);
        if (!tag) {
          tag = {
            id: generateId(),
            name,
            normalizedName,
            createdAt: nowISO(),
          };
          db.insertTag(tag);
        }

        db.addBookmarkTag({
          bookmarkId: suggestion.bookmarkId,
          tagId: tag.id,
          source: 'user',
          confidence: null,
        });
      }
      break;
    }

    default:
      return false;
  }

  db.updateSuggestionStatus(suggestionId, 'pending');
  return true;
}
