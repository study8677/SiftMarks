import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { normalizeTagKey } from '@/lib/tags';
import type { BookmarkStatus } from '@siftmarks/shared';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') as BookmarkStatus | null;
  const folder = searchParams.get('folder');
  const tag = searchParams.get('tag');
  const limit = parseInt(searchParams.get('limit') ?? '50');
  const offset = parseInt(searchParams.get('offset') ?? '0');
  const isDuplicate = searchParams.get('isDuplicate');
  const chromeLinked = searchParams.get('chromeLinked');

  const db = getDB();
  const result = db.listBookmarks({
    status: status ?? undefined,
    folder: folder ?? undefined,
    tag: tag ? normalizeTagKey(tag) : undefined,
    limit,
    offset,
    isDuplicate: isDuplicate === 'true' ? true : isDuplicate === 'false' ? false : undefined,
    chromeLinked: chromeLinked === 'true' ? true : undefined,
    chromeUnlinked: chromeLinked === 'false' ? true : undefined,
  });

  // Enrich with tags
  const items = result.items.map((bookmark) => ({
    ...bookmark,
    tags: db.getBookmarkTags(bookmark.id).map((t) => t.name),
  }));

  return NextResponse.json({ items, total: result.total });
}
