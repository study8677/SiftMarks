import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { getAIProvider } from '@/lib/ai';
import {
  DEFAULT_SETTINGS,
  extractJSONFromAIText,
  generateId,
  isLowValueFolderPath,
  normalizeFolderPath,
  normalizeUrl,
  nowISO,
  type Bookmark,
} from '@siftmarks/shared';

function isSaveableUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function clampTopLevelFolderLimit(value: number): number {
  return Number.isFinite(value)
    ? Math.min(Math.max(Math.round(value), 3), 50)
    : DEFAULT_SETTINGS.topLevelFolderLimit;
}

function insertFolderChain(db: ReturnType<typeof getDB>, folderPath: string, now: string): void {
  const path = normalizeFolderPath(folderPath);
  if (!path || isLowValueFolderPath(path)) return;

  const parts = path.split('/').filter(Boolean);
  for (let i = 1; i <= parts.length; i++) {
    const currentPath = parts.slice(0, i).join('/');
    const name = parts[i - 1] ?? currentPath;
    const parentPath = i > 1 ? parts.slice(0, i - 1).join('/') : null;
    db.insertFolder({
      id: generateId(),
      path: currentPath,
      name,
      parentPath,
      createdAt: now,
    });
  }
}

async function classifyFolder(bookmark: Bookmark): Promise<{ folderPath: string | null; reason: string | null; confidence: number | null }> {
  const db = getDB();
  const provider = getAIProvider();
  if (provider.name === 'mock') return { folderPath: null, reason: null, confidence: null };

  const folders = db
    .listFolders()
    .map((folder) => folder.path)
    .filter((path) => !isLowValueFolderPath(path));
  const folderDepth = db.getSetting('folderDepth') === '2' ? 2 : 1;
  const topLevelFolderLimit = clampTopLevelFolderLimit(Number(db.getSetting('topLevelFolderLimit')));
  const topLevelFolders = new Set(folders.map((folder) => folder.split('/')[0]).filter(Boolean));

  let response: string;
  try {
    response = await provider.chat([
      {
        role: 'system',
        content: `你是本地 AI 书签管家，负责把新收藏网页归入文件夹。文件夹是主分类，标签只是辅助检索。

规则：
- 先从 EXISTING_FOLDERS 里选择最合适的文件夹。
- 只有现有文件夹都不合适时，才基于网页证据建议一个新的用户可读文件夹。
- 不能使用 Other、Other Bookmarks、Misc、Uncategorized、其他、其他书签、杂项、未分类。
- 不要使用硬编码站点规则，要根据标题、URL、摘要和已有文件夹判断。
- folderDepth=1 时 folderPath 必须是一级文件夹，不允许包含 "/"。
- folderDepth=2 时最多两级，可以是 "一级/二级"，但只有确实有帮助时才用二级。
- 一级文件夹数量不能超过 topLevelFolderLimit；达到上限后必须选已有一级文件夹，不能新增一级。
- 如果无法自信归类，返回 {"folderPath": null, "reason": "...", "confidence": 0}。

只返回 JSON：{"folderPath":"文件夹名或一级/二级","reason":"简短原因","confidence":0.8}`,
      },
      {
        role: 'user',
        content: JSON.stringify({
          existingFolders: folders,
          folderPolicy: {
            folderDepth,
            topLevelFolderLimit,
            currentTopLevelFolders: Array.from(topLevelFolders),
          },
          bookmark: {
            title: bookmark.title,
            url: bookmark.url,
            summary: bookmark.summary,
            description: bookmark.description,
          },
        }),
      },
    ]);
  } catch {
    return { folderPath: null, reason: 'AI classification failed.', confidence: null };
  }

  let parsed: { folderPath?: unknown; reason?: unknown; confidence?: unknown };
  try {
    parsed = JSON.parse(extractJSONFromAIText(response)) as typeof parsed;
  } catch {
    return { folderPath: null, reason: null, confidence: null };
  }

  const folderPath = normalizeFolderPath(String(parsed.folderPath ?? ''));
  if (!folderPath || isLowValueFolderPath(folderPath)) {
    return { folderPath: null, reason: typeof parsed.reason === 'string' ? parsed.reason : null, confidence: 0 };
  }
  if (folderDepth === 1 && folderPath.includes('/')) {
    return { folderPath: null, reason: 'AI returned a two-level folder while one-level mode is enabled.', confidence: 0 };
  }
  if (folderDepth === 2 && folderPath.split('/').filter(Boolean).length > 2) {
    return { folderPath: null, reason: 'AI returned a folder path deeper than two levels.', confidence: 0 };
  }

  const topLevel = folderPath.split('/')[0];
  if (topLevel && !topLevelFolders.has(topLevel) && topLevelFolders.size >= topLevelFolderLimit) {
    return { folderPath: null, reason: 'Top-level folder limit reached.', confidence: 0 };
  }

  return {
    folderPath,
    reason: typeof parsed.reason === 'string' ? parsed.reason : null,
    confidence: typeof parsed.confidence === 'number' ? Math.min(Math.max(parsed.confidence, 0), 1) : 0.75,
  };
}

export async function POST(request: Request) {
  const body = await request.json();
  const { url, title, faviconUrl, chromeId, chromeParentId, createdAt } = body;
  const folderPath = normalizeFolderPath(body.folderPath);

  if (!url) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 });
  }
  if (!isSaveableUrl(url)) {
    return NextResponse.json({ error: 'Only http/https pages can be saved' }, { status: 400 });
  }

  const db = getDB();
  const normalized = normalizeUrl(url);
  const existing = db.getBookmarkByNormalizedUrl(normalized);
  const now = nowISO();

  if (existing) {
    const updates: Partial<Bookmark> = {};
    if (!existing.chromeId && chromeId) updates.chromeId = String(chromeId);
    if (!existing.chromeParentId && chromeParentId) updates.chromeParentId = String(chromeParentId);
    if (!existing.folderPath && folderPath) updates.folderPath = folderPath;
    if (!existing.faviconUrl && faviconUrl) updates.faviconUrl = String(faviconUrl);

    let classification: Awaited<ReturnType<typeof classifyFolder>> | null = null;
    if (!updates.folderPath && !existing.folderPath) {
      classification = await classifyFolder(existing);
      if (classification.folderPath) updates.folderPath = classification.folderPath;
    }

    if (Object.keys(updates).length > 0) {
      db.updateBookmark(existing.id, updates);
      if (updates.folderPath) insertFolderChain(db, updates.folderPath, now);
    }

    const updated = db.getBookmarkById(existing.id) ?? existing;
    const tags = db.getBookmarkTags(existing.id).map((t) => t.name);
    return NextResponse.json({
      id: existing.id,
      status: 'already_exists',
      bookmark: { ...updated, tags },
      classification,
    });
  }

  const id = generateId();

  const bookmark: Bookmark = {
    id,
    url,
    normalizedUrl: normalized,
    title: title ?? null,
    originalTitle: title ?? null,
    description: null,
    contentText: null,
    summary: null,
    folderPath: folderPath || null,
    faviconUrl: faviconUrl ?? null,
    status: 'unchecked',
    httpStatus: null,
    isDuplicate: false,
    duplicateGroupId: null,
    createdAt: createdAt ?? now,
    importedAt: now,
    updatedAt: now,
    lastCheckedAt: null,
    lastIndexedAt: null,
    source: 'extension',
    chromeId: chromeId ?? null,
    chromeParentId: chromeParentId ?? null,
  };

  let classification: Awaited<ReturnType<typeof classifyFolder>> | null = null;
  if (!bookmark.folderPath) {
    classification = await classifyFolder(bookmark);
    if (classification.folderPath) {
      bookmark.folderPath = classification.folderPath;
    }
  }

  db.insertBookmark(bookmark);
  if (bookmark.folderPath) insertFolderChain(db, bookmark.folderPath, now);

  // Index FTS
  db.indexBookmarkFTS(bookmark, []);

  return NextResponse.json({ id, status: 'saved', bookmark: { ...bookmark, tags: [] }, classification });
}
