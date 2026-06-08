import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { getAIProvider } from '@/lib/ai';
import { indexBookmarks } from '@siftmarks/indexer';

export async function POST(request: Request) {
  const body = await request.json();
  const {
    limit = 100,
    onlyMissing = true,
    useAI = true,
    fetchContent = true,
    fetchTimeout = 10000,
  } = body;

  const db = getDB();
  const provider = getAIProvider();

  const result = await indexBookmarks(db, provider, {
    limit,
    onlyMissing,
    useAI,
    fetchContent,
    fetchTimeout,
  });

  return NextResponse.json(result);
}
