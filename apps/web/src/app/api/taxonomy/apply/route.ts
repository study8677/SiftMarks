import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { getAIProvider } from '@/lib/ai';
import { classifyBookmarks, MockProviderNotAllowedError } from '@siftmarks/ai';
import { generateId, nowISO, type BookmarkTaxonomy, type CleanupSuggestion } from '@siftmarks/shared';

const SETTING_KEY = 'bookmarkTaxonomy';

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

  if (active.length === 0) {
    return NextResponse.json({ created: 0, errors: 0, skipped: 0 });
  }

  try {
    const { results, errors } = await classifyBookmarks(provider, taxonomy, active);

    const now = nowISO();
    let created = 0;
    let skipped = 0;

    db.transaction(() => {
      db.clearPendingSuggestionsByType('move');

      for (const bookmark of active) {
        const result = results.get(bookmark.id);
        if (!result) {
          skipped++;
          continue;
        }
        if (bookmark.folderPath === result.category) {
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
          afterJson: JSON.stringify({ folderPath: result.category }),
          reason: `[AI] Categorized as "${result.category}" based on your taxonomy`,
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
