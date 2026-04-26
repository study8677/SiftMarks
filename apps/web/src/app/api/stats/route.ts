import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';

export async function GET() {
  const db = getDB();
  const stats = db.getStats();
  return NextResponse.json(stats);
}
