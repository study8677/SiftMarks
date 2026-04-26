import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { getAIProvider } from '@/lib/ai';
import { generateTaxonomy, MockProviderNotAllowedError } from '@siftmarks/ai';

const SETTING_KEY = 'bookmarkTaxonomy';

export async function POST() {
  const db = getDB();
  const provider = getAIProvider();

  const { items: bookmarks } = db.listBookmarks({ limit: 100000 });
  const active = bookmarks.filter((b) => b.status !== 'deleted');

  if (active.length === 0) {
    return NextResponse.json(
      { error: 'No bookmarks in library yet. Import some first.' },
      { status: 400 }
    );
  }

  try {
    const taxonomy = await generateTaxonomy(provider, active);
    db.setSetting(SETTING_KEY, JSON.stringify(taxonomy));
    return NextResponse.json({ taxonomy });
  } catch (err) {
    if (err instanceof MockProviderNotAllowedError) {
      return NextResponse.json(
        { error: err.message, code: 'mock_provider' },
        { status: 400 }
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Taxonomy generation failed: ${message}` },
      { status: 500 }
    );
  }
}
