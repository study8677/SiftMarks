import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { cleanTagName, normalizeTagKey } from '@/lib/tags';
import { generateId, nowISO } from '@siftmarks/shared';

export async function GET() {
  const db = getDB();
  const tags = db.listTags();
  return NextResponse.json({ tags });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const name = cleanTagName(body?.name);
  const normalizedName = normalizeTagKey(name);

  if (!name || !normalizedName) {
    return NextResponse.json({ error: 'Tag name is required.' }, { status: 400 });
  }

  const db = getDB();
  const existing = db.getTagByNormalizedName(normalizedName);
  if (existing) {
    return NextResponse.json({ error: 'Tag already exists.', tag: existing }, { status: 409 });
  }

  const tag = {
    id: generateId(),
    name,
    normalizedName,
    createdAt: nowISO(),
  };

  db.insertTag(tag);

  return NextResponse.json({ tag }, { status: 201 });
}
