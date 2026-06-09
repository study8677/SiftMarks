import type { AIProvider } from './provider.js';
import type { Bookmark } from '@siftmarks/shared';

export interface AIRescueSuggestion {
  bookmarkId: string;
  type: 'rename' | 'move';
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
  onProgress?: (done: number, total: number) => void,
  options: { folders?: string[]; folderDepth?: 1 | 2; topLevelFolderLimit?: number } = {}
): Promise<AIRescueSuggestion[]> {
  const allSuggestions: AIRescueSuggestion[] = [];
  const batchSize = 15;
  const folders = options.folders ?? [];
  const folderDepth = options.folderDepth === 2 ? 2 : 1;
  const topLevelFolderLimit = Number.isFinite(options.topLevelFolderLimit)
    ? Math.min(Math.max(Math.round(options.topLevelFolderLimit!), 3), 50)
    : 10;

  for (let i = 0; i < bookmarks.length; i += batchSize) {
    const batch = bookmarks.slice(i, i + batchSize);
    onProgress?.(i, bookmarks.length);

    try {
      const suggestions = await analyzeBookmarkBatch(provider, batch, folders, folderDepth, topLevelFolderLimit);
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
  bookmarks: Bookmark[],
  folders: string[],
  folderDepth: 1 | 2,
  topLevelFolderLimit: number
): Promise<AIRescueSuggestion[]> {
  const bookmarkList = bookmarks.map((b, i) => ({
    idx: i,
    id: b.id,
    title: b.title ?? '(empty)',
    url: b.url,
    folder: b.folderPath ?? '(none)',
    status: b.status,
    summary: b.summary ?? '',
    description: b.description ?? '',
    contentPreview: b.contentText?.slice(0, 1200) ?? '',
  }));
  const topLevelFolders = Array.from(new Set(folders.map((folder) => folder.split('/')[0]).filter(Boolean)));

  const prompt = `You are a bookmark governance assistant. Analyze these bookmarks and suggest reviewable improvements.

EXISTING_FOLDERS:
${JSON.stringify(folders, null, 1)}

FOLDER_POLICY:
${JSON.stringify({
  folderDepth,
  topLevelFolderLimit,
  currentTopLevelFolders: topLevelFolders,
}, null, 1)}

BOOKMARKS:
${JSON.stringify(bookmarkList, null, 1)}

For each bookmark that needs improvement, return a JSON array of suggestions. Types:
- "rename": if the title is vague, empty, or unclear. Suggest a descriptive title grounded in the page content, summary, description, or URL.
- "move": for bookmarks in no folder or a browser catch-all folder. First choose the best folder from EXISTING_FOLDERS. If none fit, propose a concise new folder name grounded in the bookmark evidence. Folder names must be user-facing categories, not tags.

Folder rules:
- Never use "Other", "Other Bookmarks", "Misc", "Uncategorized", "其他", "其他书签", "杂项", or "未分类" as a target folder.
- Do not use hardcoded examples. Infer the folder from title, URL, summary, contentPreview, and the existing folder list.
- If folderDepth is 1, target folderPath must be a single folder name without "/".
- If folderDepth is 2, target folderPath may be "Top/Sub", but prefer one level unless a second level clearly helps.
- Do not exceed topLevelFolderLimit top-level folders. If the top-level limit is already reached, choose an existing top-level folder or skip the move.
- When folderDepth is 2, there is no separate subfolder count limit; only top-level folders are capped.
- If no confident folder can be chosen or proposed, skip the move suggestion.

Only include bookmarks that actually need changes. Skip ones that are already well-organized. If contentPreview and summary are empty, be conservative and use URL/title evidence.

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
    "idx": 2,
    "type": "move",
    "after": {"folderPath": "<existing or AI-proposed folder>"},
    "reason": "Can be classified from page evidence",
    "confidence": 0.7
  }
]

If no improvements needed, return [].`;

  const response = await (provider as any).chat([
    { role: 'system', content: 'You are a local-first bookmark governance AI. Return only valid JSON arrays. Suggestions must be reviewable and grounded in the supplied page evidence.' },
    { role: 'user', content: prompt },
  ]);

  try {
    const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned) as Array<{
      idx: number;
      type: 'rename' | 'move';
      after: Record<string, any>;
      reason: string;
      confidence: number;
    }>;

    return parsed
      .filter((s) => s.idx >= 0 && s.idx < bookmarks.length && (s.type === 'rename' || s.type === 'move'))
      .map((s) => {
        const bm = bookmarks[s.idx]!;
        let before: Record<string, any> = {};

        if (s.type === 'rename') {
          before = { title: bm.title };
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
