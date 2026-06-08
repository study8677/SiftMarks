import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { getAIProvider } from '@/lib/ai';
import { classifyBookmarks, MockProviderNotAllowedError } from '@siftmarks/ai';
import {
  DEFAULT_SETTINGS,
  generateId,
  isLowValueFolderPath,
  normalizeFolderPath,
  nowISO,
  type BookmarkTaxonomy,
  type CleanupSuggestion,
} from '@siftmarks/shared';

const SETTING_KEY = 'bookmarkTaxonomy';

function clampTopLevelFolderLimit(value: number): number {
  return Number.isFinite(value)
    ? Math.min(Math.max(Math.round(value), 3), 50)
    : DEFAULT_SETTINGS.topLevelFolderLimit;
}

export async function POST() {
  const db = getDB();
  const raw = db.getSetting(SETTING_KEY);

  if (!raw) {
    return NextResponse.json({ error: 'No taxonomy yet. Generate one first.' }, { status: 400 });
  }

  let taxonomy: BookmarkTaxonomy;
  try {
    taxonomy = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Stored taxonomy is corrupted.' }, { status: 500 });
  }

  if (!taxonomy.categories || taxonomy.categories.length === 0) {
    return NextResponse.json({ error: 'Taxonomy has no categories.' }, { status: 400 });
  }

  const provider = getAIProvider();
  const { items: bookmarks } = db.listBookmarks({ limit: 100000 });
  const active = bookmarks.filter((b) => b.status !== 'deleted');
  const folderDepth = db.getSetting('folderDepth') === '2' ? 2 : 1;
  const topLevelFolderLimit = clampTopLevelFolderLimit(Number(db.getSetting('topLevelFolderLimit')));

  if (active.length === 0) {
    return NextResponse.json({ created: 0, errors: 0, skipped: 0 });
  }

  try {
    const { results, errors } = await classifyBookmarks(provider, taxonomy, active);

    const now = nowISO();
    let created = 0;
    let skipped = 0;
    const existingTopLevelFolders = new Set(
      db
        .listFolders()
        .map((folder) => folder.path.split('/')[0])
        .filter(Boolean)
    );
    const plannedTopLevelFolders = new Set(existingTopLevelFolders);

    db.transaction(() => {
      db.clearPendingSuggestionsByType('move');

      for (const bookmark of active) {
        const result = results.get(bookmark.id);
        if (!result) {
          skipped++;
          continue;
        }
        let targetFolder = normalizeFolderPath(result.category);
        if (folderDepth === 1 && targetFolder.includes('/')) {
          targetFolder = targetFolder.split('/')[0] ?? '';
        }
        if (folderDepth === 2) {
          targetFolder = targetFolder.split('/').filter(Boolean).slice(0, 2).join('/');
        }
        if (!targetFolder || result.category === taxonomy.fallback || isLowValueFolderPath(targetFolder)) {
          skipped++;
          continue;
        }
        const topLevel = targetFolder.split('/')[0];
        if (topLevel && !plannedTopLevelFolders.has(topLevel)) {
          if (plannedTopLevelFolders.size >= topLevelFolderLimit) {
            skipped++;
            continue;
          }
          plannedTopLevelFolders.add(topLevel);
        }
        if (bookmark.folderPath === targetFolder) {
          skipped++;
          continue;
        }

        const suggestion: CleanupSuggestion = {
          id: generateId(),
          type: 'move',
          status: 'pending',
          bookmarkId: bookmark.id,
          targetBookmarkId: null,
          beforeJson: JSON.stringify({ folderPath: bookmark.folderPath }),
          afterJson: JSON.stringify({ folderPath: targetFolder }),
          reason: `[AI] Categorized as "${targetFolder}" based on your taxonomy`,
          confidence: result.confidence,
          createdAt: now,
          resolvedAt: null,
        };
        db.insertSuggestion(suggestion);
        created++;
      }
    });

    return NextResponse.json({ created, errors, skipped, total: active.length });
  } catch (err) {
    if (err instanceof MockProviderNotAllowedError) {
      return NextResponse.json(
        { error: err.message, code: 'mock_provider' },
        { status: 400 }
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Classification failed: ${message}` },
      { status: 500 }
    );
  }
}
