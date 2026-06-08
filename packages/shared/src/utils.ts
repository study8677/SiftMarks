import { randomUUID } from 'node:crypto';

export function generateId(): string {
  return randomUUID();
}

export function nowISO(): string {
  return new Date().toISOString();
}

// URL normalization: remove tracking params, normalize scheme/host/path
const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'ref',
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
  'source',
  'spm',
]);

export function normalizeUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);

    // Lowercase hostname
    url.hostname = url.hostname.toLowerCase();

    // Remove tracking params
    for (const param of TRACKING_PARAMS) {
      url.searchParams.delete(param);
    }

    // Sort remaining params
    url.searchParams.sort();

    // Remove empty search params
    const keysToDelete: string[] = [];
    url.searchParams.forEach((value, key) => {
      if (value === '') keysToDelete.push(key);
    });
    for (const key of keysToDelete) {
      url.searchParams.delete(key);
    }

    // Remove trailing slash from pathname (except root)
    if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
      url.pathname = url.pathname.slice(0, -1);
    }

    // Remove fragment
    url.hash = '';

    // Normalize to https if http
    if (url.protocol === 'http:') {
      url.protocol = 'https:';
    }

    return url.toString();
  } catch {
    return rawUrl.toLowerCase().trim();
  }
}

// Normalize tag name to lowercase kebab-case
export function normalizeTagName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\-\s]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

const BOOKMARK_BAR_ROOTS = new Set([
  '书签栏',
  'Bookmarks Bar',
  'Bookmarks bar',
  'Bookmarks Toolbar',
]);

const OTHER_BOOKMARKS_ROOTS = new Set([
  '其他书签',
  'Other Bookmarks',
  'Other bookmarks',
]);

const MOBILE_BOOKMARKS_ROOTS = new Set([
  '移动设备书签',
  'Mobile Bookmarks',
  'Mobile bookmarks',
]);

const LOW_VALUE_FOLDER_KEYS = new Set([
  '',
  'bookmarks-bar',
  'other',
  'other-bookmarks',
  'misc',
  'miscellaneous',
  'uncategorized',
  'unclassified',
  'mobile-bookmarks',
  '其他',
  '其他书签',
  '杂项',
  '未分类',
  '待分类',
  '移动设备书签',
]);

export function normalizeFolderPath(path: string | null | undefined): string {
  if (!path) return '';

  const parts = path
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) return '';

  let normalized: string;

  if (BOOKMARK_BAR_ROOTS.has(parts[0]!)) {
    normalized = parts.slice(1).join('/');
  } else if (OTHER_BOOKMARKS_ROOTS.has(parts[0]!) || MOBILE_BOOKMARKS_ROOTS.has(parts[0]!)) {
    normalized = '';
  } else {
    normalized = parts.join('/');
  }

  return LOW_VALUE_FOLDER_KEYS.has(normalizeTagName(normalized)) ? '' : normalized;
}

export function isLowValueFolderPath(path: string | null | undefined): boolean {
  const normalized = normalizeTagName(normalizeFolderPath(path));
  return LOW_VALUE_FOLDER_KEYS.has(normalized);
}

export function cleanBookmarkSummary(
  summary: string | null | undefined,
  fallback?: string | null,
  maxLength = 180,
  context?: {
    title?: string | null;
    url?: string | null;
    folderPath?: string | null;
  }
): string | null {
  const candidates = [summary, fallback]
    .map((value) => stripAISummaryNoise(value))
    .filter((value): value is string => Boolean(value));

  const value = candidates[0];
  const chineseFallback = buildChineseOneLineSummary(context, value);
  if (!value) return chineseFallback ? truncateText(chineseFallback, maxLength) : null;
  if (!hasChinese(value) && chineseFallback) return truncateText(chineseFallback, maxLength);

  const sentence = firstSentence(value);
  return truncateText(sentence, maxLength);
}

export function extractJSONFromAIText(text: string): string {
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

function stripAISummaryNoise(value: string | null | undefined): string | null {
  if (!value) return null;

  const jsonText = extractJSONFromAIText(value);
  try {
    const parsed = JSON.parse(jsonText) as { shortSummary?: unknown; summary?: unknown };
    const parsedSummary = typeof parsed.shortSummary === 'string'
      ? parsed.shortSummary
      : typeof parsed.summary === 'string'
        ? parsed.summary
        : null;
    if (parsedSummary) return stripAISummaryNoise(parsedSummary);
  } catch {
    // Fall through to plain-text cleanup.
  }

  const cleaned = jsonText
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```(?:json)?\n?/gi, '')
    .replace(/```\n?/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned || cleaned.startsWith('{') || cleaned.startsWith('[')) return null;
  return cleaned;
}

function firstSentence(value: string): string {
  const match = value.match(/^(.{12,}?[。！？.!?])(?:\s|$)/);
  return match?.[1]?.trim() ?? value.trim();
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function hasChinese(value: string): boolean {
  return /[\u4e00-\u9fff]/.test(value);
}

function buildChineseOneLineSummary(
  context: {
    title?: string | null;
    url?: string | null;
    folderPath?: string | null;
  } | undefined,
  text?: string | null
): string | null {
  if (!context?.title && !context?.url) return null;

  const title = context.title?.trim() || '这个网页';
  let host = '';

  try {
    host = context.url ? new URL(context.url).hostname.replace(/^www\./, '').toLowerCase() : '';
  } catch {
    host = '';
  }

  const hostText = host ? `（${host}）` : '';
  return `${title}${hostText} 是已收藏网页，可结合标题、摘要和正文用于搜索找回。`;
}

// Check if a title is vague/meaningless. Covers both Latin-script and Chinese
// titles, since SiftMarks is bilingual and vague titles in either language
// are equally useless for memory-style search.
const VAGUE_TITLES = new Set([
  '',
  'untitled',
  'home',
  'homepage',
  'index',
  'docs',
  'documentation',
  'github',
  'welcome',
  'about',
  'page',
  'new tab',
  'sign in',
  'sign up',
  'log in',
  'login',
  'register',
  'dashboard',
  'main',
  'overview',
  // Chinese
  '首页',
  '主页',
  '登录',
  '注册',
  '登入',
  '登录页',
  '无标题',
  '未命名',
  '新标签页',
  '欢迎',
  '关于',
  '关于我们',
  '百度一下',
  '百度一下，你就知道',
  '文档',
  '帮助',
  '后台',
  '控制台',
  '管理后台',
  '页面',
]);

export function isVagueTitle(title: string | null): boolean {
  if (!title) return true;
  return VAGUE_TITLES.has(title.trim().toLowerCase());
}

// Format number with commas
export function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

// Truncate string
export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}
