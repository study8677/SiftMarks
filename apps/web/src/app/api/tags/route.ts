import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';

export async function GET() {
  const db = getDB();
  const tags = db.listTags();
  return NextResponse.json({ tags });
}
