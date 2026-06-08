import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { generateId, isLowValueFolderPath, MAX_BOOKMARK_TAGS, normalizeFolderPath, normalizeTagName, normalizeUrl, nowISO } from '@siftmarks/shared';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDB();
  const bookmark = db.getBookmarkById(id);

  if (!bookmark) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const tags = db.getBookmarkTags(id).map((t) => ({
    name: t.name,
    source: t.source,
    confidence: t.confidence,
  }));

  return NextResponse.json({ ...bookmark, tags });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const db = getDB();

  const bookmark = db.getBookmarkById(id);
  if (!bookmark) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { tags, ...bookmarkUpdates } = body;

  if (bookmarkUpdates.url) {
    const normalizedUrl = normalizeUrl(bookmarkUpdates.url);
    const duplicate = db.getBookmarkByNormalizedUrl(normalizedUrl);
    if (duplicate && duplicate.id !== id) {
      return NextResponse.json(
        { error: 'A bookmark with this URL already exists.', duplicateId: duplicate.id },
        { status: 409 }
      );
    }
    bookmarkUpdates.normalizedUrl = normalizedUrl;
  }

  db.transaction(() => {
    db.updateBookmark(id, bookmarkUpdates);

    if (bookmarkUpdates.folderPath) {
      const folderPath = normalizeFolderPath(String(bookmarkUpdates.folderPath).trim());
      if (folderPath && !isLowValueFolderPath(folderPath)) {
        const parts = folderPath.split('/').filter(Boolean);
        db.insertFolder({
          id: generateId(),
          path: folderPath,
          name: parts[parts.length - 1] ?? folderPath,
          parentPath: parts.length > 1 ? parts.slice(0, -1).join('/') : null,
          createdAt: nowISO(),
        });
      }
    }

    if (Array.isArray(tags)) {
      const currentTags = db.getBookmarkTags(id);
      for (const tag of currentTags) {
        db.removeBookmarkTag(id, tag.id);
      }

      const seen = new Set<string>();
      for (const rawName of tags) {
        if (seen.size >= MAX_BOOKMARK_TAGS) break;
        const name = String(rawName ?? '').trim();
        const normalizedName = normalizeTagName(name) || name.toLowerCase().replace(/\s+/g, '-');
        if (!name || !normalizedName || seen.has(normalizedName)) continue;
        seen.add(normalizedName);

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
          bookmarkId: id,
          tagId: tag.id,
          source: 'user',
          confidence: null,
        });
      }
    }

    const updated = db.getBookmarkById(id);
    if (updated) {
      db.indexBookmarkFTS(updated, db.getBookmarkTags(id).map((tag) => tag.name));
    }
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDB();
  const bookmark = db.getBookmarkById(id);

  if (!bookmark) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  if (searchParams.get('permanent') === 'true') {
    db.deleteBookmark(id);
    return NextResponse.json({ ok: true, permanent: true });
  }

  db.updateBookmark(id, { status: 'deleted' });
  return NextResponse.json({ ok: true, trashed: true });
}
