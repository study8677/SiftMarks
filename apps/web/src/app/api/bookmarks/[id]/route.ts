import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';

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

  db.updateBookmark(id, body);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDB();
  db.deleteBookmark(id);
  return NextResponse.json({ ok: true });
}
