import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDB();
  db.updateSuggestionStatus(id, 'dismissed');
  return NextResponse.json({ ok: true });
}
