import { SiftMarksDB } from '@siftmarks/db';
import {
  generateId,
  normalizeUrl,
  nowISO,
  type CleanupSuggestion,
} from '@siftmarks/shared';

/**
 * Scan for duplicate bookmarks based on normalized URLs.
 * Returns cleanup suggestions for merging duplicates.
 */
export function detectDuplicates(db: SiftMarksDB): CleanupSuggestion[] {
  const { items: allBookmarks } = db.listBookmarks({ limit: 100000 });
  const urlGroups = new Map<string, typeof allBookmarks>();
  const suggestions: CleanupSuggestion[] = [];

  // Group bookmarks by normalized URL
  for (const bookmark of allBookmarks) {
    const normalized = normalizeUrl(bookmark.url);
    const group = urlGroups.get(normalized) ?? [];
    group.push(bookmark);
    urlGroups.set(normalized, group);
  }

  const now = nowISO();

  for (const [, group] of urlGroups) {
    if (group.length < 2) continue;

    // Sort by createdAt — keep oldest
    group.sort((a, b) => {
      const aDate = a.createdAt ?? a.importedAt;
      const bDate = b.createdAt ?? b.importedAt;
      return aDate.localeCompare(bDate);
    });

    const keep = group[0]!;
    const groupId = generateId();

    // Mark all as duplicate
    for (const bm of group) {
      db.updateBookmark(bm.id, {
        isDuplicate: true,
        duplicateGroupId: groupId,
      });
    }

    // Create merge suggestions for duplicates (skip the one we keep)
    for (let i = 1; i < group.length; i++) {
      const dup = group[i]!;
      suggestions.push({
        id: generateId(),
        type: 'merge_duplicate',
        status: 'pending',
        bookmarkId: dup.id,
        targetBookmarkId: keep.id,
        beforeJson: JSON.stringify({
          id: dup.id,
          url: dup.url,
          title: dup.title,
          folderPath: dup.folderPath,
        }),
        afterJson: JSON.stringify({
          action: 'merge_into',
          targetId: keep.id,
          targetUrl: keep.url,
          targetTitle: keep.title,
        }),
        reason: `Duplicate of "${keep.title ?? keep.url}" — same URL after normalization`,
        confidence: 0.95,
        createdAt: now,
        resolvedAt: null,
      });
    }
  }

  return suggestions;
}
