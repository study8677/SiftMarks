import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { generateCleanupSuggestions, generateAICleanupSuggestions } from '@siftmarks/core';
import { getAIProvider } from '@/lib/ai';
import { indexBookmarks } from '@siftmarks/indexer';
import { DEFAULT_SETTINGS, normalizeFolderPath } from '@siftmarks/shared';

function clampTopLevelFolderLimit(value: number): number {
  return Number.isFinite(value)
    ? Math.min(Math.max(Math.round(value), 3), 50)
    : DEFAULT_SETTINGS.topLevelFolderLimit;
}

export async function POST(request: Request) {
  const db = getDB();
  const provider = getAIProvider();
  const body = await request.json().catch(() => ({}));
  const deep = body.deep === true;
  const rawLimit = Number(body.analysisLimit);
  const analysisLimit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 20) : 10;

  const analysis = deep
    ? await indexBookmarks(db, provider, {
        limit: analysisLimit,
        onlyMissing: true,
        useAI: provider.name !== 'mock',
        fetchContent: true,
        fetchTimeout: 5000,
      })
    : null;

  let suggestions;

  if (deep && provider.name !== 'mock') {
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

  const folderDepth = db.getSetting('folderDepth') === '2' ? 2 : 1;
  const topLevelFolderLimit = clampTopLevelFolderLimit(Number(db.getSetting('topLevelFolderLimit')));
  const currentTopLevelFolders = new Set(
    db
      .listFolders()
      .map((folder) => folder.path.split('/')[0])
      .filter(Boolean)
  );
  const plannedTopLevelFolders = new Set(currentTopLevelFolders);
  for (const suggestion of suggestions) {
    if (suggestion.type !== 'move') continue;
    let after: { folderPath?: unknown };
    try {
      after = JSON.parse(suggestion.afterJson) as { folderPath?: unknown };
    } catch {
      continue;
    }
    const folderPath = normalizeFolderPath(String(after.folderPath ?? ''));
    const topLevel = folderPath.split('/')[0];
    if (topLevel) plannedTopLevelFolders.add(topLevel);
  }
  const topLevelFolderCount = currentTopLevelFolders.size;
  const projectedTopLevelFolderCount = plannedTopLevelFolders.size;
  const limitReached = topLevelFolderCount >= topLevelFolderLimit;
  const willReachLimit = projectedTopLevelFolderCount >= topLevelFolderLimit;

  return NextResponse.json({
    suggestionsCount: suggestions.length,
    duplicates: byType.get('merge_duplicate') ?? 0,
    broken: byType.get('delete_broken') ?? 0,
    renames: byType.get('rename') ?? 0,
    tags: byType.get('tag') ?? 0,
    folders: byType.get('move') ?? 0,
    aiPowered: provider.name !== 'mock',
    analysis,
    folderPolicy: {
      folderDepth,
      topLevelFolderLimit,
      topLevelFolderCount,
      projectedTopLevelFolderCount,
      limitReached,
      willReachLimit,
      message: limitReached || willReachLimit
        ? `一级文件夹${limitReached ? '已达到' : '本次建议后将达到'} ${projectedTopLevelFolderCount}/${topLevelFolderLimit}。AI 会优先归入已有一级文件夹，不再继续新增一级文件夹。`
        : null,
    },
  });
}
