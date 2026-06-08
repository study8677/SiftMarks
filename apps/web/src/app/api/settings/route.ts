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
    db.setSetting('folderDepth', Number(body.folderDepth) === 2 ? '2' : '1');
  }
  if (body.topLevelFolderLimit !== undefined) {
    const value = Number(body.topLevelFolderLimit);
    const normalized = Number.isFinite(value) ? Math.min(Math.max(Math.round(value), 3), 50) : DEFAULT_SETTINGS.topLevelFolderLimit;
    db.setSetting('topLevelFolderLimit', String(normalized));
  }

  return NextResponse.json({ ok: true });
}
