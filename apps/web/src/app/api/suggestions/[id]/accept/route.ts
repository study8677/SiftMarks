import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { applySuggestion } from '@siftmarks/core';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDB();
  const ok = applySuggestion(db, id);

  if (!ok) {
    return NextResponse.json({ error: 'Suggestion not found or already resolved' }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
