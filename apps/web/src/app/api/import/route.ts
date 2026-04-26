import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { parseBookmarkHTML, importBookmarks } from '@siftmarks/core';
import { rebuildFTSIndex } from '@siftmarks/indexer';

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  const html = await file.text();
  const parsed = parseBookmarkHTML(html);

  if (parsed.length === 0) {
    return NextResponse.json({ error: 'No bookmarks found in file' }, { status: 400 });
  }

  const db = getDB();
  const result = importBookmarks(parsed, db);
  rebuildFTSIndex(db);

  return NextResponse.json(result);
}
