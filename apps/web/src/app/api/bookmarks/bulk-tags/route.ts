import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { refreshBookmarksFTS } from '@/lib/bookmark-fts';
import { cleanTagName, normalizeTagKey } from '@/lib/tags';
import { generateId, nowISO } from '@siftmarks/shared';

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value
      .map((item) => String(item ?? '').trim())
      .filter((item): item is string => item.length > 0)
  ));
}

function tagNameList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanTagName(item))
    .filter((item): item is string => item.length > 0);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const bookmarkIds = stringList(body?.bookmarkIds);
  const addTags = tagNameList(body?.addTags);
  const removeTags = tagNameList(body?.removeTags);
  const removeTagIds = stringList(body?.removeTagIds);

  if (bookmarkIds.length === 0) {
    return NextResponse.json({ error: 'At least one bookmark is required.' }, { status: 400 });
  }
  if (addTags.length === 0 && removeTags.length === 0 && removeTagIds.length === 0) {
    return NextResponse.json({ error: 'No tag changes requested.' }, { status: 400 });
  }

  const db = getDB();
  const existingBookmarkIds = bookmarkIds.filter((id) => db.getBookmarkById(id));
  if (existingBookmarkIds.length === 0) {
    return NextResponse.json({ error: 'No matching bookmarks found.' }, { status: 404 });
  }

  const addTagIds: string[] = [];
  const removeIds = new Set(removeTagIds);

  db.transaction(() => {
    const seenAddKeys = new Set<string>();
    for (const rawName of addTags) {
      const name = cleanTagName(rawName);
      const normalizedName = normalizeTagKey(name);
      if (!name || !normalizedName || seenAddKeys.has(normalizedName)) continue;
      seenAddKeys.add(normalizedName);

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
      addTagIds.push(tag.id);
    }

    for (const rawName of removeTags) {
      const name = cleanTagName(rawName);
      const normalizedName = normalizeTagKey(name);
      if (!normalizedName) continue;

      const tag = db.getTagByNormalizedName(normalizedName);
      if (tag) removeIds.add(tag.id);
    }

    for (const bookmarkId of existingBookmarkIds) {
      for (const tagId of removeIds) {
        db.removeBookmarkTag(bookmarkId, tagId);
      }
      for (const tagId of addTagIds) {
        db.addBookmarkTag({
          bookmarkId,
          tagId,
          source: 'user',
          confidence: null,
        });
      }
    }

    refreshBookmarksFTS(db, existingBookmarkIds);
  });

  return NextResponse.json({
    ok: true,
    changedBookmarks: existingBookmarkIds.length,
    addedTagIds: addTagIds,
    removedTagIds: Array.from(removeIds),
  });
}
