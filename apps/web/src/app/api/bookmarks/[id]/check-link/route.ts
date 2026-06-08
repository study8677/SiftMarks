import { NextResponse } from 'next/server';
import { fetchPageMetadata } from '@siftmarks/core';
import { getDB } from '@/lib/db';
import type { LinkCheckStatus, BookmarkStatus } from '@siftmarks/shared';

function toBookmarkStatus(status: LinkCheckStatus): BookmarkStatus {
  if (status === 'ok') return 'ok';
  if (status === 'redirected') return 'redirected';
  if (status === 'dns_error') return 'broken';
  return 'unchecked';
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDB();
  const bookmark = db.getBookmarkById(id);

  if (!bookmark) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const result = await fetchPageMetadata(bookmark.url, 10000);
  db.updateBookmark(id, {
    status: toBookmarkStatus(result.status),
    httpStatus: result.httpStatus,
    lastCheckedAt: new Date().toISOString(),
  });

  return NextResponse.json({
    ok: result.status === 'ok' || result.status === 'redirected',
    status: result.status,
    httpStatus: result.httpStatus,
    finalUrl: result.finalUrl,
    checkedAt: new Date().toISOString(),
    error: result.error,
  });
}
