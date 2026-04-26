import { writeFileSync } from 'node:fs';
import { SiftMarksDB } from '@siftmarks/db';

export interface ExportData {
  version: string;
  exportedAt: string;
  bookmarks: any[];
  tags: any[];
  folders: any[];
  suggestions: any[];
}

export function exportToJSON(db: SiftMarksDB, outputPath: string): ExportData {
  const { items: bookmarks } = db.listBookmarks({ limit: 100000 });
  const tags = db.listTags();
  const folders = db.listFolders();
  const { items: suggestions } = db.listSuggestions({ limit: 100000 });

  // Enrich bookmarks with tags
  const enrichedBookmarks = bookmarks.map((b) => ({
    ...b,
    tags: db.getBookmarkTags(b.id).map((t) => ({
      name: t.name,
      source: t.source,
      confidence: t.confidence,
    })),
  }));

  const data: ExportData = {
    version: '0.1.0',
    exportedAt: new Date().toISOString(),
    bookmarks: enrichedBookmarks,
    tags,
    folders,
    suggestions,
  };

  writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf-8');
  return data;
}
