import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { getChromeSyncPlan } from '@/lib/chrome-sync';

export async function POST() {
  const db = getDB();
  const { ops, skipped } = getChromeSyncPlan(db);

  return NextResponse.json({
    applied: 0,
    requiresExtension: true,
    ops: ops.length,
    skipped,
    message: 'Chrome sync must be applied from the SiftMarks Chrome extension.',
  });
}
