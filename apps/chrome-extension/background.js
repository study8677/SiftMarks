// SiftMarks Chrome Extension - Background Service Worker

const API_BASE = 'http://localhost:4399';
const DAILY_SCAN_ALARM = 'siftmarks-daily-scan';
const DAILY_SCAN_HOUR = 8;

function applyBookmarkActionIcon() {
  try {
    const result = chrome.action?.setIcon?.({
      path: {
        16: 'icons/icon16.png',
        48: 'icons/icon48.png',
        128: 'icons/icon128.png',
      },
    });
    if (result && typeof result.catch === 'function') result.catch(() => {});
  } catch {
    // Chrome may ignore icon refreshes until the unpacked extension is reloaded.
  }
}

applyBookmarkActionIcon();

function nextDailyScanTime() {
  const next = new Date();
  next.setHours(DAILY_SCAN_HOUR, 0, 0, 0);
  if (next.getTime() <= Date.now()) {
    next.setDate(next.getDate() + 1);
  }
  return next.getTime();
}

function ensureDailyScanAlarm() {
  chrome.alarms.get(DAILY_SCAN_ALARM, (alarm) => {
    if (alarm) return;
    chrome.alarms.create(DAILY_SCAN_ALARM, {
      when: nextDailyScanTime(),
      periodInMinutes: 24 * 60,
    });
  });
}

ensureDailyScanAlarm();

chrome.runtime.onInstalled.addListener(() => {
  applyBookmarkActionIcon();
  chrome.alarms.clear(DAILY_SCAN_ALARM, ensureDailyScanAlarm);
});

chrome.runtime.onStartup.addListener(() => {
  applyBookmarkActionIcon();
  ensureDailyScanAlarm();
});

// --- Chrome bookmark helpers ---

function flattenBookmarks(nodes, folderPath = '') {
  const results = [];
  for (const node of nodes) {
    if (node.url) {
      if (node.url.startsWith('javascript:') || node.url.startsWith('data:') || node.url.startsWith('chrome:')) continue;
      results.push({
        title: node.title || '',
        url: node.url,
        folderPath,
        createdAt: node.dateAdded ? new Date(node.dateAdded).toISOString() : null,
        icon: null,
        chromeId: node.id,
        chromeParentId: node.parentId || null,
      });
    }
    if (node.children) {
      const newPath = folderPath ? `${folderPath}/${node.title}` : node.title;
      results.push(...flattenBookmarks(node.children, newPath));
    }
  }
  return results;
}

async function getAllBookmarks() {
  return new Promise((resolve) => {
    chrome.bookmarks.getTree((tree) => resolve(flattenBookmarks(tree)));
  });
}

// --- API calls ---

async function importToSiftMarks(bookmarks) {
  const r = await fetch(`${API_BASE}/api/extension/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookmarks }),
  });
  if (!r.ok) throw new Error(`Import failed: ${r.status}`);
  return r.json();
}

async function getStats() {
  const r = await fetch(`${API_BASE}/api/stats`);
  if (!r.ok) throw new Error('Failed');
  return r.json();
}

async function searchBookmarks(query) {
  const r = await fetch(`${API_BASE}/api/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, mode: 'keyword', limit: 8 }),
  });
  if (!r.ok) throw new Error('Search failed');
  return r.json();
}

async function saveCurrentTab(tab) {
  if (!isSaveablePageUrl(tab?.url)) {
    throw new Error('当前页面不是可保存的普通网页');
  }
  const chromeBookmark = await findChromeBookmarkForUrl(tab.url);
  const r = await fetch(`${API_BASE}/api/extension/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: tab.url,
      title: tab.title,
      faviconUrl: tab.favIconUrl ?? null,
      folderPath: chromeBookmark?.folderPath ?? null,
      chromeId: chromeBookmark?.chromeId ?? null,
      chromeParentId: chromeBookmark?.chromeParentId ?? null,
      createdAt: chromeBookmark?.createdAt ?? null,
    }),
  });
  if (!r.ok) throw new Error('Save failed');
  const saved = await r.json();

  if (!chromeBookmark && saved.bookmark?.id && !saved.bookmark?.chromeId) {
    if (saved.bookmark.folderPath) {
      const created = await createChromeBookmarkForSavedBookmark(saved.bookmark);
      saved.bookmark.chromeId = created.id;
      saved.bookmark.chromeParentId = created.parentId ?? null;
      saved.chromeCreated = true;
      await updateSavedBookmarkChromeLink(saved.bookmark.id, created);
    } else {
      saved.chromeCreated = false;
      saved.chromeSkippedReason = 'needs_folder';
    }
  } else {
    saved.chromeCreated = false;
    saved.chromeSkippedReason = chromeBookmark ? 'already_in_chrome' : 'already_linked';
  }

  return saved;
}

function isSaveablePageUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

async function findChromeBookmarkForUrl(url) {
  const bookmarks = await getAllBookmarks();
  const normalizedTarget = normalizeComparableUrl(url);
  return bookmarks.find((bookmark) => normalizeComparableUrl(bookmark.url) === normalizedTarget) ?? null;
}

function normalizeComparableUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    url.hash = '';
    if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
      url.pathname = url.pathname.slice(0, -1);
    }
    return url.toString();
  } catch {
    return String(rawUrl ?? '').trim();
  }
}

async function createChromeBookmarkForSavedBookmark(bookmark) {
  const folderMap = await buildFolderMap();
  const parentId = await ensureChromeFolder(bookmark.folderPath, folderMap);
  return new Promise((resolve, reject) => {
    chrome.bookmarks.create(
      {
        parentId,
        title: bookmark.title || bookmark.url,
        url: bookmark.url,
      },
      (created) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }
        resolve(created);
      }
    );
  });
}

async function updateSavedBookmarkChromeLink(bookmarkId, created) {
  const r = await fetch(`${API_BASE}/api/bookmarks/${encodeURIComponent(bookmarkId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chromeId: created.id,
      chromeParentId: created.parentId ?? null,
    }),
  });
  if (!r.ok) throw new Error(`Failed to link Chrome bookmark: ${r.status}`);
}

async function runDailyScan() {
  const startedAt = new Date().toISOString();

  try {
    const bookmarks = await getAllBookmarks();
    const imported = await importToSiftMarks(bookmarks);

    const analysisRes = await fetch(`${API_BASE}/api/index-bookmarks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        limit: 50,
        onlyMissing: true,
        useAI: true,
        fetchContent: true,
        fetchTimeout: 5000,
      }),
    });
    const analysis = analysisRes.ok ? await analysisRes.json() : { error: `index ${analysisRes.status}` };

    const rescueRes = await fetch(`${API_BASE}/api/rescue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deep: true, analysisLimit: 20 }),
    });
    const rescue = rescueRes.ok ? await rescueRes.json() : { error: `rescue ${rescueRes.status}` };

    const result = { ok: true, startedAt, finishedAt: new Date().toISOString(), imported, analysis, rescue };
    await chrome.storage.local.set({ lastDailyScan: result });
    return result;
  } catch (err) {
    const result = {
      ok: false,
      startedAt,
      finishedAt: new Date().toISOString(),
      error: err instanceof Error ? err.message : String(err),
    };
    await chrome.storage.local.set({ lastDailyScan: result });
    return result;
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === DAILY_SCAN_ALARM) {
    runDailyScan();
  }
});

// --- Chrome folder cache ---

const BOOKMARK_BAR_ROOT_TITLES = new Set(['书签栏', 'Bookmarks Bar', 'Bookmarks bar', 'Bookmarks Toolbar']);
const OTHER_BOOKMARKS_ROOT_TITLES = new Set(['其他书签', 'Other Bookmarks', 'Other bookmarks']);
const MOBILE_BOOKMARKS_ROOT_TITLES = new Set(['移动设备书签', 'Mobile Bookmarks', 'Mobile bookmarks']);

function isBookmarkBarRootTitle(title) {
  return BOOKMARK_BAR_ROOT_TITLES.has(title);
}

function isKnownChromeRootTitle(title) {
  return (
    isBookmarkBarRootTitle(title) ||
    OTHER_BOOKMARKS_ROOT_TITLES.has(title) ||
    MOBILE_BOOKMARKS_ROOT_TITLES.has(title)
  );
}

function normalizeSyncFolderPath(folderPath) {
  const parts = String(folderPath ?? '')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length > 0 && isBookmarkBarRootTitle(parts[0])) {
    return parts.slice(1).join('/');
  }
  if (parts.length > 0 && (OTHER_BOOKMARKS_ROOT_TITLES.has(parts[0]) || MOBILE_BOOKMARKS_ROOT_TITLES.has(parts[0]))) {
    return '';
  }

  return parts.join('/');
}

function addFolderAlias(folderMap, path, id) {
  const raw = String(path ?? '').trim();
  if (raw) folderMap.set(raw, id);

  const normalized = normalizeSyncFolderPath(path);
  if (!normalized) return;
  folderMap.set(normalized, id);

  const parts = normalized.split('/').filter(Boolean);
  const leafName = parts[parts.length - 1];
  if (parts.length === 1 && leafName && !folderMap.has(leafName)) {
    folderMap.set(leafName, id);
  }
}

// Build a map: folderPath -> chromeId for existing Chrome bookmark folders
async function buildFolderMap() {
  const tree = await new Promise((resolve) => chrome.bookmarks.getTree(resolve));
  const map = new Map(); // path -> id

  function walk(node, pathParts) {
    if (node.children) {
      const currentPath = pathParts.length > 0 ? pathParts.join('/') : '';
      if (currentPath) {
        addFolderAlias(map, currentPath, node.id);
      }

      for (const child of node.children) {
        if (child.children !== undefined) {
          walk(child, [...pathParts, child.title]);
        }
      }
    }
  }

  for (const root of tree) {
    walk(root, []);
  }
  return map;
}

// Ensure a folder path exists in Chrome, creating intermediate folders as needed.
// Returns the Chrome folder ID.
async function ensureChromeFolder(folderPath, folderMap) {
  folderPath = normalizeSyncFolderPath(folderPath);
  if (!folderPath) return '1';
  if (folderMap.has(folderPath)) return folderMap.get(folderPath);

  const parts = folderPath.split('/');
  if (parts.length === 1 && folderMap.has(parts[0])) {
    return folderMap.get(parts[0]);
  }

  let parentId = '1'; // "1" = Bookmarks Bar in Chrome
  let startIndex = 0;

  if (parts.length > 0 && isKnownChromeRootTitle(parts[0]) && folderMap.has(parts[0])) {
    parentId = folderMap.get(parts[0]);
    startIndex = 1;
  }

  for (let i = startIndex; i < parts.length; i++) {
    const subPath = parts.slice(0, i + 1).join('/');
    if (folderMap.has(subPath)) {
      parentId = folderMap.get(subPath);
    } else {
      // Create folder
      const created = await new Promise((resolve, reject) => {
        chrome.bookmarks.create({ parentId, title: parts[i] }, (result) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve(result);
        });
      });
      addFolderAlias(folderMap, subPath, created.id);
      parentId = created.id;
    }
  }

  return parentId;
}

async function getChromeTree() {
  return new Promise((resolve) => chrome.bookmarks.getTree(resolve));
}

function getBookmarkBar(tree) {
  const root = tree[0];
  return root.children?.find((node) => node.id === '1' || node.title === '书签栏' || node.title === 'Bookmarks Bar');
}

async function removeBookmarkTree(id) {
  return new Promise((resolve, reject) => {
    chrome.bookmarks.removeTree(id, () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(null);
    });
  });
}

// Generic bookmark-bar tidying: remove empty folders left by accepted move/delete ops.
// All category-specific moves come from the server as `move` ops in the sync plan,
// not from any classifier baked into the extension.
async function cleanupBookmarkBar() {
  const tree = await getChromeTree();
  const bookmarkBar = getBookmarkBar(tree);
  if (!bookmarkBar) return { duplicatesRemoved: 0, emptyFoldersRemoved: 0 };

  let emptyFoldersRemoved = 0;

  async function removeEmptyFolders(node) {
    for (const child of [...(node.children || [])]) {
      if (child.children) await removeEmptyFolders(child);
    }

    const refreshed = (await new Promise((resolve) => chrome.bookmarks.getSubTree(node.id, resolve)))[0];
    if (refreshed.id !== bookmarkBar.id && refreshed.children && refreshed.children.length === 0) {
      await removeBookmarkTree(refreshed.id);
      emptyFoldersRemoved++;
    }
  }

  await removeEmptyFolders(bookmarkBar);
  return { duplicatesRemoved: 0, emptyFoldersRemoved };
}

// --- Sync back to Chrome ---

async function syncBackToChrome() {
  const response = await fetch(`${API_BASE}/api/extension/sync-back`);
  if (!response.ok) throw new Error('Failed to get sync operations');
  const { ops } = await response.json();

  const hasOps = Array.isArray(ops) && ops.length > 0;
  const hasRemovesOrMoves = hasOps && ops.some((op) => op.action === 'remove' || op.action === 'move');

  // Build folder map for move operations
  const folderMap = await buildFolderMap();
  const syncedIds = [];
  const errors = [];
  let failed = 0;

  for (const op of ops || []) {
    try {
      if (op.action === 'update') {
        const updateInfo = {};
        if (op.title) updateInfo.title = op.title;
        if (op.url) updateInfo.url = op.url;

        await new Promise((resolve, reject) => {
          chrome.bookmarks.update(op.chromeId, updateInfo, (r) => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else resolve(r);
          });
        });
        syncedIds.push(op.id);

      } else if (op.action === 'remove') {
        await new Promise((resolve, reject) => {
          chrome.bookmarks.remove(op.chromeId, () => {
            if (chrome.runtime.lastError) {
              if (chrome.runtime.lastError.message.includes("Can't find bookmark")) resolve(null);
              else reject(new Error(chrome.runtime.lastError.message));
            } else resolve(null);
          });
        });
        syncedIds.push(op.id);

      } else if (op.action === 'move') {
        // Ensure target folder exists, then move
        const targetFolderId = await ensureChromeFolder(op.folderPath, folderMap);
        await new Promise((resolve, reject) => {
          chrome.bookmarks.move(op.chromeId, { parentId: targetFolderId }, (r) => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else resolve(r);
          });
        });
        syncedIds.push(op.id);

      } else if (op.action === 'create') {
        if (!op.bookmarkId || !(op.url || op.bookmarkUrl)) {
          throw new Error('Create op missing bookmark id or url');
        }

        const url = op.url || op.bookmarkUrl;
        const targetFolderId = await ensureChromeFolder(op.folderPath, folderMap);
        const existing = await findChromeBookmarkForUrl(url);
        let linked;

        if (existing?.chromeId) {
          if (existing.chromeParentId !== targetFolderId) {
            const moved = await new Promise((resolve, reject) => {
              chrome.bookmarks.move(existing.chromeId, { parentId: targetFolderId }, (r) => {
                if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
                else resolve(r);
              });
            });
            linked = moved;
          } else {
            linked = { id: existing.chromeId, parentId: existing.chromeParentId ?? targetFolderId };
          }
        } else {
          linked = await new Promise((resolve, reject) => {
            chrome.bookmarks.create(
              {
                parentId: targetFolderId,
                title: op.title || op.bookmarkTitle || url,
                url,
              },
              (created) => {
                const error = chrome.runtime.lastError;
                if (error) {
                  reject(new Error(error.message));
                  return;
                }
                resolve(created);
              }
            );
          });
        }

        await updateSavedBookmarkChromeLink(op.bookmarkId, linked);
        syncedIds.push(op.id);
      } else {
        throw new Error(`Unsupported sync action: ${op.action}`);
      }
    } catch (err) {
      console.error(`Sync op ${op.id} failed:`, err);
      failed++;
      errors.push({
        id: op.id,
        action: op.action,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (syncedIds.length > 0) {
    await fetch(`${API_BASE}/api/extension/sync-back`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ syncedIds }),
    });
  }

  // Only run dedupe + empty-folder cleanup when the user actually applied changes
  // that could have created leftovers. Plain "check for ops" calls leave the bar alone.
  const cleanup = hasRemovesOrMoves
    ? await cleanupBookmarkBar()
    : { duplicatesRemoved: 0, emptyFoldersRemoved: 0 };

  return {
    applied: syncedIds.length,
    failed,
    total: ops?.length ?? 0,
    hasOps,
    errors,
    cleanup,
  };
}

// --- Message handler ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handle = async () => {
    try {
      switch (message.action) {
        case 'getBookmarks': {
          const bookmarks = await getAllBookmarks();
          return { success: true, data: { count: bookmarks.length, bookmarks } };
        }
        case 'importAll': {
          const bookmarks = await getAllBookmarks();
          const result = await importToSiftMarks(bookmarks);
          return { success: true, data: result };
        }
        case 'getStats': return { success: true, data: await getStats() };
        case 'search': return { success: true, data: await searchBookmarks(message.query) };
        case 'saveTab': {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!tab?.url) return { success: false, error: 'No active tab' };
          return { success: true, data: await saveCurrentTab(tab) };
        }
        case 'syncBack': return { success: true, data: await syncBackToChrome() };
        case 'checkConnection': return { success: true, data: await getStats() };
        default: return { success: false, error: 'Unknown action' };
      }
    } catch (err) {
      return { success: false, error: err.message };
    }
  };
  handle().then(sendResponse);
  return true;
});
