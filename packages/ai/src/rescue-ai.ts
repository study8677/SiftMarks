import type { AIProvider } from './provider.js';
import type { Bookmark } from '@siftmarks/shared';

export interface AIRescueSuggestion {
  bookmarkId: string;
  type: 'rename' | 'tag' | 'move';
  before: Record<string, any>;
  after: Record<string, any>;
  reason: string;
  confidence: number;
}

/**
 * Use LLM to analyze a batch of bookmarks and generate smart cleanup suggestions.
 * Sends bookmarks in batches to avoid token limits.
 */
export async function generateAIRescueSuggestions(
  provider: AIProvider,
  bookmarks: Bookmark[],
  onProgress?: (done: number, total: number) => void
): Promise<AIRescueSuggestion[]> {
  const allSuggestions: AIRescueSuggestion[] = [];
  const batchSize = 15;

  for (let i = 0; i < bookmarks.length; i += batchSize) {
    const batch = bookmarks.slice(i, i + batchSize);
    onProgress?.(i, bookmarks.length);

    try {
      const suggestions = await analyzeBookmarkBatch(provider, batch);
      allSuggestions.push(...suggestions);
    } catch (err) {
      console.error(`AI rescue batch failed at ${i}:`, err);
    }
  }

  onProgress?.(bookmarks.length, bookmarks.length);
  return allSuggestions;
}

async function analyzeBookmarkBatch(
  provider: AIProvider,
  bookmarks: Bookmark[]
): Promise<AIRescueSuggestion[]> {
  const bookmarkList = bookmarks.map((b, i) => ({
    idx: i,
    id: b.id,
    title: b.title ?? '(empty)',
    url: b.url,
    folder: b.folderPath ?? '(none)',
  }));

  const prompt = `You are a bookmark organizer. Analyze these bookmarks and suggest improvements.

BOOKMARKS:
${JSON.stringify(bookmarkList, null, 1)}

For each bookmark that needs improvement, return a JSON array of suggestions. Types:
- "rename": if the title is vague, empty, or unclear. Suggest a descriptive title based on the URL and context.
- "tag": suggest 3-5 relevant tags (lowercase kebab-case). Don't use generic words like "website","article","page".
- "move": if the current folder doesn't match the content, suggest a better folder path.

Only include bookmarks that actually need changes. Skip ones that are already well-organized.

Return ONLY a JSON array, no markdown:
[
  {
    "idx": 0,
    "type": "rename",
    "after": {"title": "Better Title Here"},
    "reason": "Title was vague",
    "confidence": 0.9
  },
  {
    "idx": 0,
    "type": "tag",
    "after": {"tags": ["ai", "code-editor", "developer-tools"]},
    "reason": "Auto-generated tags based on content",
    "confidence": 0.85
  },
  {
    "idx": 2,
    "type": "move",
    "after": {"folderPath": "AI/Tools"},
    "reason": "Better categorized under AI Tools",
    "confidence": 0.7
  }
]

If no improvements needed, return [].`;

  const response = await (provider as any).chat([
    { role: 'system', content: 'You are a bookmark organizer AI. Return only valid JSON arrays.' },
    { role: 'user', content: prompt },
  ]);

  try {
    const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned) as Array<{
      idx: number;
      type: 'rename' | 'tag' | 'move';
      after: Record<string, any>;
      reason: string;
      confidence: number;
    }>;

    return parsed
      .filter((s) => s.idx >= 0 && s.idx < bookmarks.length)
      .map((s) => {
        const bm = bookmarks[s.idx]!;
        let before: Record<string, any> = {};

        if (s.type === 'rename') {
          before = { title: bm.title };
        } else if (s.type === 'tag') {
          before = { tags: [] };
        } else if (s.type === 'move') {
          before = { folderPath: bm.folderPath };
        }

        return {
          bookmarkId: bm.id,
          type: s.type,
          before,
          after: s.after,
          reason: s.reason,
          confidence: s.confidence ?? 0.8,
        };
      });
  } catch {
    return [];
  }
}
