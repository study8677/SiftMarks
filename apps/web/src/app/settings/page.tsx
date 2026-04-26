'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n';

interface Settings {
  aiProvider: {
    type: string;
    baseUrl?: string;
    apiKey?: string;
    chatModel?: string;
    embeddingModel?: string;
  };
  enableContentFetching: boolean;
  enableBrokenLinkChecking: boolean;
  enableMcpServer: boolean;
  localOnlyMode: boolean;
}

export default function SettingsPage() {
  const { t } = useI18n();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [providerType, setProviderType] = useState('mock');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [chatModel, setChatModel] = useState('');
  const [embeddingModel, setEmbeddingModel] = useState('');

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((data) => {
        setSettings(data);
        setProviderType(data.aiProvider.type);
        setBaseUrl(data.aiProvider.baseUrl ?? '');
        setApiKey('');
        setChatModel(data.aiProvider.chatModel ?? '');
        setEmbeddingModel(data.aiProvider.embeddingModel ?? '');
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const aiProvider: any = { type: providerType };

    if (providerType !== 'mock') {
      if (baseUrl) aiProvider.baseUrl = baseUrl;
      if (apiKey) aiProvider.apiKey = apiKey;
      if (chatModel) aiProvider.chatModel = chatModel;
      if (embeddingModel) aiProvider.embeddingModel = embeddingModel;
    }

    await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aiProvider }),
    });

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleResetDB = () => {
    alert('To reset: delete ~/.siftmarks/siftmarks.sqlite and run `siftmarks init`.');
  };

  if (loading) return <div className="text-muted animate-pulse">{t.common.loading}</div>;

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">{t.settings.title}</h1>

      <section className="bg-card border border-border rounded-lg p-6 mb-6">
        <h2 className="font-semibold mb-4">{t.settings.aiProvider}</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">{t.settings.providerType}</label>
            <select
              value={providerType}
              onChange={(e) => setProviderType(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded bg-background"
            >
              <option value="mock">{t.settings.mock}</option>
              <option value="openai-compatible">{t.settings.openai}</option>
              <option value="ollama-compatible">{t.settings.ollama}</option>
            </select>
          </div>

          {providerType !== 'mock' && (
            <>
              <div>
                <label className="block text-sm font-medium mb-1">{t.settings.baseUrl}</label>
                <input
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder={providerType === 'ollama-compatible' ? 'http://localhost:11434' : 'https://api.openai.com/v1'}
                  className="w-full px-3 py-2 border border-border rounded bg-background"
                />
              </div>

              {providerType === 'openai-compatible' && (
                <div>
                  <label className="block text-sm font-medium mb-1">{t.settings.apiKey}</label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={settings?.aiProvider.apiKey ? '****' : 'sk-...'}
                    className="w-full px-3 py-2 border border-border rounded bg-background"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-1">{t.settings.chatModel}</label>
                <input
                  value={chatModel}
                  onChange={(e) => setChatModel(e.target.value)}
                  placeholder={providerType === 'ollama-compatible' ? 'llama3.2' : 'gpt-4o-mini'}
                  className="w-full px-3 py-2 border border-border rounded bg-background"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">{t.settings.embeddingModel}</label>
                <input
                  value={embeddingModel}
                  onChange={(e) => setEmbeddingModel(e.target.value)}
                  placeholder={providerType === 'ollama-compatible' ? 'nomic-embed-text' : 'text-embedding-3-small'}
                  className="w-full px-3 py-2 border border-border rounded bg-background"
                />
              </div>
            </>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-accent text-white rounded-md text-sm hover:opacity-90 transition disabled:opacity-50"
            >
              {saving ? t.settings.saving : t.settings.save}
            </button>
            {saved && <span className="text-sm text-success">{t.settings.saved}</span>}
          </div>
        </div>
      </section>

      <section className="bg-card border border-border rounded-lg p-6 mb-6">
        <h2 className="font-semibold mb-2">{t.settings.privacy}</h2>
        <p className="text-sm text-muted mb-4">{t.settings.privacyDesc}</p>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span>{t.settings.currentProvider}</span>
            <span className="font-mono text-xs">{settings?.aiProvider.type ?? 'mock'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>{t.settings.localOnly}</span>
            <span className="text-success">{settings?.localOnlyMode ? t.settings.on : t.settings.off}</span>
          </div>
        </div>
      </section>

      <section className="bg-card border border-danger/30 rounded-lg p-6">
        <h2 className="font-semibold text-danger mb-2">{t.settings.dangerZone}</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm">{t.settings.resetDB}</p>
            <p className="text-xs text-muted">{t.settings.resetDBDesc}</p>
          </div>
          <button
            onClick={handleResetDB}
            className="px-3 py-1.5 text-sm text-danger border border-danger/30 rounded hover:bg-danger-light transition"
          >
            {t.settings.reset}
          </button>
        </div>
      </section>
    </div>
  );
}
