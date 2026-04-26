import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { getChromeSyncPlan } from '@/lib/chrome-sync';

export async function GET() {
  const db = getDB();
  const { ops } = getChromeSyncPlan(db);

  return NextResponse.json({ ops, count: ops.length });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { syncedIds } = body;

  if (!Array.isArray(syncedIds)) {
    return NextResponse.json({ error: 'syncedIds required' }, { status: 400 });
  }

  const db = getDB();
  for (const id of syncedIds) {
    db.markSuggestionSynced(id);
  }

  return NextResponse.json({ ok: true, synced: syncedIds.length });
}
