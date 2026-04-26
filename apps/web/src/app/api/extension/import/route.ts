import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { importBookmarks } from '@siftmarks/core';
import { rebuildFTSIndex } from '@siftmarks/indexer';
import type { ParsedBookmark } from '@siftmarks/shared';

export async function POST(request: Request) {
  const body = await request.json();
  const bookmarks: ParsedBookmark[] = body.bookmarks;

  if (!bookmarks || !Array.isArray(bookmarks) || bookmarks.length === 0) {
    return NextResponse.json({ error: 'No bookmarks provided' }, { status: 400 });
  }

  // Filter out invalid entries
  const valid = bookmarks.filter((b) => b.url && typeof b.url === 'string' && b.url.length > 0);

  const db = getDB();
  const result = importBookmarks(valid, db);
  rebuildFTSIndex(db);

  return NextResponse.json(result);
}
