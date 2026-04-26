// SiftMarks Chrome Extension - Popup Script

// --- i18n ---
const i18n = {
  zh: {
    bookmarks: '书签',
    duplicates: '重复',
    tags: '标签',
    importAll: '一键导入浏览器书签',
    importDesc: '读取 Chrome 全部书签并导入 SiftMarks',
    importing: '正在导入...',
    saveTab: '保存当前页面',
    saveTabDesc: '将当前标签页添加到 SiftMarks',
    rescue: '书签整理',
    rescueDesc: '查找重复、失效链接，生成清理建议',
    syncBack: '同步回 Chrome',
    syncBackDesc: '将整理结果写回浏览器书签栏',
    syncing: '正在同步...',
    searchPlaceholder: '搜索书签...',
    searchBtn: '搜索',
    searching: '搜索中...',
    noResults: '未找到匹配书签',
    dashboard: '打开 SiftMarks 面板',
    offline: 'SiftMarks 服务未运行。请先启动：',
    imported: (n) => `成功导入 ${n} 条书签！`,
    importedDup: (n, d) => `导入 ${n} 条，${d} 条重复已跳过`,
    saved: '已保存！',
    alreadyExists: '该页面已收藏',
    rescueDone: (n) => `生成了 ${n} 条整理建议`,
    rescueHint: '请在面板中审查并接受建议，然后点击「同步回 Chrome」',
    syncDone: (n) => `已同步 ${n} 条改动到 Chrome！`,
    syncNone: '没有待同步的改动。请先在面板中接受整理建议。',
    syncFailed: (a, f) => `同步完成：${a} 成功，${f} 失败`,
    cleanupDone: (c) => `已整理书签栏：移动 ${c.moved} 条，删除 ${c.duplicatesRemoved} 个重复，清理 ${c.emptyFoldersRemoved} 个空文件夹`,
    error: '操作失败，请检查服务是否运行',
    chromeCount: (n) => `Chrome 中共有 ${n} 条书签`,
    langBtn: 'EN',
    confirmSync: '确定要整理 Chrome 书签栏吗？\n\n这将：\n• 应用已接受的重命名和移动\n• 合并重复 URL\n• 移除空文件夹\n• 把零散文件夹收敛到少数顶层分类\n\n如果 Chrome 开启同步，这些变化可能会同步到你的 Google 账号。',
  },
  en: {
    bookmarks: 'Bookmarks',
    duplicates: 'Duplicates',
    tags: 'Tags',
    importAll: 'Import All Browser Bookmarks',
    importDesc: 'Read all Chrome bookmarks and import to SiftMarks',
    importing: 'Importing...',
    saveTab: 'Save Current Page',
    saveTabDesc: 'Add current tab to SiftMarks',
    rescue: 'Bookmark Rescue',
    rescueDesc: 'Find duplicates, broken links, generate suggestions',
    syncBack: 'Sync Back to Chrome',
    syncBackDesc: 'Apply cleanup results to your browser bookmarks',
    syncing: 'Syncing...',
    searchPlaceholder: 'Search bookmarks...',
    searchBtn: 'Search',
    searching: 'Searching...',
    noResults: 'No matching bookmarks found',
    dashboard: 'Open SiftMarks Dashboard',
    offline: 'SiftMarks is not running. Start it first:',
    imported: (n) => `Successfully imported ${n} bookmarks!`,
    importedDup: (n, d) => `Imported ${n}, ${d} duplicates skipped`,
    saved: 'Saved!',
    alreadyExists: 'Already bookmarked',
    rescueDone: (n) => `Generated ${n} cleanup suggestions`,
    rescueHint: 'Review & accept suggestions in the dashboard, then click "Sync Back to Chrome"',
    syncDone: (n) => `Synced ${n} changes to Chrome!`,
    syncNone: 'No changes to sync. Accept suggestions in the dashboard first.',
    syncFailed: (a, f) => `Sync done: ${a} applied, ${f} failed`,
    cleanupDone: (c) => `Organized bookmarks bar: moved ${c.moved}, removed ${c.duplicatesRemoved} duplicates, cleaned ${c.emptyFoldersRemoved} empty folders`,
    error: 'Failed. Is SiftMarks running?',
    chromeCount: (n) => `${n} bookmarks in Chrome`,
    langBtn: '中文',
    confirmSync: 'Organize the Chrome bookmarks bar?\n\nThis will:\n• Apply accepted renames and moves\n• Merge duplicate URLs\n• Remove empty folders\n• Consolidate scattered folders into fewer top-level categories\n\nIf Chrome Sync is enabled, these changes may sync to your Google account.',
  },
};

let lang = 'zh';

function t(key) {
  return i18n[lang][key] || key;
}

function updateUI() {
  document.getElementById('labelBookmarks').textContent = t('bookmarks');
  document.getElementById('labelDuplicates').textContent = t('duplicates');
  document.getElementById('labelTags').textContent = t('tags');
  document.getElementById('importText').textContent = t('importAll');
  document.getElementById('importDesc').textContent = t('importDesc');
  document.getElementById('saveTabText').textContent = t('saveTab');
  document.getElementById('saveTabDesc').textContent = t('saveTabDesc');
  document.getElementById('rescueText').textContent = t('rescue');
  document.getElementById('rescueDesc').textContent = t('rescueDesc');
  document.getElementById('syncBackText').textContent = t('syncBack');
  document.getElementById('syncBackDesc').textContent = t('syncBackDesc');
  document.getElementById('searchInput').placeholder = t('searchPlaceholder');
  document.getElementById('searchBtn').textContent = t('searchBtn');
  document.getElementById('dashboardLink').textContent = t('dashboard');
  document.getElementById('offlineText').textContent = t('offline');
  document.getElementById('langBtn').textContent = t('langBtn');
}

function showStatus(msg, type = 'success') {
  const el = document.getElementById('statusMsg');
  el.textContent = msg;
  el.className = `status-msg ${type}`;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 4000);
}

function sendMessage(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, resolve);
  });
}

// --- Load stats ---
async function loadStats() {
  const res = await sendMessage({ action: 'getStats' });
  if (res.success) {
    document.getElementById('statBookmarks').textContent = res.data.bookmarks.toLocaleString();
    document.getElementById('statDuplicates').textContent = res.data.duplicates.toLocaleString();
    document.getElementById('statTags').textContent = res.data.tags.toLocaleString();
    document.getElementById('offline').style.display = 'none';
  } else {
    document.getElementById('offline').style.display = 'block';
  }
}

// --- Import all ---
document.getElementById('btnImport').addEventListener('click', async () => {
  const btn = document.getElementById('btnImport');
  const textEl = document.getElementById('importText');
  const origText = textEl.textContent;

  btn.disabled = true;
  textEl.textContent = t('importing');

  const countRes = await sendMessage({ action: 'getBookmarks' });
  if (countRes.success) {
    document.getElementById('importDesc').textContent = t('chromeCount')(countRes.data.count);
  }

  const res = await sendMessage({ action: 'importAll' });

  btn.disabled = false;
  textEl.textContent = origText;

  if (res.success) {
    const d = res.data;
    if (d.duplicates > 0) {
      showStatus(t('importedDup')(d.imported, d.duplicates));
    } else {
      showStatus(t('imported')(d.imported));
    }
    loadStats();
  } else {
    showStatus(t('error'), 'error');
  }
});

// --- Save current tab ---
document.getElementById('btnSaveTab').addEventListener('click', async () => {
  const res = await sendMessage({ action: 'saveTab' });
  if (res.success) {
    if (res.data.status === 'already_exists') {
      showStatus(t('alreadyExists'));
    } else {
      showStatus(t('saved'));
    }
    loadStats();
  } else {
    showStatus(t('error'), 'error');
  }
});

// --- Rescue ---
document.getElementById('btnRescue').addEventListener('click', async () => {
  const btn = document.getElementById('btnRescue');
  btn.disabled = true;

  try {
    const response = await fetch('http://localhost:4399/api/rescue', { method: 'POST' });
    const data = await response.json();
    showStatus(t('rescueDone')(data.suggestionsCount));
    // Show hint about next step
    setTimeout(() => showStatus(t('rescueHint'), 'success'), 4500);
  } catch {
    showStatus(t('error'), 'error');
  }

  btn.disabled = false;
});

// --- Sync back to Chrome ---
document.getElementById('btnSyncBack').addEventListener('click', async () => {
  // Confirm before modifying Chrome bookmarks
  if (!confirm(t('confirmSync'))) return;

  const btn = document.getElementById('btnSyncBack');
  const textEl = document.getElementById('syncBackText');
  const origText = textEl.textContent;

  btn.disabled = true;
  textEl.textContent = t('syncing');

  const res = await sendMessage({ action: 'syncBack' });

  btn.disabled = false;
  textEl.textContent = origText;

  if (res.success) {
    const d = res.data;
    const hasCleanup = d.cleanup && (
      d.cleanup.moved > 0
      || d.cleanup.duplicatesRemoved > 0
      || d.cleanup.emptyFoldersRemoved > 0
    );
    if (d.total === 0 && !hasCleanup) {
      showStatus(t('syncNone'));
    } else if (d.total === 0 && hasCleanup) {
      showStatus(t('cleanupDone')(d.cleanup));
    } else if (d.failed > 0) {
      showStatus(t('syncFailed')(d.applied, d.failed), 'error');
    } else {
      const cleaned = d.cleanup
        ? ` ${t('cleanupDone')(d.cleanup)}`
        : '';
      showStatus(`${t('syncDone')(d.applied)}${cleaned}`);
    }
    loadStats();
  } else {
    showStatus(t('error'), 'error');
  }
});

// --- Search ---
async function doSearch() {
  const query = document.getElementById('searchInput').value.trim();
  if (!query) return;

  const resultsEl = document.getElementById('results');
  resultsEl.innerHTML = `<div class="empty">${t('searching')}</div>`;

  const res = await sendMessage({ action: 'search', query });

  if (!res.success || !res.data.results?.length) {
    resultsEl.innerHTML = `<div class="empty">${t('noResults')}</div>`;
    return;
  }

  resultsEl.innerHTML = res.data.results.map((r) => `
    <div class="result-item">
      <a href="${escapeHtml(r.bookmark.url)}" target="_blank">${escapeHtml(r.bookmark.title || r.bookmark.url)}</a>
      <div class="url">${escapeHtml(r.bookmark.url)}</div>
      ${r.tags.length ? `<div class="tags">${r.tags.map((t) => `<span class="tag">#${escapeHtml(t)}</span>`).join('')}</div>` : ''}
    </div>
  `).join('');
}

document.getElementById('searchInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doSearch();
});

window.doSearch = doSearch;

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// --- Language toggle ---
document.getElementById('langBtn').addEventListener('click', () => {
  lang = lang === 'zh' ? 'en' : 'zh';
  chrome.storage.local.set({ lang });
  updateUI();
});

// --- Init ---
chrome.storage.local.get('lang', (data) => {
  if (data.lang) lang = data.lang;
  updateUI();
  loadStats();
});
