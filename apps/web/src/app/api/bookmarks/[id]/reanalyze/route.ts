import { NextResponse } from 'next/server';
import { fetchPageMetadata } from '@siftmarks/core';
import { getDB } from '@/lib/db';
import { getAIProvider } from '@/lib/ai';
import { generateId, MAX_BOOKMARK_TAGS, normalizeTagName, nowISO } from '@siftmarks/shared';
import type { BookmarkStatus, LinkCheckStatus } from '@siftmarks/shared';

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
  const existing = db.getBookmarkById(id);

  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const metadata = await fetchPageMetadata(existing.url, 10000);
  const provider = getAIProvider();

  const baseUpdate = {
    title: existing.title || metadata.title || existing.title,
    description: metadata.description ?? existing.description,
    contentText: metadata.contentText ?? existing.contentText,
    status: toBookmarkStatus(metadata.status),
    httpStatus: metadata.httpStatus,
    lastCheckedAt: nowISO(),
  };

  db.updateBookmark(id, baseUpdate);
  const bookmark = db.getBookmarkById(id) ?? existing;
  let summary: string | null = bookmark.summary;
  let tags = db.getBookmarkTags(id).map((tag) => tag.name);
  const aiPowered = provider.name !== 'mock';

  if (aiPowered) {
    const summaryResult = await provider.summarizeBookmark(bookmark);
    summary = summaryResult.summary;
    db.updateBookmark(id, {
      summary: summaryResult.summary,
      description: bookmark.description ?? summaryResult.shortSummary,
      lastIndexedAt: nowISO(),
    });

    const existingTags = db.getBookmarkTags(id);
    if (existingTags.length === 0) {
      const knownTagNames = db.listTags().map((tag) => tag.name);
      const knownTagKeys = new Set(knownTagNames.map((tag) => normalizeTagName(tag)).filter(Boolean));
      const tagResult = await provider.generateTags(bookmark, {
        existingTags: knownTagNames,
        maxTags: MAX_BOOKMARK_TAGS,
      });
      const seenTagKeys = new Set<string>();
      const orderedTags = [...tagResult.tags].sort((a, b) => {
        const aKnown = knownTagKeys.has(normalizeTagName(a.name));
        const bKnown = knownTagKeys.has(normalizeTagName(b.name));
        return Number(bKnown) - Number(aKnown);
      });

      for (const aiTag of orderedTags) {
        if (seenTagKeys.size >= MAX_BOOKMARK_TAGS) break;
        const normalizedName = normalizeTagName(aiTag.name);
        if (!normalizedName || seenTagKeys.has(normalizedName)) continue;
        seenTagKeys.add(normalizedName);

        let tag = db.getTagByNormalizedName(normalizedName);
        if (!tag) {
          tag = {
            id: generateId(),
            name: aiTag.name.toLowerCase(),
            normalizedName,
            createdAt: nowISO(),
          };
          db.insertTag(tag);
        }

        db.addBookmarkTag({
          bookmarkId: id,
          tagId: tag.id,
          source: 'ai',
          confidence: aiTag.confidence,
        });
      }
    }

    tags = db.getBookmarkTags(id).map((tag) => tag.name);
  }

  const updated = db.getBookmarkById(id);
  if (updated) {
    db.indexBookmarkFTS(updated, tags);
  }

  return NextResponse.json({
    ok: true,
    aiPowered,
    bookmark: updated ? { ...updated, tags } : { ...bookmark, tags },
    summary,
    tags,
    link: {
      status: metadata.status,
      httpStatus: metadata.httpStatus,
      finalUrl: metadata.finalUrl,
      error: metadata.error,
    },
  });
}
