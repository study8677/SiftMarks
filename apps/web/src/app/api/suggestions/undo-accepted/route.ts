import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { revertSuggestion } from '@siftmarks/core';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const db = getDB();
  const requestedIds = Array.isArray(body.suggestionIds)
    ? body.suggestionIds.map((id: unknown) => String(id ?? '').trim()).filter(Boolean)
    : [];
  const includeSynced = body.includeSynced === true && requestedIds.length > 0;
  const ids = requestedIds.length > 0
    ? requestedIds
    : db.listSuggestions({ status: 'accepted', limit: 100000 }).items.map((suggestion) => suggestion.id);

  let reverted = 0;
  db.transaction(() => {
    for (const id of ids) {
      if (revertSuggestion(db, id, { includeSynced })) {
        reverted++;
      }
    }
  });

  return NextResponse.json({ reverted });
}
