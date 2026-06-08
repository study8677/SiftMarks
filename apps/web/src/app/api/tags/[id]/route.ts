import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { refreshBookmarksFTS } from '@/lib/bookmark-fts';
import { cleanTagName, normalizeTagKey } from '@/lib/tags';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const name = cleanTagName(body?.name);
  const normalizedName = normalizeTagKey(name);

  if (!name || !normalizedName) {
    return NextResponse.json({ error: 'Tag name is required.' }, { status: 400 });
  }

  const db = getDB();
  const tag = db.getTagById(id);
  if (!tag) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const duplicate = db.getTagByNormalizedName(normalizedName);
  if (duplicate && duplicate.id !== id) {
    return NextResponse.json({ error: 'Tag already exists.', tag: duplicate }, { status: 409 });
  }

  let refreshed = 0;
  db.transaction(() => {
    const bookmarkIds = db.getBookmarkIdsForTag(id);
    db.updateTag(id, { name, normalizedName });
    refreshed = refreshBookmarksFTS(db, bookmarkIds);
  });

  const updated = db.getTagById(id);
  return NextResponse.json({ tag: updated, refreshedBookmarks: refreshed });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDB();
  const tag = db.getTagById(id);
  if (!tag) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let affectedBookmarkCount = 0;
  let refreshed = 0;
  db.transaction(() => {
    const bookmarkIds = db.getBookmarkIdsForTag(id);
    affectedBookmarkCount = bookmarkIds.length;
    db.deleteTag(id);
    refreshed = refreshBookmarksFTS(db, bookmarkIds);
  });

  return NextResponse.json({
    ok: true,
    tag,
    affectedBookmarks: affectedBookmarkCount,
    refreshedBookmarks: refreshed,
  });
}
