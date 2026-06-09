import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { applySuggestion } from '@siftmarks/core';
import type { CleanupType } from '@siftmarks/shared';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const db = getDB();
  const { items } = db.listSuggestions({
    status: 'pending',
    type: typeof body.type === 'string' ? body.type as CleanupType : undefined,
    limit: 100000,
  });

  let accepted = 0;
  const acceptedIds: string[] = [];
  for (const s of items) {
    if (applySuggestion(db, s.id)) {
      accepted++;
      acceptedIds.push(s.id);
    }
  }

  return NextResponse.json({ accepted, acceptedIds });
}
