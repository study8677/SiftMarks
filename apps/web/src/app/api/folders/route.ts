import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';

export async function GET() {
  const db = getDB();
  const folders = db.listFolders();
  return NextResponse.json({ folders });
}
