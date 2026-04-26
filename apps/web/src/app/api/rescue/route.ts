import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { generateCleanupSuggestions, generateAICleanupSuggestions } from '@siftmarks/core';
import { getAIProvider } from '@/lib/ai';

export async function POST() {
  const db = getDB();
  const provider = getAIProvider();

  let suggestions;

  if (provider.name !== 'mock') {
    // Use LLM-powered rescue
    suggestions = await generateAICleanupSuggestions(db, provider);
  } else {
    // Rule-based only
    suggestions = generateCleanupSuggestions(db);
  }

  const byType = new Map<string, number>();
  for (const s of suggestions) {
    byType.set(s.type, (byType.get(s.type) ?? 0) + 1);
  }

  return NextResponse.json({
    suggestionsCount: suggestions.length,
    duplicates: byType.get('merge_duplicate') ?? 0,
    broken: byType.get('delete_broken') ?? 0,
    renames: byType.get('rename') ?? 0,
    tags: byType.get('tag') ?? 0,
    folders: byType.get('move') ?? 0,
    aiPowered: provider.name !== 'mock',
  });
}
