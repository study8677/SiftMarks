import type { AIProvider } from './provider.js';
import { isLowValueFolderPath, type Bookmark, type BookmarkTaxonomy, type BookmarkCategory } from '@siftmarks/shared';

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

function extractJson(text: string): string {
  const withoutThinking = text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^<think>[\s\S]*/i, (match) => {
      const objectStart = match.indexOf('{');
      const arrayStart = match.indexOf('[');
      const starts = [objectStart, arrayStart].filter((n) => n >= 0);
      return starts.length > 0 ? match.slice(Math.min(...starts)) : '';
    });

  const cleaned = withoutThinking
    .replace(/```(?:json)?\n?/gi, '')
    .replace(/```\n?/g, '')
    .trim();

  const firstObject = cleaned.indexOf('{');
  const firstArray = cleaned.indexOf('[');
  const starts = [firstObject, firstArray].filter((n) => n >= 0);
  if (starts.length === 0) return cleaned;

  const start = Math.min(...starts);
  const open = cleaned[start];
  const close = open === '{' ? '}' : ']';
  const end = cleaned.lastIndexOf(close);
  return end >= start ? cleaned.slice(start, end + 1).trim() : cleaned.slice(start).trim();
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
  bookmarks: Bookmark[],
  options: { folderDepth?: 1 | 2; topLevelFolderLimit?: number } = {}
): Promise<BookmarkTaxonomy> {
  if (provider.name === 'mock') {
    throw new MockProviderNotAllowedError();
  }
  if (bookmarks.length === 0) {
    return {
      categories: [],
      fallback: 'Needs Review',
      language: 'en',
      generatedAt: new Date().toISOString(),
      totalBookmarks: 0,
      model: provider.name,
    };
  }

  const language = detectLanguage(bookmarks);
  const rows = compactBookmarks(bookmarks);
  const folderDepth = options.folderDepth === 2 ? 2 : 1;
  const topLevelFolderLimit = Number.isFinite(options.topLevelFolderLimit)
    ? Math.min(Math.max(Math.round(options.topLevelFolderLimit!), 3), 50)
    : 10;

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

  const systemPrompt = `You design personalized bookmark folder taxonomies. You will see a user's entire bookmark library and propose a concise taxonomy that fits THIS user's actual content. Categories are folder paths, not tags. Categories must:
- Be specific to the bookmarks provided, not generic ("Tools", "Articles", "Misc" are forbidden)
- Never use catch-all names such as "Other", "Other Bookmarks", "Uncategorized", "其他", "其他书签", "杂项", or "未分类" as categories
- Cover the whole library (every bookmark must fit somewhere or in the fallback)
- Be roughly balanced — avoid one giant catch-all
- Use clear, short names (1-4 words)
- Respect folderDepth=${folderDepth}: ${folderDepth === 1 ? 'category names must be single top-level folder names without "/"' : 'category names may be "Top" or "Top/Sub", but use at most two levels and prefer one level unless a subfolder clearly helps'}
- The number of distinct top-level folders must be <= ${topLevelFolderLimit}
- When folderDepth=2, subfolders have no separate count limit; the limit applies only to top-level folders
- Prefer existing folder names from Top original folders when they are meaningful and specific
- ${langDirective}

Return ONLY a JSON object, no prose, no markdown, no <think> tags:
{
  "categories": [
    {"name": "...", "description": "what kind of bookmark goes here (1 sentence)", "examples": ["short example title or domain", "another"]}
  ],
  "fallback": "Needs Review"
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

  const cleaned = extractJson(raw);
  let parsed: { categories?: BookmarkCategory[]; fallback?: string };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`AI taxonomy returned invalid JSON: ${cleaned.slice(0, 200)}`);
  }

  if (!parsed.categories || !Array.isArray(parsed.categories) || parsed.categories.length === 0) {
    throw new Error('AI taxonomy returned no categories');
  }

  const topLevelSeen = new Set<string>();
  const categories = parsed.categories
    .map((c) => {
      const normalizedName = normalizeCategoryName(String(c.name ?? ''), folderDepth);
      return {
        name: normalizedName,
        description: String(c.description ?? '').trim(),
        examples: Array.isArray(c.examples) ? c.examples.slice(0, 5).map(String) : [],
      };
    })
    .filter((c) => {
      if (!c.name || isLowValueFolderPath(c.name)) return false;
      const topLevel = c.name.split('/')[0];
      if (!topLevel) return false;
      if (!topLevelSeen.has(topLevel) && topLevelSeen.size >= topLevelFolderLimit) return false;
      topLevelSeen.add(topLevel);
      return true;
    });

  return {
    categories,
    fallback: parsed.fallback ?? (language === 'zh' ? '待人工确认' : 'Needs Review'),
    language,
    generatedAt: new Date().toISOString(),
    totalBookmarks: bookmarks.length,
    model: provider.name,
  };
}

function normalizeCategoryName(name: string, folderDepth: 1 | 2): string {
  const parts = name
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return '';
  return folderDepth === 1 ? parts[0]! : parts.slice(0, 2).join('/');
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

Output format (return ONLY the JSON array, no prose, no <think> tags):
[{"i":0,"c":"<category name>","p":0.92}, ...]
- "i" is the input index
- "c" must be one of the category names verbatim (or "${fallback}")
- "p" is your confidence 0-1`,
    },
    { role: 'user', content: JSON.stringify(rows, null, 0) },
  ]);

  const cleaned = extractJson(raw);
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
