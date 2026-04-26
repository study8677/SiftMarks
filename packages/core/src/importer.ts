import { readFileSync } from 'node:fs';
import { SiftMarksDB } from '@siftmarks/db';
import {
  generateId,
  normalizeUrl,
  nowISO,
  type Bookmark,
  type Folder,
  type ImportResult,
  type ParsedBookmark,
} from '@siftmarks/shared';
import { parseBookmarkHTML } from './parser.js';

export function importFromFile(filePath: string, db: SiftMarksDB): ImportResult {
  const html = readFileSync(filePath, 'utf-8');
  const parsed = parseBookmarkHTML(html);
  return importBookmarks(parsed, db);
}

export function importBookmarks(parsed: ParsedBookmark[], db: SiftMarksDB): ImportResult {
  let imported = 0;
  let duplicates = 0;
  let skipped = 0;
  let missingTitles = 0;
  const folderPaths = new Set<string>();
  const now = nowISO();

  db.transaction(() => {
    for (const pb of parsed) {
      const normalized = normalizeUrl(pb.url);

      // Check if this exact URL already exists
      const existing = db.getBookmarkByNormalizedUrl(normalized);
      if (existing) {
        duplicates++;
        // Mark existing as duplicate if not already
        if (!existing.isDuplicate) {
          const groupId = existing.duplicateGroupId || generateId();
          db.updateBookmark(existing.id, {
            isDuplicate: true,
            duplicateGroupId: groupId,
          });
        }
        // Update chrome_id if we have one and existing doesn't
        if (pb.chromeId && !existing.chromeId) {
          db.updateBookmark(existing.id, {
            chromeId: pb.chromeId,
            chromeParentId: pb.chromeParentId ?? null,
          } as any);
        }
        continue;
      }

      if (!pb.title || pb.title.trim() === '') {
        missingTitles++;
      }

      // Track folder
      if (pb.folderPath) {
        folderPaths.add(pb.folderPath);
      }

      const bookmark: Bookmark = {
        id: generateId(),
        url: pb.url,
        normalizedUrl: normalized,
        title: pb.title || null,
        originalTitle: pb.title || null,
        description: null,
        contentText: null,
        summary: null,
        folderPath: pb.folderPath || null,
        faviconUrl: pb.icon || null,
        status: 'unchecked',
        httpStatus: null,
        isDuplicate: false,
        duplicateGroupId: null,
        createdAt: pb.createdAt,
        importedAt: now,
        updatedAt: now,
        lastCheckedAt: null,
        lastIndexedAt: null,
        source: pb.chromeId ? 'extension' : 'import',
        chromeId: pb.chromeId ?? null,
        chromeParentId: pb.chromeParentId ?? null,
      };

      db.insertBookmark(bookmark);
      imported++;
    }

    // Insert folders
    for (const path of folderPaths) {
      const parts = path.split('/');
      const name = parts[parts.length - 1] ?? path;
      const parentPath = parts.length > 1 ? parts.slice(0, -1).join('/') : null;

      db.insertFolder({
        id: generateId(),
        path,
        name,
        parentPath,
        createdAt: now,
      });

      // Ensure parent folders exist too
      for (let i = 1; i < parts.length; i++) {
        const subPath = parts.slice(0, i).join('/');
        const subName = parts[i - 1]!;
        const subParent = i > 1 ? parts.slice(0, i - 1).join('/') : null;
        folderPaths.add(subPath); // track but don't re-insert via Set
        db.insertFolder({
          id: generateId(),
          path: subPath,
          name: subName,
          parentPath: subParent,
          createdAt: now,
        });
      }
    }
  });

  return {
    imported,
    folders: folderPaths.size,
    duplicates,
    skipped,
    missingTitles,
  };
}
