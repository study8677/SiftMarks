import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import type { CleanupStatus, CleanupType } from '@siftmarks/shared';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') as CleanupStatus | null;
  const type = searchParams.get('type') as CleanupType | null;
  const limit = parseInt(searchParams.get('limit') ?? '50');
  const offset = parseInt(searchParams.get('offset') ?? '0');

  const db = getDB();
  const result = db.listSuggestions({
    status: status ?? undefined,
    type: type ?? undefined,
    limit,
    offset,
  });

  // Enrich with bookmark info
  const items = result.items.map((s) => {
    const bookmark = s.bookmarkId ? db.getBookmarkById(s.bookmarkId) : null;
    return {
      ...s,
      bookmark: bookmark ? { title: bookmark.title, url: bookmark.url } : null,
    };
  });

  return NextResponse.json({ items, total: result.total });
}
