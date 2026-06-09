import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { DEFAULT_SETTINGS, type AppSettings, type AIProviderConfig } from '@siftmarks/shared';

function loadSettings(): AppSettings {
  const db = getDB();
  const aiProviderStr = db.getSetting('aiProvider');
  const aiProvider: AIProviderConfig = aiProviderStr
    ? JSON.parse(aiProviderStr)
    : DEFAULT_SETTINGS.aiProvider;
  const folderDepth = Number(db.getSetting('folderDepth'));
  const topLevelFolderLimit = Number(db.getSetting('topLevelFolderLimit'));

  return {
    ...DEFAULT_SETTINGS,
    aiProvider,
    enableContentFetching: db.getSetting('enableContentFetching') !== 'false',
    enableBrokenLinkChecking: db.getSetting('enableBrokenLinkChecking') !== 'false',
    enableMcpServer: db.getSetting('enableMcpServer') === 'true',
    localOnlyMode: db.getSetting('localOnlyMode') !== 'false',
    folderDepth: folderDepth === 2 ? 2 : 1,
    topLevelFolderLimit: Number.isFinite(topLevelFolderLimit)
      ? Math.min(Math.max(Math.round(topLevelFolderLimit), 3), 50)
      : DEFAULT_SETTINGS.topLevelFolderLimit,
  };
}

export async function GET() {
  // Strip API key from response
  const settings = loadSettings();
  const safe = {
    ...settings,
    aiProvider: {
      ...settings.aiProvider,
      apiKey: settings.aiProvider.apiKey ? '****' : undefined,
    },
  };
  return NextResponse.json(safe);
}

export async function PATCH(request: Request) {
  const body = await request.json();
  const db = getDB();
  const currentFolderDepth = db.getSetting('folderDepth') === '2' ? 2 : 1;
  const rawCurrentTopLevelFolderLimit = Number(db.getSetting('topLevelFolderLimit'));
  const currentTopLevelFolderLimit = Number.isFinite(rawCurrentTopLevelFolderLimit)
    ? Math.min(Math.max(Math.round(rawCurrentTopLevelFolderLimit), 3), 50)
    : DEFAULT_SETTINGS.topLevelFolderLimit;
  let nextFolderDepth = currentFolderDepth;
  let nextTopLevelFolderLimit = currentTopLevelFolderLimit;

  if (body.aiProvider) {
    const currentStr = db.getSetting('aiProvider');
    const current: AIProviderConfig | null = currentStr ? JSON.parse(currentStr) : null;
    const next: AIProviderConfig = { ...body.aiProvider };

    if (
      next.type === 'openai-compatible' &&
      current?.type === 'openai-compatible' &&
      !next.apiKey &&
      current.apiKey &&
      !body.clearApiKey
    ) {
      next.apiKey = current.apiKey;
    }

    if (body.clearApiKey) {
      delete next.apiKey;
    }

    db.setSetting('aiProvider', JSON.stringify(next));
  }
  if (body.enableContentFetching !== undefined) {
    db.setSetting('enableContentFetching', String(body.enableContentFetching));
  }
  if (body.enableBrokenLinkChecking !== undefined) {
    db.setSetting('enableBrokenLinkChecking', String(body.enableBrokenLinkChecking));
  }
  if (body.enableMcpServer !== undefined) {
    db.setSetting('enableMcpServer', String(body.enableMcpServer));
  }
  if (body.localOnlyMode !== undefined) {
    db.setSetting('localOnlyMode', String(body.localOnlyMode));
  }
  if (body.folderDepth !== undefined) {
    nextFolderDepth = Number(body.folderDepth) === 2 ? 2 : 1;
    db.setSetting('folderDepth', String(nextFolderDepth));
  }
  if (body.topLevelFolderLimit !== undefined) {
    const value = Number(body.topLevelFolderLimit);
    nextTopLevelFolderLimit = Number.isFinite(value)
      ? Math.min(Math.max(Math.round(value), 3), 50)
      : DEFAULT_SETTINGS.topLevelFolderLimit;
    db.setSetting('topLevelFolderLimit', String(nextTopLevelFolderLimit));
  }

  const folderDepthChanged = nextFolderDepth !== currentFolderDepth;
  const topLevelFolderLimitChanged = nextTopLevelFolderLimit !== currentTopLevelFolderLimit;
  const topLevelFolderLimitDecreased = topLevelFolderLimitChanged && nextTopLevelFolderLimit < currentTopLevelFolderLimit;
  const topLevelFolderCount = new Set(
    db
      .listFolders()
      .map((folder) => folder.path.split('/')[0])
      .filter(Boolean)
  ).size;
  const topLevelFolderLimitExceeded = topLevelFolderLimitDecreased && topLevelFolderCount > nextTopLevelFolderLimit;
  let clearedPendingFolderSuggestions = 0;

  if (folderDepthChanged) {
    const pendingMoveSuggestions = db.listSuggestions({ status: 'pending', type: 'move', limit: 100000 });
    clearedPendingFolderSuggestions = pendingMoveSuggestions.total;
    db.clearPendingSuggestionsByType('move');
  }

  return NextResponse.json({
    ok: true,
    folderDepthChanged,
    topLevelFolderLimitChanged,
    topLevelFolderLimitDecreased,
    topLevelFolderLimitExceeded,
    topLevelFolderCount,
    topLevelFolderLimit: nextTopLevelFolderLimit,
    folderPolicyChanged: folderDepthChanged || topLevelFolderLimitChanged,
    clearedPendingFolderSuggestions,
  });
}
