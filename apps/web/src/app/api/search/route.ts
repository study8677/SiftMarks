import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { keywordSearch, hybridSearch } from '@siftmarks/core';
import { getAIProvider } from '@/lib/ai';

export async function POST(request: Request) {
  const body = await request.json();
  const { query, mode = 'memory', limit = 20, tag, folder } = body;

  if (!query) {
    return NextResponse.json({ error: 'Query is required' }, { status: 400 });
  }

  const db = getDB();

  if (mode === 'memory') {
    const provider = getAIProvider();
    let queryEmbedding: number[] | undefined;
    let rewrittenQuery = query;

    try {
      rewrittenQuery = await provider.rewriteSearchQuery(query);
      if (!rewrittenQuery.trim()) rewrittenQuery = query;
    } catch {
      rewrittenQuery = query;
    }

    try {
      queryEmbedding = await provider.generateEmbedding(`${query}\n${rewrittenQuery}`);
      if (queryEmbedding.length === 0) queryEmbedding = undefined;
    } catch {
      // Fall back to keyword search
    }

    const results = hybridSearch(db, { query, limit, tag, folder }, queryEmbedding);
    const rewrittenResults = rewrittenQuery === query
      ? []
      : keywordSearch(db, { query: rewrittenQuery, limit, tag, folder });

    return NextResponse.json({
      results: mergeResults(results, rewrittenResults, limit),
      mode: 'memory',
      rewrittenQuery,
      aiPowered: provider.name !== 'mock',
    });
  }

  const results = keywordSearch(db, { query, limit, tag, folder });
  return NextResponse.json({ results });
}

type SearchItem = ReturnType<typeof keywordSearch>[number];

function mergeResults(primary: SearchItem[], secondary: SearchItem[], limit: number): SearchItem[] {
  const byId = new Map<string, SearchItem>();

  for (const result of [...primary, ...secondary]) {
    const existing = byId.get(result.bookmark.id);
    if (!existing || result.score > existing.score) {
      byId.set(result.bookmark.id, result);
    }
  }

  return [...byId.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
