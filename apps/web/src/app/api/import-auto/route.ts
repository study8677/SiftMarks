import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { parseChromeJSON, importBookmarks } from '@siftmarks/core';
import { rebuildFTSIndex } from '@siftmarks/indexer';

export async function POST(request: Request) {
  const body = await request.json();
  const { path } = body;

  if (!path) {
    return NextResponse.json({ error: 'path is required' }, { status: 400 });
  }

  try {
    const parsed = parseChromeJSON(path);

    if (parsed.length === 0) {
      return NextResponse.json({ error: 'No bookmarks found' }, { status: 400 });
    }

    const db = getDB();
    const result = importBookmarks(parsed, db);
    rebuildFTSIndex(db);

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
