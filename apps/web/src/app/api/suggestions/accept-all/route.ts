import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { applySuggestion } from '@siftmarks/core';

export async function POST() {
  const db = getDB();
  const { items } = db.listSuggestions({ status: 'pending', limit: 100000 });

  let accepted = 0;
  for (const s of items) {
    if (applySuggestion(db, s.id)) {
      accepted++;
    }
  }

  return NextResponse.json({ accepted });
}
