import type { SiftMarksDB } from '@siftmarks/db';

export function refreshBookmarksFTS(db: SiftMarksDB, bookmarkIds: string[]): number {
  const uniqueIds = Array.from(new Set(bookmarkIds));
  let refreshed = 0;

  for (const id of uniqueIds) {
    const bookmark = db.getBookmarkById(id);
    if (!bookmark) continue;

    const tags = db.getBookmarkTags(id).map((tag) => tag.name);
    db.indexBookmarkFTS(bookmark, tags);
    refreshed += 1;
  }

  return refreshed;
}
