import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { refreshBookmarksFTS } from '@/lib/bookmark-fts';
import { cleanTagName, normalizeTagKey } from '@/lib/tags';
import { generateId, nowISO, type Tag } from '@siftmarks/shared';

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value
      .map((item) => String(item ?? '').trim())
      .filter((item): item is string => item.length > 0)
  ));
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const sourceTagIds = stringList(body?.sourceTagIds);
  const targetTagId = typeof body?.targetTagId === 'string' ? body.targetTagId.trim() : '';
  const targetName = cleanTagName(body?.targetName);

  if (sourceTagIds.length === 0) {
    return NextResponse.json({ error: 'At least one source tag is required.' }, { status: 400 });
  }
  if (!targetTagId && !targetName) {
    return NextResponse.json({ error: 'Target tag is required.' }, { status: 400 });
  }

  const db = getDB();
  const sourceTags = sourceTagIds.map((id) => db.getTagById(id));
  const missingSource = sourceTags.findIndex((tag) => !tag);
  if (missingSource >= 0) {
    return NextResponse.json({ error: 'Source tag not found.', tagId: sourceTagIds[missingSource] }, { status: 404 });
  }

  let target: Tag | undefined;
  if (targetTagId) {
    target = db.getTagById(targetTagId);
    if (!target) {
      return NextResponse.json({ error: 'Target tag not found.' }, { status: 404 });
    }
  } else {
    const normalizedName = normalizeTagKey(targetName);
    if (!normalizedName) {
      return NextResponse.json({ error: 'Target tag name is required.' }, { status: 400 });
    }
    target = db.getTagByNormalizedName(normalizedName);
    if (!target) {
      target = {
        id: generateId(),
        name: targetName,
        normalizedName,
        createdAt: nowISO(),
      };
      db.insertTag(target);
    }
  }

  const finalSourceIds = sourceTagIds.filter((id) => id !== target.id);
  if (finalSourceIds.length === 0) {
    return NextResponse.json({ error: 'Source tags must differ from the target tag.' }, { status: 400 });
  }

  let movedBookmarks = 0;
  let refreshed = 0;
  db.transaction(() => {
    const affectedBookmarkIds = db.getBookmarkIdsForTags(finalSourceIds);
    movedBookmarks = affectedBookmarkIds.length;

    for (const bookmarkId of affectedBookmarkIds) {
      for (const sourceId of finalSourceIds) {
        db.removeBookmarkTag(bookmarkId, sourceId);
      }
      db.addBookmarkTag({
        bookmarkId,
        tagId: target.id,
        source: 'user',
        confidence: null,
      });
    }

    for (const sourceId of finalSourceIds) {
      db.deleteTag(sourceId);
    }

    refreshed = refreshBookmarksFTS(db, affectedBookmarkIds);
  });

  const updatedTags = db.listTags();
  const updatedTarget = db.getTagById(target.id);

  return NextResponse.json({
    ok: true,
    target: updatedTarget,
    tags: updatedTags,
    mergedTagIds: finalSourceIds,
    movedBookmarks,
    refreshedBookmarks: refreshed,
  });
}
