import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, platform } from 'node:os';
import type { ParsedBookmark } from '@siftmarks/shared';

interface ChromeProfile {
  name: string;
  path: string;
  bookmarkCount: number;
}

/**
 * Detect Chrome bookmark files on the local machine.
 */
export function detectChromeProfiles(): ChromeProfile[] {
  const home = homedir();
  const os = platform();
  const profiles: ChromeProfile[] = [];

  let chromeDir: string;
  if (os === 'darwin') {
    chromeDir = join(home, 'Library', 'Application Support', 'Google', 'Chrome');
  } else if (os === 'win32') {
    chromeDir = join(home, 'AppData', 'Local', 'Google', 'Chrome', 'User Data');
  } else {
    chromeDir = join(home, '.config', 'google-chrome');
  }

  if (!existsSync(chromeDir)) return profiles;

  // Check Default profile and numbered profiles
  const candidates = ['Default'];
  try {
    const entries = readdirSync(chromeDir);
    for (const entry of entries) {
      if (entry.startsWith('Profile ')) {
        candidates.push(entry);
      }
    }
  } catch {
    // ignore
  }

  for (const profile of candidates) {
    const bookmarkPath = join(chromeDir, profile, 'Bookmarks');
    if (existsSync(bookmarkPath)) {
      try {
        const data = JSON.parse(readFileSync(bookmarkPath, 'utf-8'));
        const count = countBookmarks(data.roots);
        profiles.push({
          name: profile,
          path: bookmarkPath,
          bookmarkCount: count,
        });
      } catch {
        // corrupt file, skip
      }
    }
  }

  // Also check Edge, Brave (same format)
  const otherBrowsers: Array<{ name: string; dir: string }> = [];

  if (os === 'darwin') {
    otherBrowsers.push(
      { name: 'Edge', dir: join(home, 'Library', 'Application Support', 'Microsoft Edge') },
      { name: 'Brave', dir: join(home, 'Library', 'Application Support', 'BraveSoftware', 'Brave-Browser') },
      { name: 'Arc', dir: join(home, 'Library', 'Application Support', 'Arc', 'User Data') },
    );
  } else if (os === 'win32') {
    otherBrowsers.push(
      { name: 'Edge', dir: join(home, 'AppData', 'Local', 'Microsoft', 'Edge', 'User Data') },
      { name: 'Brave', dir: join(home, 'AppData', 'Local', 'BraveSoftware', 'Brave-Browser', 'User Data') },
    );
  } else {
    otherBrowsers.push(
      { name: 'Edge', dir: join(home, '.config', 'microsoft-edge') },
      { name: 'Brave', dir: join(home, '.config', 'BraveSoftware', 'Brave-Browser') },
    );
  }

  for (const browser of otherBrowsers) {
    if (!existsSync(browser.dir)) continue;
    const bookmarkPath = join(browser.dir, 'Default', 'Bookmarks');
    if (existsSync(bookmarkPath)) {
      try {
        const data = JSON.parse(readFileSync(bookmarkPath, 'utf-8'));
        const count = countBookmarks(data.roots);
        profiles.push({
          name: `${browser.name}`,
          path: bookmarkPath,
          bookmarkCount: count,
        });
      } catch {
        // skip
      }
    }
  }

  return profiles;
}

function countBookmarks(roots: any): number {
  let count = 0;
  function walk(node: any) {
    if (node.type === 'url') count++;
    if (node.children) {
      for (const child of node.children) walk(child);
    }
  }
  for (const key of Object.keys(roots)) {
    walk(roots[key]);
  }
  return count;
}

/**
 * Parse Chrome's native JSON bookmark format into ParsedBookmark[].
 */
export function parseChromeJSON(filePath: string): ParsedBookmark[] {
  const raw = readFileSync(filePath, 'utf-8');
  const data = JSON.parse(raw);
  const bookmarks: ParsedBookmark[] = [];

  function walk(node: any, folderStack: string[]) {
    if (node.type === 'url' && node.url) {
      if (node.url.startsWith('javascript:') || node.url.startsWith('data:') || node.url.startsWith('chrome:')) {
        return;
      }

      let createdAt: string | null = null;
      if (node.date_added) {
        // Chrome uses Windows FILETIME: microseconds since 1601-01-01
        const chromeEpoch = BigInt(node.date_added);
        const unixMicro = chromeEpoch - 11644473600000000n;
        const ms = Number(unixMicro / 1000n);
        if (ms > 0 && ms < 4102444800000) { // sanity: before 2100
          createdAt = new Date(ms).toISOString();
        }
      }

      bookmarks.push({
        title: node.name || '',
        url: node.url,
        folderPath: folderStack.length > 0 ? folderStack.join('/') : '',
        createdAt,
        icon: null,
        chromeId: node.id ?? undefined,
      });
    }

    if (node.children) {
      const newStack = node.name ? [...folderStack, node.name] : folderStack;
      for (const child of node.children) {
        walk(child, newStack);
      }
    }
  }

  const roots = data.roots;
  for (const key of Object.keys(roots)) {
    walk(roots[key], []);
  }

  return bookmarks;
}
