import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { DEFAULT_SETTINGS, type AppSettings, type AIProviderConfig } from '@siftmarks/shared';

function loadSettings(): AppSettings {
  const db = getDB();
  const aiProviderStr = db.getSetting('aiProvider');
  const aiProvider: AIProviderConfig = aiProviderStr
    ? JSON.parse(aiProviderStr)
    : DEFAULT_SETTINGS.aiProvider;

  return {
    ...DEFAULT_SETTINGS,
    aiProvider,
    enableContentFetching: db.getSetting('enableContentFetching') !== 'false',
    enableBrokenLinkChecking: db.getSetting('enableBrokenLinkChecking') !== 'false',
    enableMcpServer: db.getSetting('enableMcpServer') === 'true',
    localOnlyMode: db.getSetting('localOnlyMode') !== 'false',
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
    db.setSetting('aiProvider', JSON.stringify(body.aiProvider));
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

  return NextResponse.json({ ok: true });
}
