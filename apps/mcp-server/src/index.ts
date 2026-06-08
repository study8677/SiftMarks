#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { SiftMarksDB } from '@siftmarks/db';
import {
  keywordSearch,
  hybridSearch,
  generateCleanupSuggestions,
  importBookmarks,
} from '@siftmarks/core';
import { createProvider } from '@siftmarks/ai';
import {
  generateId,
  normalizeUrl,
  normalizeTagName,
  nowISO,
  type AIProviderConfig,
  DEFAULT_SETTINGS,
} from '@siftmarks/shared';

const db = new SiftMarksDB();
db.initialize();

const configStr = db.getSetting('aiProvider');
const config: AIProviderConfig = configStr
  ? JSON.parse(configStr)
  : DEFAULT_SETTINGS.aiProvider;
const provider = createProvider(config);

const server = new McpServer({
  name: 'siftmarks',
  version: '0.1.0',
});

type SearchItem = ReturnType<typeof keywordSearch>[number];

function mergeSearchResults(primary: SearchItem[], secondary: SearchItem[], limit: number): SearchItem[] {
  const byId = new Map<string, SearchItem>();
  for (const result of [...primary, ...secondary]) {
    const existing = byId.get(result.bookmark.id);
    if (!existing || result.score > existing.score) {
      byId.set(result.bookmark.id, result);
    }
  }
  return [...byId.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

// Tool 1: search_bookmarks
server.tool(
  'search_bookmarks',
  'Search bookmarks by keyword or natural language query',
  {
    query: z.string().describe('Search query'),
    limit: z.number().optional().default(10).describe('Max results'),
  },
  async ({ query, limit }) => {
    let rewrittenQuery = query;
    let queryEmbedding: number[] | undefined;

    try {
      rewrittenQuery = await provider.rewriteSearchQuery(query);
      if (!rewrittenQuery.trim()) rewrittenQuery = query;
    } catch {
      rewrittenQuery = query;
    }

    try {
      queryEmbedding = await provider.generateEmbedding(`${query}\n${rewrittenQuery}`);
      if (queryEmbedding.length === 0) queryEmbedding = undefined;
    } catch {
      queryEmbedding = undefined;
    }

    const semanticResults = hybridSearch(db, { query, limit }, queryEmbedding);
    const keywordResults = rewrittenQuery === query
      ? []
      : keywordSearch(db, { query: rewrittenQuery, limit });
    const results = mergeSearchResults(semanticResults, keywordResults, limit);

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              results: results.map((r) => ({
                id: r.bookmark.id,
                title: r.bookmark.title,
                url: r.bookmark.url,
                summary: r.bookmark.summary ?? r.bookmark.description,
                tags: r.tags,
                score: Math.round(r.score * 100) / 100,
              })),
              mode: 'ai_search',
              rewrittenQuery,
              aiPowered: provider.name !== 'mock',
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// Tool 2: read_bookmark
server.tool(
  'read_bookmark',
  'Read full details of a specific bookmark',
  {
    id: z.string().describe('Bookmark ID'),
  },
  async ({ id }) => {
    const bookmark = db.getBookmarkById(id);
    if (!bookmark) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Bookmark not found' }) }],
      };
    }

    const tags = db.getBookmarkTags(id).map((t) => t.name);

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              id: bookmark.id,
              title: bookmark.title,
              url: bookmark.url,
              summary: bookmark.summary,
              description: bookmark.description,
              contentText: bookmark.contentText?.slice(0, 2000),
              tags,
              folderPath: bookmark.folderPath,
              status: bookmark.status,
              createdAt: bookmark.createdAt,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// Tool 3: list_tags
server.tool(
  'list_tags',
  'List all tags with bookmark counts',
  {},
  async () => {
    const tags = db.listTags();

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              tags: tags.map((t) => ({
                name: t.name,
                count: t.count,
              })),
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// Tool 4: list_folders
server.tool(
  'list_folders',
  'List all bookmark folders with counts',
  {},
  async () => {
    const folders = db.listFolders();

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              folders: folders.map((f) => ({
                path: f.path,
                count: f.count,
              })),
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// Tool 5: find_related_bookmarks
server.tool(
  'find_related_bookmarks',
  'Find bookmarks related to a given URL',
  {
    url: z.string().describe('URL to find related bookmarks for'),
    limit: z.number().optional().default(10).describe('Max results'),
  },
  async ({ url, limit }) => {
    // Search using URL-derived keywords
    const urlObj = new URL(url);
    const query = urlObj.pathname
      .split('/')
      .filter(Boolean)
      .join(' ')
      .replace(/[-_]/g, ' ');

    const results = keywordSearch(db, { query, limit });

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              results: results.map((r) => ({
                id: r.bookmark.id,
                title: r.bookmark.title,
                url: r.bookmark.url,
                reason: r.matchReason,
              })),
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// Tool 6: summarize_collection
server.tool(
  'summarize_collection',
  'Summarize a collection of bookmarks by tag or folder',
  {
    tag: z.string().optional().describe('Tag to summarize'),
    folder_path: z.string().optional().describe('Folder path to summarize'),
  },
  async ({ tag, folder_path }) => {
    const { items: bookmarks } = db.listBookmarks({
      tag: tag,
      folder: folder_path,
      limit: 50,
    });

    const titles = bookmarks
      .map((b) => b.title ?? b.url)
      .slice(0, 20)
      .join(', ');

    const allTags = new Set<string>();
    for (const b of bookmarks) {
      const tags = db.getBookmarkTags(b.id);
      tags.forEach((t) => allTags.add(t.name));
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              summary: `Collection of ${bookmarks.length} bookmarks${tag ? ` tagged "${tag}"` : ''}${folder_path ? ` in folder "${folder_path}"` : ''}. Topics include: ${titles.slice(0, 300)}`,
              count: bookmarks.length,
              topTags: Array.from(allTags).slice(0, 10),
              topBookmarks: bookmarks.slice(0, 5).map((b) => ({
                title: b.title,
                url: b.url,
                summary: b.summary,
              })),
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// Tool 7: save_bookmark
server.tool(
  'save_bookmark',
  'Save a new bookmark',
  {
    url: z.string().describe('URL to bookmark'),
    title: z.string().optional().describe('Bookmark title'),
    tags: z.array(z.string()).optional().describe('Tags to add'),
  },
  async ({ url, title, tags }) => {
    const normalized = normalizeUrl(url);
    const existing = db.getBookmarkByNormalizedUrl(normalized);

    if (existing) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              id: existing.id,
              status: 'already_exists',
              title: existing.title,
            }),
          },
        ],
      };
    }

    const now = nowISO();
    const id = generateId();

    db.insertBookmark({
      id,
      url,
      normalizedUrl: normalized,
      title: title ?? null,
      originalTitle: title ?? null,
      description: null,
      contentText: null,
      summary: null,
      folderPath: null,
      faviconUrl: null,
      status: 'unchecked',
      httpStatus: null,
      isDuplicate: false,
      duplicateGroupId: null,
      createdAt: now,
      importedAt: now,
      updatedAt: now,
      lastCheckedAt: null,
      lastIndexedAt: null,
      source: 'mcp',
      chromeId: null,
      chromeParentId: null,
    });

    if (tags) {
      const seenTagKeys = new Set<string>();
      for (const tagName of tags) {
        const normalizedName = normalizeTagName(tagName);
        if (!normalizedName || seenTagKeys.has(normalizedName)) continue;
        seenTagKeys.add(normalizedName);

        let tag = db.getTagByNormalizedName(normalizedName);
        if (!tag) {
          tag = {
            id: generateId(),
            name: tagName.toLowerCase(),
            normalizedName,
            createdAt: now,
          };
          db.insertTag(tag);
        }

        db.addBookmarkTag({
          bookmarkId: id,
          tagId: tag.id,
          source: 'user',
          confidence: 1.0,
        });
      }
    }

    return {
      content: [
        { type: 'text' as const, text: JSON.stringify({ id, status: 'saved' }) },
      ],
    };
  }
);

// Tool 8: run_bookmark_rescue
server.tool(
  'run_bookmark_rescue',
  'Run bookmark rescue scan and generate cleanup suggestions',
  {
    mode: z.enum(['dry_run', 'full']).optional().default('dry_run').describe('Run mode'),
  },
  async ({ mode }) => {
    const suggestions = generateCleanupSuggestions(db);

    const byType = new Map<string, number>();
    for (const s of suggestions) {
      byType.set(s.type, (byType.get(s.type) ?? 0) + 1);
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              suggestions_count: suggestions.length,
              duplicates: byType.get('merge_duplicate') ?? 0,
              broken: byType.get('delete_broken') ?? 0,
              classification_suggestions: byType.get('move') ?? 0,
              renames: byType.get('rename') ?? 0,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// Tool 9: get_bookmark_stats
server.tool(
  'get_bookmark_stats',
  'Get bookmark library statistics',
  {},
  async () => {
    const stats = db.getStats();

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(stats, null, 2),
        },
      ],
    };
  }
);

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
