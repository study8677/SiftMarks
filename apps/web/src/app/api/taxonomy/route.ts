import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import type { BookmarkTaxonomy } from '@siftmarks/shared';

const SETTING_KEY = 'bookmarkTaxonomy';

export async function GET() {
  const db = getDB();
  const raw = db.getSetting(SETTING_KEY);
  if (!raw) {
    return NextResponse.json({ taxonomy: null });
  }
  try {
    const taxonomy = JSON.parse(raw) as BookmarkTaxonomy;
    return NextResponse.json({ taxonomy });
  } catch {
    return NextResponse.json({ taxonomy: null });
  }
}

export async function PATCH(request: Request) {
  const body = await request.json();
  const taxonomy = body.taxonomy as BookmarkTaxonomy | undefined;

  if (!taxonomy || !Array.isArray(taxonomy.categories)) {
    return NextResponse.json({ error: 'taxonomy.categories array required' }, { status: 400 });
  }

  const cleaned: BookmarkTaxonomy = {
    categories: taxonomy.categories
      .filter((c) => c?.name && typeof c.name === 'string')
      .map((c) => ({
        name: String(c.name).trim(),
        description: String(c.description ?? '').trim(),
        examples: Array.isArray(c.examples) ? c.examples.slice(0, 5).map(String) : [],
      })),
    fallback: taxonomy.fallback?.trim() || 'Other',
    language: taxonomy.language ?? 'mixed',
    generatedAt: taxonomy.generatedAt ?? new Date().toISOString(),
    totalBookmarks: taxonomy.totalBookmarks ?? 0,
    model: taxonomy.model ?? 'manual',
  };

  if (cleaned.categories.length === 0) {
    return NextResponse.json({ error: 'at least one category required' }, { status: 400 });
  }

  const db = getDB();
  db.setSetting(SETTING_KEY, JSON.stringify(cleaned));

  return NextResponse.json({ taxonomy: cleaned });
}

export async function DELETE() {
  const db = getDB();
  db.setSetting(SETTING_KEY, '');
  return NextResponse.json({ ok: true });
}
