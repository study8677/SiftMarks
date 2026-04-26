// Bookmark status
export type BookmarkStatus =
  | 'unchecked'
  | 'ok'
  | 'broken'
  | 'redirected'
  | 'duplicate'
  | 'archived'
  | 'deleted';

// HTTP check result
export type LinkCheckStatus =
  | 'ok'
  | 'redirected'
  | 'client_error'
  | 'server_error'
  | 'timeout'
  | 'dns_error'
  | 'ssl_error'
  | 'unknown_error';

// Cleanup suggestion types
export type CleanupType =
  | 'rename'
  | 'tag'
  | 'move'
  | 'merge_duplicate'
  | 'delete_broken'
  | 'merge_folder'
  | 'normalize_tag';

export type CleanupStatus = 'pending' | 'accepted' | 'dismissed' | 'synced';

export type TagSource = 'ai' | 'user' | 'import';

export type BookmarkSource = 'import' | 'manual' | 'mcp' | 'extension';

// Core bookmark type
export interface Bookmark {
  id: string;
  url: string;
  normalizedUrl: string;
  title: string | null;
  originalTitle: string | null;
  description: string | null;
  contentText: string | null;
  summary: string | null;
  folderPath: string | null;
  faviconUrl: string | null;
  status: BookmarkStatus;
  httpStatus: number | null;
  isDuplicate: boolean;
  duplicateGroupId: string | null;
  createdAt: string | null;
  importedAt: string;
  updatedAt: string;
  lastCheckedAt: string | null;
  lastIndexedAt: string | null;
  source: BookmarkSource;
  chromeId: string | null;
  chromeParentId: string | null;
}

export interface Tag {
  id: string;
  name: string;
  normalizedName: string;
  createdAt: string;
}

export interface BookmarkTag {
  bookmarkId: string;
  tagId: string;
  source: TagSource;
  confidence: number | null;
}

export interface Folder {
  id: string;
  path: string;
  name: string;
  parentPath: string | null;
  createdAt: string;
}

export interface CleanupSuggestion {
  id: string;
  type: CleanupType;
  status: CleanupStatus;
  bookmarkId: string | null;
  targetBookmarkId: string | null;
  beforeJson: string;
  afterJson: string;
  reason: string | null;
  confidence: number | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface Embedding {
  id: string;
  bookmarkId: string;
  model: string;
  vectorJson: string;
  contentHash: string;
  createdAt: string;
}

export interface AppSetting {
  key: string;
  value: string;
  updatedAt: string;
}

// Import result
export interface ImportResult {
  imported: number;
  folders: number;
  duplicates: number;
  skipped: number;
  missingTitles: number;
}

// Parsed bookmark from HTML
export interface ParsedBookmark {
  title: string;
  url: string;
  folderPath: string;
  createdAt: string | null;
  icon: string | null;
  chromeId?: string;
  chromeParentId?: string;
}

// Stats
export interface BookmarkStats {
  bookmarks: number;
  folders: number;
  tags: number;
  duplicates: number;
  broken: number;
  missingSummaries: number;
  missingTags: number;
}

// Search
export interface SearchResult {
  bookmark: Bookmark;
  score: number;
  matchReason: string;
  matchedFields: string[];
  tags: string[];
}

export interface SearchOptions {
  query: string;
  mode?: 'keyword' | 'memory';
  tag?: string;
  folder?: string;
  status?: BookmarkStatus;
  limit?: number;
  offset?: number;
}

// AI provider config
export interface AIProviderConfig {
  type: 'mock' | 'openai-compatible' | 'ollama-compatible';
  baseUrl?: string;
  apiKey?: string;
  chatModel?: string;
  embeddingModel?: string;
}

// AI task results
export interface AISummaryResult {
  shortSummary: string;
  summary: string;
}

export interface AITagResult {
  tags: Array<{
    name: string;
    confidence: number;
  }>;
}

export interface AITitleResult {
  title: string;
  confidence: number;
}

// Cleanup PR view
export interface CleanupPR {
  id: string;
  suggestionsCount: number;
  duplicates: number;
  broken: number;
  renames: number;
  tags: number;
  folders: number;
  createdAt: string;
  suggestions: CleanupSuggestion[];
}

// App settings keys
export interface AppSettings {
  aiProvider: AIProviderConfig;
  enableContentFetching: boolean;
  enableBrokenLinkChecking: boolean;
  enableMcpServer: boolean;
  localOnlyMode: boolean;
  fetchConcurrency: number;
  fetchTimeout: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  aiProvider: { type: 'mock' },
  enableContentFetching: true,
  enableBrokenLinkChecking: true,
  enableMcpServer: false,
  localOnlyMode: true,
  fetchConcurrency: 5,
  fetchTimeout: 10000,
};

// AI-generated, per-user bookmark taxonomy
export interface BookmarkCategory {
  name: string;
  description: string;
  examples: string[];
}

export interface BookmarkTaxonomy {
  categories: BookmarkCategory[];
  fallback: string;
  language: 'zh' | 'en' | 'mixed';
  generatedAt: string;
  totalBookmarks: number;
  model: string;
}

export interface ClassifyProgress {
  phase: 'taxonomy-map' | 'taxonomy-reduce' | 'classify';
  done: number;
  total: number;
  errors: number;
}
