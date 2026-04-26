import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { keywordSearch, hybridSearch } from '@siftmarks/core';
import { getAIProvider } from '@/lib/ai';

export async function POST(request: Request) {
  const body = await request.json();
  const { query, mode = 'keyword', limit = 20, tag, folder } = body;

  if (!query) {
    return NextResponse.json({ error: 'Query is required' }, { status: 400 });
  }

  const db = getDB();

  if (mode === 'memory') {
    const provider = getAIProvider();
    let queryEmbedding: number[] | undefined;

    try {
      queryEmbedding = await provider.generateEmbedding(query);
      if (queryEmbedding.length === 0) queryEmbedding = undefined;
    } catch {
      // Fall back to keyword search
    }

    const results = hybridSearch(db, { query, limit, tag, folder }, queryEmbedding);
    return NextResponse.json({ results });
  }

  const results = keywordSearch(db, { query, limit, tag, folder });
  return NextResponse.json({ results });
}
