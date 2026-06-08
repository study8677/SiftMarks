// SiftMarks Chrome Extension - Popup Control Panel

const API_BASE = 'http://localhost:4399';

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

const PROVIDERS = {
  openai: {
    label: 'OpenAI',
    type: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    embeddingModel: 'text-embedding-3-small',
    models: ['gpt-4.1-mini', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4o'],
    keyPlaceholder: 'sk-xxxxxxxxxxxxxxxx',
    requiresApiKey: true,
  },
  minimax: {
    label: 'MiniMax',
    type: 'openai-compatible',
    baseUrl: 'https://api.minimaxi.com/v1',
    embeddingModel: 'embo-01',
    models: ['MiniMax-M3', 'abab6.5s-chat'],
    keyPlaceholder: '请输入 MiniMax API Key',
    requiresApiKey: true,
  },
  qwen: {
    label: '通义千问 / Qwen',
    type: 'openai-compatible',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    embeddingModel: 'text-embedding-v4',
    models: ['qwen-plus', 'qwen-max', 'qwen-turbo', 'qwen-long'],
    keyPlaceholder: '请输入 DashScope API Key',
    requiresApiKey: true,
  },
  deepseek: {
    label: 'DeepSeek',
    type: 'openai-compatible',
    baseUrl: 'https://api.deepseek.com/v1',
    embeddingModel: '',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    keyPlaceholder: 'sk-xxxxxxxxxxxxxxxx',
    requiresApiKey: true,
  },
  moonshot: {
    label: 'Kimi / Moonshot',
    type: 'openai-compatible',
    baseUrl: 'https://api.moonshot.cn/v1',
    embeddingModel: '',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
    keyPlaceholder: '请输入 Moonshot API Key',
    requiresApiKey: true,
  },
  zhipu: {
    label: '智谱 GLM',
    type: 'openai-compatible',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    embeddingModel: 'embedding-3',
    models: ['glm-4-flash', 'glm-4-plus', 'glm-4-air'],
    keyPlaceholder: '请输入智谱 API Key',
    requiresApiKey: true,
  },
  doubao: {
    label: '豆包 / 火山方舟',
    type: 'openai-compatible',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    embeddingModel: '',
    models: ['doubao-1-5-lite-32k', 'doubao-1-5-pro-32k', 'doubao-seed-1-6'],
    keyPlaceholder: '请输入火山方舟 API Key',
    requiresApiKey: true,
  },
  siliconflow: {
    label: 'SiliconFlow',
    type: 'openai-compatible',
    baseUrl: 'https://api.siliconflow.cn/v1',
    embeddingModel: 'BAAI/bge-m3',
    models: ['Qwen/Qwen2.5-72B-Instruct', 'deepseek-ai/DeepSeek-V3', 'THUDM/glm-4-9b-chat'],
    keyPlaceholder: 'sk-xxxxxxxxxxxxxxxx',
    requiresApiKey: true,
  },
  openrouter: {
    label: 'OpenRouter',
    type: 'openai-compatible',
    baseUrl: 'https://openrouter.ai/api/v1',
    embeddingModel: '',
    models: ['openai/gpt-4o-mini', 'anthropic/claude-3.5-sonnet', 'google/gemini-flash-1.5'],
    keyPlaceholder: 'sk-or-xxxxxxxxxxxxxxxx',
    requiresApiKey: true,
  },
  groq: {
    label: 'Groq',
    type: 'openai-compatible',
    baseUrl: 'https://api.groq.com/openai/v1',
    embeddingModel: '',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
    keyPlaceholder: 'gsk_xxxxxxxxxxxxxxxx',
    requiresApiKey: true,
  },
  together: {
    label: 'Together AI',
    type: 'openai-compatible',
    baseUrl: 'https://api.together.xyz/v1',
    embeddingModel: 'BAAI/bge-base-en-v1.5',
    models: ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'Qwen/Qwen2.5-72B-Instruct-Turbo', 'deepseek-ai/DeepSeek-V3'],
    keyPlaceholder: '请输入 Together API Key',
    requiresApiKey: true,
  },
  lmstudio: {
    label: 'LM Studio 本地服务',
    type: 'openai-compatible',
    baseUrl: 'http://localhost:1234/v1',
    embeddingModel: '',
    models: ['local-model', 'qwen2.5', 'llama-3.2'],
    keyPlaceholder: '',
    requiresApiKey: false,
  },
  ollama: {
    label: 'Ollama',
    type: 'ollama-compatible',
    baseUrl: 'http://localhost:11434',
    embeddingModel: 'nomic-embed-text',
    models: ['llama3.2', 'qwen2.5', 'mistral'],
    keyPlaceholder: '',
    requiresApiKey: false,
  },
  custom: {
    label: '自定义 OpenAI 兼容',
    type: 'openai-compatible',
    baseUrl: '',
    embeddingModel: '',
    models: ['gpt-4o-mini', 'qwen-plus', 'deepseek-chat', 'local-model'],
    keyPlaceholder: '请输入兼容接口 API Key',
    requiresApiKey: true,
    editableBaseUrl: true,
  },
};

const DEFAULT_FOLDERS = ['开发资源', 'AI 工具', '学习资料', '产品灵感'];
const DEFAULT_COMMON_TAGS = ['MCP', 'AI 工具', '开发文档', '教程', 'SaaS', '产品灵感'];
const MAX_EDIT_TAGS = 3;
const DEMO_BOOKMARK = {
  id: 'demo-bookmark',
  title: 'OpenAI API Docs',
  url: 'https://platform.openai.com/docs',
  folderPath: '开发资源',
  summary: 'OpenAI 官方 API 文档，包含模型调用、接口说明、鉴权方式与开发示例，适合开发者查阅与集成。',
  tags: ['AI', 'API', '文档'],
  status: 'saved',
};

const els = {
  homeView: document.getElementById('homeView'),
  configView: document.getElementById('configView'),
  editView: document.getElementById('editView'),
  offline: document.getElementById('offline'),
  statusMsg: document.getElementById('statusMsg'),
  aiCard: document.getElementById('aiCard'),
  aiTitle: document.getElementById('aiTitle'),
  aiDesc: document.getElementById('aiDesc'),
  btnConfigureAI: document.getElementById('btnConfigureAI'),
  btnSaveTab: document.getElementById('btnSaveTab'),
  btnImport: document.getElementById('btnImport'),
  btnCategoryReview: document.getElementById('btnCategoryReview'),
  btnSyncBack: document.getElementById('btnSyncBack'),
  btnRescue: document.getElementById('btnRescue'),
  settingsBtn: document.getElementById('settingsBtn'),
  dashboardLink: document.getElementById('dashboardLink'),
  importDesc: document.getElementById('importDesc'),
  saveTabDesc: document.getElementById('saveTabDesc'),
  categoryCount: document.getElementById('categoryCount'),
  syncBackCount: document.getElementById('syncBackCount'),
  backToHomeBtn: document.getElementById('backToHomeBtn'),
  aiConfigForm: document.getElementById('aiConfigForm'),
  providerSelect: document.getElementById('providerSelect'),
  baseUrlGroup: document.getElementById('baseUrlGroup'),
  baseUrlInput: document.getElementById('baseUrlInput'),
  apiKeyGroup: document.getElementById('apiKeyGroup'),
  apiKeyInput: document.getElementById('apiKeyInput'),
  modelSelect: document.getElementById('modelSelect'),
  modelSelectWrap: document.getElementById('modelSelectWrap'),
  modelInput: document.getElementById('modelInput'),
  testConnectionBtn: document.getElementById('testConnectionBtn'),
  saveConfigBtn: document.getElementById('saveConfigBtn'),
  backFromEditBtn: document.getElementById('backFromEditBtn'),
  editSettingsBtn: document.getElementById('editSettingsBtn'),
  editBookmarkForm: document.getElementById('editBookmarkForm'),
  editFavicon: document.getElementById('editFavicon'),
  editPreviewTitle: document.getElementById('editPreviewTitle'),
  editPreviewUrl: document.getElementById('editPreviewUrl'),
  editStatusText: document.getElementById('editStatusText'),
  editTitleInput: document.getElementById('editTitleInput'),
  editUrlInput: document.getElementById('editUrlInput'),
  editFolderSelect: document.getElementById('editFolderSelect'),
  tagChipRow: document.getElementById('tagChipRow'),
  editTagInput: document.getElementById('editTagInput'),
  commonTagRow: document.getElementById('commonTagRow'),
  editSummaryInput: document.getElementById('editSummaryInput'),
  reanalyzeBtn: document.getElementById('reanalyzeBtn'),
  checkLinkBtn: document.getElementById('checkLinkBtn'),
  deleteBookmarkBtn: document.getElementById('deleteBookmarkBtn'),
  cancelEditBtn: document.getElementById('cancelEditBtn'),
  saveBookmarkEditBtn: document.getElementById('saveBookmarkEditBtn'),
};

let currentSettings = null;
let currentView = 'home';
let currentBookmark = null;
let editTags = [];
let knownFolders = [...DEFAULT_FOLDERS];
let knownTags = [...DEFAULT_COMMON_TAGS];

function hasChromeRuntime() {
  return typeof chrome !== 'undefined' && Boolean(chrome.runtime?.sendMessage);
}

function sendMessage(message) {
  if (!hasChromeRuntime()) {
    if (message.action === 'saveTab') {
      return Promise.resolve({ success: true, data: { ...DEMO_BOOKMARK, status: 'saved' } });
    }
    if (message.action === 'getBookmarks') {
      return Promise.resolve({ success: true, data: { count: 1, bookmarks: [DEMO_BOOKMARK] } });
    }
    return Promise.resolve({ success: false, error: 'Chrome runtime unavailable' });
  }

  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, resolve);
  });
}

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
}

function openPage(path = '/') {
  const url = `${API_BASE}${path}`;
  if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
    chrome.tabs.create({ url });
  } else {
    window.open(url, '_blank');
  }
}

function showStatus(message, type = 'success') {
  els.statusMsg.textContent = message;
  els.statusMsg.className = `toast ${type === 'error' ? 'error' : type === 'info' ? 'info' : ''}`.trim();
  els.statusMsg.style.display = 'block';
  clearTimeout(showStatus.timer);
  showStatus.timer = setTimeout(() => {
    els.statusMsg.style.display = 'none';
  }, 3000);
}

function setOffline(isOffline) {
  els.offline.style.display = isOffline ? 'block' : 'none';
}

function setBusy(button, busy, busyText) {
  if (!button) return () => {};

  const title = button.querySelector('.row-title');
  const previousTitle = title?.textContent;
  const previousLabel = button.textContent;

  button.disabled = busy;
  if (busyText) {
    if (title) title.textContent = busyText;
    else button.textContent = busyText;
  }

  return () => {
    button.disabled = false;
    if (busyText) {
      if (title && previousTitle) title.textContent = previousTitle;
      else button.textContent = previousLabel;
    }
  };
}

function countLabel(count, emptyText, suffix) {
  if (!Number.isFinite(count)) return `-- ${suffix}`;
  if (count <= 0) return emptyText;
  return `${count.toLocaleString()} ${suffix}`;
}

function providerKeyFromSettings(settings) {
  const provider = settings?.aiProvider;
  if (!provider || provider.type === 'mock') return 'openai';
  if (provider.type === 'ollama-compatible') return 'ollama';
  const baseUrl = (provider.baseUrl ?? '').replace(/\/$/, '');
  const matched = Object.entries(PROVIDERS).find(([, preset]) => {
    if (preset.id === 'custom' || preset.editableBaseUrl) return false;
    return preset.type === provider.type && preset.baseUrl.replace(/\/$/, '') === baseUrl;
  });
  return matched?.[0] ?? 'custom';
}

function isAIConfigured(settings) {
  const provider = settings?.aiProvider;
  if (!provider || provider.type === 'mock') return false;
  if (provider.type === 'ollama-compatible') return true;
  return Boolean(provider.apiKey);
}

function providerName(settings) {
  const key = providerKeyFromSettings(settings);
  return PROVIDERS[key]?.label ?? 'OpenAI';
}

function populateProviderSelect() {
  els.providerSelect.innerHTML = Object.entries(PROVIDERS)
    .map(([key, provider]) => `<option value="${key}">${provider.label}</option>`)
    .join('');
}

function updateAI(settings) {
  const configured = isAIConfigured(settings);
  els.aiCard.classList.toggle('configured', configured);

  if (configured) {
    els.aiTitle.textContent = 'AI 服务已配置';
    els.aiDesc.textContent = `当前使用 ${providerName(settings)}，可生成摘要、标签与分类建议。`;
    els.btnConfigureAI.textContent = '打开设置';
  } else {
    els.aiTitle.textContent = '配置 AI 服务';
    els.aiDesc.textContent = '输入 API Key 以连接到 AI 服务。';
    els.btnConfigureAI.textContent = '配置 API Key';
  }
}

function setView(view) {
  currentView = view;
  els.homeView.hidden = view !== 'home';
  els.configView.hidden = view !== 'config';
  els.editView.hidden = view !== 'edit';
}

function populateModels(providerKey, selectedModel) {
  const provider = PROVIDERS[providerKey] ?? PROVIDERS.openai;
  const selected = selectedModel || provider.models[0];
  const isCustom = Boolean(provider.editableBaseUrl);

  els.modelSelectWrap.hidden = isCustom;
  els.modelInput.hidden = !isCustom;

  if (isCustom) {
    els.modelInput.value = selectedModel || provider.models[0] || '';
    return;
  }

  els.modelSelect.innerHTML = provider.models
    .map((model) => `<option value="${model}">${model}</option>`)
    .join('');

  if (!provider.models.includes(selected)) {
    const option = document.createElement('option');
    option.value = selected;
    option.textContent = selected;
    els.modelSelect.prepend(option);
  }

  els.modelSelect.value = selected;
  els.modelInput.value = '';
}

function currentChatModel(provider) {
  return provider.editableBaseUrl
    ? els.modelInput.value.trim()
    : (els.modelSelect.value || provider.models[0]);
}

function updateProviderFields() {
  const providerKey = els.providerSelect.value;
  const provider = PROVIDERS[providerKey] ?? PROVIDERS.openai;
  const storedProviderKey = providerKeyFromSettings(currentSettings);
  const hasStoredKey = storedProviderKey === providerKey && Boolean(currentSettings?.aiProvider?.apiKey);
  const shouldShowBaseUrl = Boolean(provider.editableBaseUrl);

  els.baseUrlGroup.hidden = !shouldShowBaseUrl;
  els.baseUrlInput.value = shouldShowBaseUrl
    ? currentSettings?.aiProvider?.baseUrl ?? provider.baseUrl
    : provider.baseUrl;

  els.apiKeyGroup.hidden = provider.requiresApiKey === false;
  els.apiKeyInput.placeholder = hasStoredKey
    ? '已配置，留空则继续使用'
    : provider.keyPlaceholder;

  const currentModel = currentSettings?.aiProvider?.chatModel;
  const shouldKeepCurrentModel = storedProviderKey === providerKey;
  populateModels(providerKey, shouldKeepCurrentModel ? currentModel : provider.models[0]);
}

function applySettingsToForm(settings) {
  const providerKey = providerKeyFromSettings(settings);
  els.providerSelect.value = providerKey;
  els.apiKeyInput.value = '';
  els.baseUrlInput.value = settings?.aiProvider?.baseUrl ?? PROVIDERS[providerKey]?.baseUrl ?? '';
  updateProviderFields();
}

function showConfigView() {
  applySettingsToForm(currentSettings);
  setView('config');
}

function showHomeView() {
  setView('home');
  loadPanelState();
}

function getFormProviderConfig() {
  const providerKey = els.providerSelect.value;
  const provider = PROVIDERS[providerKey] ?? PROVIDERS.openai;
  const apiKey = els.apiKeyInput.value.trim();
  const baseUrl = provider.editableBaseUrl ? els.baseUrlInput.value.trim() : provider.baseUrl;
  const storedProviderKey = providerKeyFromSettings(currentSettings);
  const hasReusableStoredKey = storedProviderKey === providerKey && Boolean(currentSettings?.aiProvider?.apiKey);

  if (!baseUrl) {
    throw new Error('请输入 API 地址');
  }

  if (provider.requiresApiKey !== false && !apiKey && !hasReusableStoredKey) {
    throw new Error('请输入 API Key');
  }

  const aiProvider = {
    type: provider.type,
    baseUrl,
    chatModel: currentChatModel(provider),
    embeddingModel: provider.embeddingModel || undefined,
  };

  if (!aiProvider.chatModel) {
    throw new Error('请输入模型名');
  }

  if (apiKey && provider.requiresApiKey !== false) {
    aiProvider.apiKey = apiKey;
  }

  return aiProvider;
}

function displayUrl(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname === '/' ? '' : parsed.pathname}`;
  } catch {
    return url;
  }
}

function normalizeBookmarkTags(tags) {
  return (tags ?? [])
    .map((tag) => typeof tag === 'string' ? tag : tag?.name)
    .filter(Boolean);
}

function dedupeNames(names) {
  const seen = new Set();
  const out = [];
  for (const name of names.map((n) => String(n ?? '').trim()).filter(Boolean)) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

async function loadFoldersAndTags() {
  try {
    const [foldersRes, tagsRes] = await Promise.all([
      api('/api/folders'),
      api('/api/tags'),
    ]);
    knownFolders = dedupeNames([
      ...DEFAULT_FOLDERS,
      ...(foldersRes.folders ?? []).map((folder) => folder.path ?? folder.name),
    ]);
    knownTags = dedupeNames([
      ...DEFAULT_COMMON_TAGS,
      ...(tagsRes.tags ?? []).map((tag) => tag.name),
    ]);
  } catch {
    knownFolders = [...DEFAULT_FOLDERS];
    knownTags = [...DEFAULT_COMMON_TAGS];
  }
}

function populateFolderSelect(selectedFolder) {
  const folders = dedupeNames([selectedFolder, ...knownFolders].filter(Boolean));
  els.editFolderSelect.innerHTML = [
    '<option value="">未分类</option>',
    ...folders.map((folder) => `<option value="${escapeHtml(folder)}">${escapeHtml(folder)}</option>`),
  ].join('');
  els.editFolderSelect.value = selectedFolder ?? '';
}

function renderTagChips() {
  els.tagChipRow.innerHTML = editTags.map((tag) => `
    <span class="tag-chip">
      <span class="tag-chip-label">${escapeHtml(tag)}</span>
      <button type="button" data-remove-tag="${escapeHtml(tag)}" aria-label="移除 ${escapeHtml(tag)}">×</button>
    </span>
  `).join('');

  const common = dedupeNames(knownTags)
    .filter((tag) => !editTags.some((current) => current.toLowerCase() === tag.toLowerCase()))
    .slice(0, Math.max(0, MAX_EDIT_TAGS - editTags.length));
  els.commonTagRow.innerHTML = common.map((tag) => `
    <button class="common-tag" type="button" data-add-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>
  `).join('');
}

function addEditTag(rawTag) {
  const tag = String(rawTag ?? '').trim();
  if (!tag) return;
  const exists = editTags.some((current) => current.toLowerCase() === tag.toLowerCase());
  if (!exists && editTags.length >= MAX_EDIT_TAGS) {
    showStatus(`标签最多 ${MAX_EDIT_TAGS} 个`, 'info');
    return;
  }
  editTags = dedupeNames([...editTags, tag]);
  renderTagChips();
}

function removeEditTag(tag) {
  editTags = editTags.filter((current) => current.toLowerCase() !== tag.toLowerCase());
  renderTagChips();
}

function updateEditPreview() {
  const title = els.editTitleInput.value.trim() || '未命名书签';
  const url = els.editUrlInput.value.trim();
  els.editPreviewTitle.textContent = title;
  els.editPreviewUrl.textContent = displayUrl(url);
  els.editFavicon.textContent = title.slice(0, 2).toUpperCase();
}

async function fetchBookmarkForEdit(id, fallback = null) {
  if (!id || id === DEMO_BOOKMARK.id) return { ...DEMO_BOOKMARK };
  try {
    return await api(`/api/bookmarks/${encodeURIComponent(id)}`);
  } catch {
    return fallback ?? { ...DEMO_BOOKMARK };
  }
}

async function showEditBookmark(bookmark) {
  currentBookmark = bookmark;
  await loadFoldersAndTags();

  const tags = normalizeBookmarkTags(bookmark.tags);
  editTags = tags.length ? tags.slice(0, MAX_EDIT_TAGS) : [];

  els.editTitleInput.value = bookmark.title ?? '';
  els.editUrlInput.value = bookmark.url ?? '';
  els.editSummaryInput.value = bookmark.summary ?? '';
  els.editStatusText.textContent = bookmark.status === 'already_exists' ? '已存在' : '已保存';
  populateFolderSelect(bookmark.folderPath ?? '');
  renderTagChips();
  updateEditPreview();
  setView('edit');
}

async function loadPanelState() {
  try {
    const [
      settings,
      pendingSuggestions,
      syncPlan,
    ] = await Promise.all([
      api('/api/settings'),
      api('/api/suggestions?status=pending&limit=1'),
      api('/api/extension/sync-back'),
    ]);

    currentSettings = settings;
    setOffline(false);
    updateAI(settings);

    if (currentView === 'config') {
      applySettingsToForm(settings);
    }

    const pendingTotal = Number(pendingSuggestions.total ?? 0);

    els.categoryCount.textContent = countLabel(pendingTotal, '暂无待审查', '条待审查');
    els.syncBackCount.textContent = countLabel(
      Number(syncPlan.count ?? 0),
      '暂无待写回',
      '项待写回'
    );
  } catch {
    setOffline(true);
    currentSettings = null;
    updateAI(null);
    els.categoryCount.textContent = '-- 条待审查';
    els.syncBackCount.textContent = '-- 项待写回';
  }
}

async function saveCurrentPage() {
  const restore = setBusy(els.btnSaveTab, true, '正在保存...');
  try {
    const result = await sendMessage({ action: 'saveTab' });
    if (!result?.success) throw new Error(result?.error || 'Save failed');

    const bookmark = result.data?.bookmark ?? await fetchBookmarkForEdit(result.data?.id, {
      ...DEMO_BOOKMARK,
      ...result.data,
      title: result.data?.title ?? DEMO_BOOKMARK.title,
      url: result.data?.url ?? DEMO_BOOKMARK.url,
    });

    if (result.data?.chromeCreated) {
      showStatus(`已保存，并加入 Chrome「${result.data.bookmark?.folderPath ?? '书签栏'}」`);
    } else if (result.data?.chromeSkippedReason === 'needs_folder') {
      showStatus('已保存到本地；AI 暂未归类，先不写入 Chrome', 'info');
    } else if (result.data?.chromeSkippedReason === 'already_in_chrome') {
      showStatus('该页面已在 Chrome 收藏中，本地信息已同步');
    } else if (result.data?.chromeSkippedReason === 'already_linked') {
      showStatus('该页面已连接 Chrome 收藏，本地信息已更新');
    } else {
      showStatus(result.data?.status === 'already_exists' ? '该页面已在知识库中' : '已保存当前页面');
    }
    await showEditBookmark(bookmark);
    loadPanelState();
  } catch (err) {
    showStatus(err instanceof Error ? err.message : '保存失败，请检查本地服务是否运行', 'error');
  } finally {
    restore();
  }
}

async function importBrowserBookmarks() {
  const restore = setBusy(els.btnImport, true, '正在导入...');
  const previousDesc = els.importDesc.textContent;

  try {
    const countResult = await sendMessage({ action: 'getBookmarks' });
    if (countResult?.success) {
      els.importDesc.textContent = `Chrome 中共有 ${countResult.data.count.toLocaleString()} 条书签`;
    }

    const result = await sendMessage({ action: 'importAll' });
    if (!result?.success) throw new Error(result?.error || 'Import failed');

    const imported = Number(result.data?.imported ?? 0);
    const duplicates = Number(result.data?.duplicates ?? 0);
    if (duplicates > 0) {
      showStatus(`导入 ${imported.toLocaleString()} 条，${duplicates.toLocaleString()} 条已存在链接已跳过`);
    } else {
      showStatus(`成功导入 ${imported.toLocaleString()} 条书签`);
    }
    await loadPanelState();
  } catch {
    showStatus('导入失败，请检查本地服务是否运行', 'error');
  } finally {
    els.importDesc.textContent = previousDesc;
    restore();
  }
}

async function runRescue() {
  const restore = setBusy(els.btnRescue, true, '正在生成...');
  try {
    const result = await api('/api/rescue', {
      method: 'POST',
      body: JSON.stringify({ deep: true, analysisLimit: 20 }),
    });
    const total = Number(result.suggestionsCount ?? 0);
    if (total > 0) {
      showStatus(`已生成 ${total.toLocaleString()} 条整理建议`);
    } else {
      showStatus('暂时没有新的整理建议');
    }
    await loadPanelState();
  } catch {
    showStatus('整理失败，请检查服务或 AI 配置', 'error');
  } finally {
    restore();
  }
}

async function syncBackToBrowser() {
  const restore = setBusy(els.btnSyncBack, true, '正在写回...');
  try {
    const result = await sendMessage({ action: 'syncBack' });
    if (!result?.success) throw new Error(result?.error || 'Sync failed');

    const data = result.data ?? {};
    const total = Number(data.total ?? 0);
    const applied = Number(data.applied ?? 0);
    const failed = Number(data.failed ?? 0);
    const firstError = Array.isArray(data.errors) ? data.errors[0]?.message : null;

    if (total === 0) {
      showStatus('暂无需要写回 Chrome 的改动', 'info');
    } else if (applied === 0) {
      showStatus(firstError ? `写回未完成：${firstError}` : '写回未完成，请重新加载扩展后重试', 'error');
    } else if (failed > 0) {
      showStatus(`已写回 ${applied} 项，${failed} 项失败`, 'error');
    } else {
      showStatus(`已安全写回 Chrome：${applied} 项`);
    }

    await loadPanelState();
  } catch {
    showStatus('写回失败，请确认插件权限和本地服务', 'error');
  } finally {
    restore();
  }
}

async function previewSyncBackCount() {
  try {
    const syncPlan = await api('/api/extension/sync-back');
    els.syncBackCount.textContent = countLabel(
      Number(syncPlan.count ?? 0),
      '暂无待写回',
      '项待写回'
    );
  } catch {
    els.syncBackCount.textContent = '-- 项待写回';
  }
}

async function testConnection() {
  const restore = setBusy(els.testConnectionBtn, true, '测试中...');
  try {
    const aiProvider = getFormProviderConfig();
    await api('/api/settings/test-ai', {
      method: 'POST',
      body: JSON.stringify({ aiProvider }),
    });
    showStatus('AI 服务连接成功', 'info');
  } catch (err) {
    const message = err instanceof Error && ['请输入 API Key', '请输入 API 地址', '请输入模型名'].includes(err.message)
      ? err.message
      : '连接失败，请检查 API Key、模型或服务地址';
    showStatus(message, 'error');
  } finally {
    restore();
  }
}

async function saveAIConfig(event) {
  event.preventDefault();
  const restore = setBusy(els.saveConfigBtn, true, '保存中...');
  try {
    const aiProvider = getFormProviderConfig();
    await api('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify({ aiProvider }),
    });
    els.apiKeyInput.value = '';
    showStatus('AI 服务配置已保存');
    await loadPanelState();
    setTimeout(() => setView('home'), 600);
  } catch (err) {
    const message = err instanceof Error && ['请输入 API Key', '请输入 API 地址', '请输入模型名'].includes(err.message)
      ? err.message
      : '保存失败，请检查本地服务是否运行';
    showStatus(message, 'error');
  } finally {
    restore();
  }
}

async function saveBookmarkEdit(event) {
  event.preventDefault();
  if (!currentBookmark) return;

  const restore = setBusy(els.saveBookmarkEditBtn, true, '保存中...');
  try {
    const title = els.editTitleInput.value.trim();
    const url = els.editUrlInput.value.trim();
    if (!title) throw new Error('请输入标题');
    new URL(url);

    const payload = {
      title,
      url,
      folderPath: els.editFolderSelect.value || null,
      summary: els.editSummaryInput.value.trim() || null,
      tags: editTags,
    };

    if (currentBookmark.id !== DEMO_BOOKMARK.id) {
      await api(`/api/bookmarks/${encodeURIComponent(currentBookmark.id)}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
    }

    currentBookmark = { ...currentBookmark, ...payload };
    updateEditPreview();
    showStatus('书签修改已保存');
    loadPanelState();
  } catch (err) {
    const message = err instanceof TypeError
      ? '请输入有效 URL'
      : err instanceof Error ? err.message : '保存失败';
    showStatus(message, 'error');
  } finally {
    restore();
  }
}

async function deleteBookmark() {
  if (!currentBookmark) return;
  if (!confirm('确定要删除这个书签吗？')) return;

  try {
    if (currentBookmark.id !== DEMO_BOOKMARK.id) {
      await api(`/api/bookmarks/${encodeURIComponent(currentBookmark.id)}`, { method: 'DELETE' });
    }
    showStatus('书签已删除');
    showHomeView();
  } catch {
    showStatus('删除失败，请检查本地服务', 'error');
  }
}

async function reanalyzeBookmark() {
  const restore = setBusy(els.reanalyzeBtn, true, '分析中...');
  try {
    if (currentBookmark?.id !== DEMO_BOOKMARK.id) {
      const result = await api(`/api/bookmarks/${encodeURIComponent(currentBookmark.id)}/reanalyze`, {
        method: 'POST',
      });
      if (result.bookmark) await showEditBookmark(result.bookmark);
    } else {
      els.editSummaryInput.value = DEMO_BOOKMARK.summary;
    }
    showStatus('已重新分析网页内容', 'info');
  } catch {
    showStatus('分析失败，请检查 AI 配置', 'error');
  } finally {
    restore();
  }
}

async function checkLinkAvailability() {
  try {
    const parsed = new URL(els.editUrlInput.value.trim());
    if (currentBookmark?.id !== DEMO_BOOKMARK.id) {
      if (els.editUrlInput.value.trim() !== currentBookmark.url) {
        showStatus('请先保存修改后的 URL', 'info');
        return;
      }
      const result = await api(`/api/bookmarks/${encodeURIComponent(currentBookmark.id)}/check-link`, {
        method: 'POST',
      });
      const label = result.ok ? '可访问' : '可能不可用';
      showStatus(`${parsed.hostname} ${label}${result.httpStatus ? ` (${result.httpStatus})` : ''}`, result.ok ? 'info' : 'error');
      return;
    }
    showStatus(`${parsed.hostname} 链接格式有效`, 'info');
  } catch {
    showStatus('请输入有效 URL', 'error');
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

populateProviderSelect();

els.btnConfigureAI.addEventListener('click', showConfigView);
els.settingsBtn.addEventListener('click', showConfigView);
els.backToHomeBtn.addEventListener('click', showHomeView);
els.providerSelect.addEventListener('change', updateProviderFields);
els.testConnectionBtn.addEventListener('click', testConnection);
els.aiConfigForm.addEventListener('submit', saveAIConfig);
els.dashboardLink.addEventListener('click', () => openPage('/'));
els.btnCategoryReview.addEventListener('click', () => openPage('/rescue'));
els.btnSyncBack.addEventListener('click', syncBackToBrowser);
els.btnSaveTab.addEventListener('click', saveCurrentPage);
els.btnImport.addEventListener('click', importBrowserBookmarks);
els.btnRescue.addEventListener('click', runRescue);
els.backFromEditBtn.addEventListener('click', showHomeView);
els.editSettingsBtn.addEventListener('click', showConfigView);
els.editBookmarkForm.addEventListener('submit', saveBookmarkEdit);
els.cancelEditBtn.addEventListener('click', showHomeView);
els.deleteBookmarkBtn.addEventListener('click', deleteBookmark);
els.reanalyzeBtn.addEventListener('click', reanalyzeBookmark);
els.checkLinkBtn.addEventListener('click', checkLinkAvailability);
els.editTitleInput.addEventListener('input', updateEditPreview);
els.editUrlInput.addEventListener('input', updateEditPreview);
els.editTagInput.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ',') return;
  event.preventDefault();
  addEditTag(els.editTagInput.value);
  els.editTagInput.value = '';
});
els.tagChipRow.addEventListener('click', (event) => {
  const button = event.target.closest('[data-remove-tag]');
  if (button) removeEditTag(button.dataset.removeTag);
});
els.commonTagRow.addEventListener('click', (event) => {
  const button = event.target.closest('[data-add-tag]');
  if (button) addEditTag(button.dataset.addTag);
});

loadPanelState();
previewSyncBackCount();
