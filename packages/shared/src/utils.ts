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
    .replace(/[^a-z0-9\-\s]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
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
