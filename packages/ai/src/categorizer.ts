import type { AIProvider } from './provider.js';
import type { Bookmark, BookmarkTaxonomy, BookmarkCategory } from '@siftmarks/shared';

export interface CategorizerProgress {
  phase: 'taxonomy' | 'classify';
  done: number;
  total: number;
  errors: number;
}

interface BookmarkRow {
  i: number;
  id: string;
  title: string;
  url: string;
  folder: string;
}

function compactBookmarks(bookmarks: Bookmark[]): BookmarkRow[] {
  return bookmarks.map((b, i) => ({
    i,
    id: b.id,
    title: (b.title ?? '').slice(0, 120),
    url: b.url.slice(0, 200),
    folder: b.folderPath ?? '',
  }));
}

function detectLanguage(bookmarks: Bookmark[]): 'zh' | 'en' | 'mixed' {
  let zh = 0;
  let en = 0;
  const sample = bookmarks.slice(0, 500);
  for (const b of sample) {
    const text = `${b.title ?? ''} ${b.folderPath ?? ''}`;
    if (/[\u4e00-\u9fff]/.test(text)) zh++;
    else if (/[a-zA-Z]/.test(text)) en++;
  }
  if (zh > en * 2) return 'zh';
  if (en > zh * 2) return 'en';
  return 'mixed';
}

function stripCodeFence(text: string): string {
  return text.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim();
}

/**
 * Generate a personalized taxonomy by sending the entire library to the LLM in one call.
 * Falls back to splitting into chunks only if the prompt would exceed a soft size cap.
 */
export class MockProviderNotAllowedError extends Error {
  constructor() {
    super('Mock provider cannot generate a taxonomy. Configure an AI provider in Settings first.');
    this.name = 'MockProviderNotAllowedError';
  }
}

export async function generateTaxonomy(
  provider: AIProvider,
  bookmarks: Bookmark[]
): Promise<BookmarkTaxonomy> {
  if (provider.name === 'mock') {
    throw new MockProviderNotAllowedError();
  }
  if (bookmarks.length === 0) {
    return {
      categories: [],
      fallback: 'Other',
      language: 'en',
      generatedAt: new Date().toISOString(),
      totalBookmarks: 0,
      model: provider.name,
    };
  }

  const language = detectLanguage(bookmarks);
  const rows = compactBookmarks(bookmarks);

  const folderHistogram = new Map<string, number>();
  const domainHistogram = new Map<string, number>();
  for (const b of bookmarks) {
    if (b.folderPath) folderHistogram.set(b.folderPath, (folderHistogram.get(b.folderPath) ?? 0) + 1);
    try {
      const host = new URL(b.url).hostname;
      domainHistogram.set(host, (domainHistogram.get(host) ?? 0) + 1);
    } catch {
      // ignore malformed urls
    }
  }
  const topFolders = [...folderHistogram.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);
  const topDomains = [...domainHistogram.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);

  const langDirective =
    language === 'zh'
      ? 'Output category names and descriptions in Simplified Chinese (中文). Examples can be in any language.'
      : language === 'en'
        ? 'Output category names and descriptions in English.'
        : "Match the language mix of the user's bookmarks. If the library is mostly Chinese, use Chinese names; if mostly English, use English names.";

  const systemPrompt = `You design personalized bookmark taxonomies. You will see a user's entire bookmark library and propose 8-15 mutually exclusive top-level categories that fit THIS user's actual content. Categories must:
- Be specific to the bookmarks provided, not generic ("Tools", "Articles", "Misc" are forbidden)
- Cover the whole library (every bookmark must fit somewhere or in the fallback)
- Be roughly balanced — avoid one giant catch-all
- Use clear, short names (1-4 words)
- ${langDirective}

Return ONLY a JSON object, no prose, no markdown:
{
  "categories": [
    {"name": "...", "description": "what kind of bookmark goes here (1 sentence)", "examples": ["short example title or domain", "another"]}
  ],
  "fallback": "Other"
}`;

  const userPrompt = `Bookmark library (${bookmarks.length} entries):
${JSON.stringify(rows, null, 0)}

Top original folders: ${JSON.stringify(topFolders)}
Top domains: ${JSON.stringify(topDomains)}

Propose the taxonomy.`;

  const raw = await provider.chat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]);

  const cleaned = stripCodeFence(raw);
  let parsed: { categories?: BookmarkCategory[]; fallback?: string };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`AI taxonomy returned invalid JSON: ${cleaned.slice(0, 200)}`);
  }

  if (!parsed.categories || !Array.isArray(parsed.categories) || parsed.categories.length === 0) {
    throw new Error('AI taxonomy returned no categories');
  }

  return {
    categories: parsed.categories.map((c) => ({
      name: String(c.name ?? '').trim(),
      description: String(c.description ?? '').trim(),
      examples: Array.isArray(c.examples) ? c.examples.slice(0, 5).map(String) : [],
    })).filter((c) => c.name),
    fallback: parsed.fallback ?? (language === 'zh' ? '其他' : 'Other'),
    language,
    generatedAt: new Date().toISOString(),
    totalBookmarks: bookmarks.length,
    model: provider.name,
  };
}

export interface ClassifyResult {
  bookmarkId: string;
  category: string;
  confidence: number;
}

/**
 * Classify each bookmark into one taxonomy category. Batches to keep prompts small
 * and outputs deterministic. Bookmarks that fail in a batch fall back to taxonomy.fallback.
 */
export async function classifyBookmarks(
  provider: AIProvider,
  taxonomy: BookmarkTaxonomy,
  bookmarks: Bookmark[],
  options: {
    batchSize?: number;
    concurrency?: number;
    onProgress?: (progress: CategorizerProgress) => void;
  } = {}
): Promise<{ results: Map<string, ClassifyResult>; errors: number }> {
  if (provider.name === 'mock') {
    throw new MockProviderNotAllowedError();
  }
  const { batchSize = 30, concurrency = 4, onProgress } = options;
  const results = new Map<string, ClassifyResult>();
  let errors = 0;
  let done = 0;

  const categoryNames = taxonomy.categories.map((c) => c.name);
  const taxonomyBlock = taxonomy.categories
    .map((c) => `- ${c.name}: ${c.description}`)
    .join('\n');

  const batches: Bookmark[][] = [];
  for (let i = 0; i < bookmarks.length; i += batchSize) {
    batches.push(bookmarks.slice(i, i + batchSize));
  }

  const queue = [...batches];

  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const batch = queue.shift();
      if (!batch) break;

      try {
        const batchResults = await classifyBatch(provider, taxonomyBlock, categoryNames, taxonomy.fallback, batch);
        for (const r of batchResults) {
          results.set(r.bookmarkId, r);
        }
      } catch (err) {
        errors++;
        for (const b of batch) {
          results.set(b.id, { bookmarkId: b.id, category: taxonomy.fallback, confidence: 0 });
        }
        console.error('classifyBatch failed:', err);
      }

      done += batch.length;
      onProgress?.({ phase: 'classify', done, total: bookmarks.length, errors });
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, batches.length) }, () => worker()));

  return { results, errors };
}

async function classifyBatch(
  provider: AIProvider,
  taxonomyBlock: string,
  categoryNames: string[],
  fallback: string,
  batch: Bookmark[]
): Promise<ClassifyResult[]> {
  const rows = batch.map((b, i) => ({
    i,
    title: (b.title ?? '').slice(0, 120),
    url: b.url.slice(0, 200),
    folder: b.folderPath ?? '',
  }));

  const raw = await provider.chat([
    {
      role: 'system',
      content: `You assign bookmarks to exactly one category from the taxonomy below. If none fit, use "${fallback}". Output a compact JSON array with one entry per input.

Taxonomy:
${taxonomyBlock}
- ${fallback}: anything that does not fit elsewhere

Output format (return ONLY the JSON array, no prose):
[{"i":0,"c":"<category name>","p":0.92}, ...]
- "i" is the input index
- "c" must be one of the category names verbatim (or "${fallback}")
- "p" is your confidence 0-1`,
    },
    { role: 'user', content: JSON.stringify(rows, null, 0) },
  ]);

  const cleaned = stripCodeFence(raw);
  const parsed = JSON.parse(cleaned) as Array<{ i: number; c: string; p?: number }>;

  const validNames = new Set([...categoryNames, fallback]);
  const out: ClassifyResult[] = [];
  for (const item of parsed) {
    const bm = batch[item.i];
    if (!bm) continue;
    const category = validNames.has(item.c) ? item.c : fallback;
    out.push({
      bookmarkId: bm.id,
      category,
      confidence: typeof item.p === 'number' ? Math.max(0, Math.min(1, item.p)) : 0.7,
    });
  }

  // Anything missing from response → fallback
  for (const b of batch) {
    if (!out.find((r) => r.bookmarkId === b.id)) {
      out.push({ bookmarkId: b.id, category: fallback, confidence: 0 });
    }
  }

  return out;
}
