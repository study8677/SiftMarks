import type { SiftMarksDB } from '@siftmarks/db';

export interface ChromeOp {
  id: string;
  action: 'update' | 'remove' | 'move' | 'create';
  chromeId?: string;
  bookmarkId?: string;
  bookmarkTitle?: string | null;
  bookmarkUrl?: string;
  title?: string;
  url?: string;
  folderPath?: string;
}

export interface ChromeSyncPlan {
  ops: ChromeOp[];
  skipped: number;
}

export function getChromeSyncPlan(db: SiftMarksDB): ChromeSyncPlan {
  const items = db
    .getAcceptedSuggestionsWithChromeIds()
    .sort((a, b) => a.suggestion.createdAt.localeCompare(b.suggestion.createdAt));
  const opsByKey = new Map<string, ChromeOp>();
  let skipped = 0;

  for (const { suggestion, bookmark } of items) {
    if (!bookmark?.chromeId) {
      skipped++;
      continue;
    }

    const after = JSON.parse(suggestion.afterJson);

    switch (suggestion.type) {
      case 'rename':
        if (after.title) {
          opsByKey.set(`update:${bookmark.chromeId}`, {
            id: suggestion.id,
            action: 'update',
            chromeId: bookmark.chromeId,
            bookmarkTitle: bookmark.title,
            bookmarkUrl: bookmark.url,
            title: after.title,
          });
        }
        break;

      case 'delete_broken':
        opsByKey.set(`remove:${bookmark.chromeId}`, {
          id: suggestion.id,
          action: 'remove',
          chromeId: bookmark.chromeId,
          bookmarkTitle: bookmark.title,
          bookmarkUrl: bookmark.url,
        });
        break;

      case 'move':
        if (after.folderPath) {
          opsByKey.set(`move:${bookmark.chromeId}`, {
            id: suggestion.id,
            action: 'move',
            chromeId: bookmark.chromeId,
            bookmarkTitle: bookmark.title,
            bookmarkUrl: bookmark.url,
            folderPath: after.folderPath,
          });
        }
        break;

      default:
        skipped++;
        break;
    }
  }

  const localOnlyBookmarks = db.listBookmarks({
    limit: 100000,
    chromeUnlinked: true,
  }).items;

  for (const bookmark of localOnlyBookmarks) {
    if (!bookmark.folderPath || !bookmark.url || bookmark.status === 'deleted') continue;

    opsByKey.set(`create:${bookmark.id}`, {
      id: `create:${bookmark.id}`,
      action: 'create',
      bookmarkId: bookmark.id,
      bookmarkTitle: bookmark.title,
      bookmarkUrl: bookmark.url,
      title: bookmark.title ?? undefined,
      url: bookmark.url,
      folderPath: bookmark.folderPath,
    });
  }

  return { ops: Array.from(opsByKey.values()), skipped };
}
