import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { normalizeUrl, generateId, nowISO, type Bookmark } from '@siftmarks/shared';

export async function POST(request: Request) {
  const body = await request.json();
  const { url, title } = body;

  if (!url) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 });
  }

  const db = getDB();
  const normalized = normalizeUrl(url);
  const existing = db.getBookmarkByNormalizedUrl(normalized);

  if (existing) {
    return NextResponse.json({
      id: existing.id,
      status: 'already_exists',
      title: existing.title,
    });
  }

  const now = nowISO();
  const id = generateId();

  const bookmark: Bookmark = {
    id,
    url,
    normalizedUrl: normalized,
    title: title ?? null,
    originalTitle: title ?? null,
    description: null,
    contentText: null,
    summary: null,
    folderPath: null,
    faviconUrl: null,
    status: 'unchecked',
    httpStatus: null,
    isDuplicate: false,
    duplicateGroupId: null,
    createdAt: now,
    importedAt: now,
    updatedAt: now,
    lastCheckedAt: null,
    lastIndexedAt: null,
    source: 'extension',
    chromeId: null,
    chromeParentId: null,
  };

  db.insertBookmark(bookmark);

  // Index FTS
  db.indexBookmarkFTS(bookmark, []);

  return NextResponse.json({ id, status: 'saved' });
}
