// SiftMarks Chrome Extension - Background Service Worker

const API_BASE = 'http://localhost:4399';

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
  const r = await fetch(`${API_BASE}/api/extension/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: tab.url, title: tab.title }),
  });
  if (!r.ok) throw new Error('Save failed');
  return r.json();
}

// --- Chrome folder cache ---

// Build a map: folderPath -> chromeId for existing Chrome bookmark folders
async function buildFolderMap() {
  const tree = await new Promise((resolve) => chrome.bookmarks.getTree(resolve));
  const map = new Map(); // path -> id

  function walk(node, pathParts) {
    if (node.children) {
      const currentPath = pathParts.length > 0 ? pathParts.join('/') : '';
      if (currentPath) map.set(currentPath, node.id);

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
  if (folderMap.has(folderPath)) return folderMap.get(folderPath);

  const parts = folderPath.split('/');
  let parentId = '1'; // "1" = Bookmarks Bar in Chrome

  for (let i = 0; i < parts.length; i++) {
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
      folderMap.set(subPath, created.id);
      parentId = created.id;
    }
  }

  return parentId;
}

function normalizeUrlForDedupe(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    if (u.pathname !== '/') u.pathname = u.pathname.replace(/\/$/, '');
    return u.toString();
  } catch {
    return url;
  }
}

async function getChromeTree() {
  return new Promise((resolve) => chrome.bookmarks.getTree(resolve));
}

function getBookmarkBar(tree) {
  const root = tree[0];
  return root.children?.find((node) => node.id === '1' || node.title === '书签栏' || node.title === 'Bookmarks Bar');
}

function collectBookmarkBarItems(root) {
  const bookmarks = [];
  const folders = [];

  function walk(node, path = []) {
    if (node.url) {
      bookmarks.push({ node, path });
      return;
    }

    if (node.children) {
      if (node.id !== root.id) folders.push({ node, path });
      for (const child of node.children) {
        walk(child, [...path, node.title]);
      }
    }
  }

  walk(root, []);
  return { bookmarks, folders };
}

async function removeBookmarkTree(id) {
  return new Promise((resolve, reject) => {
    chrome.bookmarks.removeTree(id, () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(null);
    });
  });
}

// Generic bookmark-bar tidying: remove duplicate URLs and empty folders.
// All category-specific moves come from the server as `move` ops in the sync plan,
// not from any classifier baked into the extension.
async function cleanupBookmarkBar() {
  const tree = await getChromeTree();
  const bookmarkBar = getBookmarkBar(tree);
  if (!bookmarkBar) return { duplicatesRemoved: 0, emptyFoldersRemoved: 0 };

  const { bookmarks } = collectBookmarkBarItems(bookmarkBar);
  const byUrl = new Map();
  for (const item of bookmarks) {
    const key = normalizeUrlForDedupe(item.node.url);
    if (!byUrl.has(key)) byUrl.set(key, item);
  }

  let duplicatesRemoved = 0;
  for (const item of bookmarks) {
    const key = normalizeUrlForDedupe(item.node.url);
    if (byUrl.get(key).node.id !== item.node.id) {
      await removeBookmarkTree(item.node.id);
      duplicatesRemoved++;
    }
  }

  const afterDedupeTree = await getChromeTree();
  const afterDedupeBar = getBookmarkBar(afterDedupeTree);
  let emptyFoldersRemoved = 0;

  async function removeEmptyFolders(node) {
    for (const child of [...(node.children || [])]) {
      if (child.children) await removeEmptyFolders(child);
    }

    const refreshed = (await new Promise((resolve) => chrome.bookmarks.getSubTree(node.id, resolve)))[0];
    if (refreshed.id !== afterDedupeBar.id && refreshed.children && refreshed.children.length === 0) {
      await removeBookmarkTree(refreshed.id);
      emptyFoldersRemoved++;
    }
  }

  await removeEmptyFolders(afterDedupeBar);
  return { duplicatesRemoved, emptyFoldersRemoved };
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
      }
    } catch (err) {
      console.error(`Sync op ${op.id} failed:`, err);
      failed++;
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
