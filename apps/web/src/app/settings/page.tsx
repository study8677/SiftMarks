'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AIProviderConfig } from '@siftmarks/shared';
import { useI18n } from '@/lib/i18n';

interface Settings {
  aiProvider: AIProviderConfig;
  enableContentFetching: boolean;
  enableBrokenLinkChecking: boolean;
  enableMcpServer: boolean;
  localOnlyMode: boolean;
}

interface ProviderPreset {
  id: string;
  label: string;
  badge: string;
  desc: string;
  type: AIProviderConfig['type'];
  baseUrl: string;
  chatModel: string;
  embeddingModel: string;
  requiresApiKey: boolean;
  keyPlaceholder: string;
}

const PROVIDERS: ProviderPreset[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    badge: '推荐',
    desc: '通用能力强，适合摘要、标签、智能搜索。',
    type: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    chatModel: 'gpt-4o-mini',
    embeddingModel: 'text-embedding-3-small',
    requiresApiKey: true,
    keyPlaceholder: 'sk-...',
  },
  {
    id: 'gemini',
    label: 'Gemini',
    badge: 'OpenAI 兼容',
    desc: '通过 Gemini OpenAI 兼容接口接入，适合摘要、标签和多语言内容理解。',
    type: 'openai-compatible',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    chatModel: 'gemini-2.5-flash',
    embeddingModel: 'gemini-embedding-001',
    requiresApiKey: true,
    keyPlaceholder: 'AIza...',
  },
  {
    id: 'grok',
    label: 'Grok / xAI',
    badge: '推理',
    desc: '通过 xAI OpenAI 兼容接口接入 Grok 模型，适合快速摘要和分析。',
    type: 'openai-compatible',
    baseUrl: 'https://api.x.ai/v1',
    chatModel: 'grok-4',
    embeddingModel: '',
    requiresApiKey: true,
    keyPlaceholder: 'xai-...',
  },
  {
    id: 'minimax',
    label: 'MiniMax',
    badge: '中文友好',
    desc: '适合中文书签整理和内容理解。',
    type: 'openai-compatible',
    baseUrl: 'https://api.minimaxi.com/v1',
    chatModel: 'MiniMax-M3',
    embeddingModel: 'embo-01',
    requiresApiKey: true,
    keyPlaceholder: '请输入 MiniMax API Key',
  },
  {
    id: 'qwen',
    label: '通义千问 / Qwen',
    badge: '兼容模式',
    desc: '通过 DashScope OpenAI 兼容接口接入。',
    type: 'openai-compatible',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    chatModel: 'qwen-plus',
    embeddingModel: 'text-embedding-v4',
    requiresApiKey: true,
    keyPlaceholder: 'sk-...',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    badge: '分析',
    desc: '适合低成本推理和标签分析；向量模型可按实际兼容服务调整。',
    type: 'openai-compatible',
    baseUrl: 'https://api.deepseek.com/v1',
    chatModel: 'deepseek-chat',
    embeddingModel: '',
    requiresApiKey: true,
    keyPlaceholder: 'sk-...',
  },
  {
    id: 'moonshot',
    label: 'Kimi / Moonshot',
    badge: '长上下文',
    desc: '适合长文档书签摘要和资料整理。',
    type: 'openai-compatible',
    baseUrl: 'https://api.moonshot.cn/v1',
    chatModel: 'moonshot-v1-8k',
    embeddingModel: '',
    requiresApiKey: true,
    keyPlaceholder: 'sk-...',
  },
  {
    id: 'zhipu',
    label: '智谱 GLM',
    badge: '国产',
    desc: '适合中文标签、标题优化和内容归纳。',
    type: 'openai-compatible',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    chatModel: 'glm-4-flash',
    embeddingModel: 'embedding-3',
    requiresApiKey: true,
    keyPlaceholder: '请输入智谱 API Key',
  },
  {
    id: 'doubao',
    label: '豆包 / 火山方舟',
    badge: '国内',
    desc: '通过火山方舟 OpenAI 兼容接口接入豆包模型。',
    type: 'openai-compatible',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    chatModel: 'doubao-1-5-lite-32k',
    embeddingModel: '',
    requiresApiKey: true,
    keyPlaceholder: '请输入火山方舟 API Key',
  },
  {
    id: 'siliconflow',
    label: 'SiliconFlow',
    badge: '多模型',
    desc: '可接入 Qwen、DeepSeek、GLM 等多种开源或商业模型。',
    type: 'openai-compatible',
    baseUrl: 'https://api.siliconflow.cn/v1',
    chatModel: 'Qwen/Qwen2.5-72B-Instruct',
    embeddingModel: 'BAAI/bge-m3',
    requiresApiKey: true,
    keyPlaceholder: 'sk-...',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    badge: '聚合',
    desc: '一个 Key 接入多家模型，适合试用和路由。',
    type: 'openai-compatible',
    baseUrl: 'https://openrouter.ai/api/v1',
    chatModel: 'openai/gpt-4o-mini',
    embeddingModel: '',
    requiresApiKey: true,
    keyPlaceholder: 'sk-or-...',
  },
  {
    id: 'groq',
    label: 'Groq',
    badge: '高速',
    desc: '适合快速标签和摘要，向量模型可另配。',
    type: 'openai-compatible',
    baseUrl: 'https://api.groq.com/openai/v1',
    chatModel: 'llama-3.3-70b-versatile',
    embeddingModel: '',
    requiresApiKey: true,
    keyPlaceholder: 'gsk_...',
  },
  {
    id: 'together',
    label: 'Together AI',
    badge: '开源模型',
    desc: '适合接入 Llama、Qwen 等开源模型。',
    type: 'openai-compatible',
    baseUrl: 'https://api.together.xyz/v1',
    chatModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    embeddingModel: 'BAAI/bge-base-en-v1.5',
    requiresApiKey: true,
    keyPlaceholder: '请输入 Together API Key',
  },
  {
    id: 'lmstudio',
    label: 'LM Studio 本地服务',
    badge: '本地',
    desc: '本机运行 OpenAI 兼容服务，适合离线或局域网模型。',
    type: 'openai-compatible',
    baseUrl: 'http://localhost:1234/v1',
    chatModel: 'local-model',
    embeddingModel: '',
    requiresApiKey: false,
    keyPlaceholder: '',
  },
  {
    id: 'ollama',
    label: 'Ollama 本地模型',
    badge: '本地',
    desc: '在本机运行模型，不需要云端 API Key。',
    type: 'ollama-compatible',
    baseUrl: 'http://localhost:11434',
    chatModel: 'qwen2.5',
    embeddingModel: 'nomic-embed-text',
    requiresApiKey: false,
    keyPlaceholder: '',
  },
  {
    id: 'custom',
    label: '自定义 OpenAI 兼容',
    badge: '高级',
    desc: '用于代理网关、第三方兼容接口或私有模型服务。',
    type: 'openai-compatible',
    baseUrl: '',
    chatModel: '',
    embeddingModel: '',
    requiresApiKey: true,
    keyPlaceholder: '请输入兼容接口 API Key',
  },
];

function inferProviderId(config: AIProviderConfig): string {
  if (config.type === 'ollama-compatible') return 'ollama';
  const baseUrl = config.baseUrl?.replace(/\/$/, '');
  return PROVIDERS.find((provider) => provider.type === config.type && provider.baseUrl.replace(/\/$/, '') === baseUrl)?.id ?? 'custom';
}

function suggestedOpenAIBaseUrl(baseUrl: string): string | null {
  const raw = baseUrl.trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    const hasOnlyOrigin = url.pathname === '/' && !url.search && !url.hash;
    if (!hasOnlyOrigin || !['http:', 'https:'].includes(url.protocol)) return null;

    return `${url.origin}/v1`;
  } catch {
    return null;
  }
}

export default function SettingsPage() {
  const { t } = useI18n();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [error, setError] = useState('');

  const [providerId, setProviderId] = useState('openai');
  const [baseUrl, setBaseUrl] = useState(PROVIDERS[0].baseUrl);
  const [apiKey, setApiKey] = useState('');
  const [chatModel, setChatModel] = useState(PROVIDERS[0].chatModel);
  const [embeddingModel, setEmbeddingModel] = useState(PROVIDERS[0].embeddingModel);

  const selectedProvider = useMemo(
    () => PROVIDERS.find((provider) => provider.id === providerId) ?? PROVIDERS[0],
    [providerId]
  );

  const canReuseSavedKey = Boolean(
    selectedProvider.requiresApiKey &&
    settings?.aiProvider.apiKey &&
    settings.aiProvider.type === selectedProvider.type &&
    settings.aiProvider.baseUrl?.replace(/\/$/, '') === baseUrl.replace(/\/$/, '')
  );

  const baseUrlSuggestion = selectedProvider.type === 'openai-compatible'
    ? suggestedOpenAIBaseUrl(baseUrl)
    : null;
  const hasRequiredCredential = !selectedProvider.requiresApiKey || Boolean(apiKey.trim()) || canReuseSavedKey;
  const isReady = Boolean(baseUrl.trim() && chatModel.trim() && hasRequiredCredential);

  const loadSettings = useCallback(async () => {
    const res = await fetch('/api/settings');
    const data = await res.json();
    const inferredProviderId = data.aiProvider.type === 'mock' ? 'openai' : inferProviderId(data.aiProvider);
    const preset = PROVIDERS.find((provider) => provider.id === inferredProviderId) ?? PROVIDERS[0];

    setSettings(data);
    setProviderId(inferredProviderId);
    setBaseUrl(data.aiProvider.type === 'mock' ? preset.baseUrl : data.aiProvider.baseUrl ?? preset.baseUrl);
    setApiKey('');
    setChatModel(data.aiProvider.type === 'mock' ? preset.chatModel : data.aiProvider.chatModel ?? preset.chatModel);
    setEmbeddingModel(data.aiProvider.type === 'mock' ? preset.embeddingModel : data.aiProvider.embeddingModel ?? preset.embeddingModel);
  }, []);

  useEffect(() => {
    // Existing app pages hydrate local API state from client effects.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSettings().catch(() => setError('设置加载失败。')).finally(() => setLoading(false));
  }, [loadSettings]);

  function selectProvider(provider: ProviderPreset) {
    setProviderId(provider.id);
    setBaseUrl(provider.baseUrl);
    setApiKey('');
    setChatModel(provider.chatModel);
    setEmbeddingModel(provider.embeddingModel);
    setSaved(false);
    setTestResult(null);
    setError('');
  }

  function buildProviderConfig(includeMaskedKey = false): AIProviderConfig {
    const config: AIProviderConfig = {
      type: selectedProvider.type,
      baseUrl: baseUrl.trim(),
      chatModel: chatModel.trim(),
      embeddingModel: embeddingModel.trim() || undefined,
    };

    if (selectedProvider.requiresApiKey) {
      if (apiKey.trim()) {
        config.apiKey = apiKey.trim();
      } else if (includeMaskedKey && canReuseSavedKey) {
        config.apiKey = '****';
      }
    }

    return config;
  }

  async function handleSave() {
    setError('');
    setSaved(false);

    if (!isReady) {
      setError('SiftMarks 是 AI 书签管家；请配置一个可用的 AI 服务来生成摘要、标签和搜索索引。');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aiProvider: buildProviderConfig() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? '保存失败。');
      }

      await loadSettings();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败。');
    } finally {
      setSaving(false);
    }
  }

  async function handleClearApiKey() {
    setError('');
    setSaved(false);
    setTestResult(null);
    setSaving(true);

    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aiProvider: buildProviderConfig(false),
          clearApiKey: true,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? '删除失败。');
      }

      await loadSettings();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败。');
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setError('');
    setTestResult(null);

    if (!isReady) {
      setError('请先补齐 API 地址、模型和 Key，再测试连接。');
      return;
    }

    setTesting(true);
    try {
      const res = await fetch('/api/settings/test-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aiProvider: buildProviderConfig(true) }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? '连接失败。');
      }

      setTestResult({ ok: true, message: `连接成功：${data.provider} / ${data.model ?? chatModel}` });
    } catch (err) {
      setTestResult({ ok: false, message: err instanceof Error ? err.message : '连接失败。' });
    } finally {
      setTesting(false);
    }
  }

  const handleResetDB = () => {
    alert('To reset: delete ~/.siftmarks/siftmarks.sqlite and run `siftmarks init`.');
  };

  if (loading) return <div className="text-muted animate-pulse">{t.common.loading}</div>;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#1463ff]">AI Provider Center</p>
          <h1 className="mt-1 text-[22px] font-bold tracking-tight text-[#101828]">AI 接入中心</h1>
          <p className="mt-1 text-sm text-[#475467]">
            默认只需要服务商、API Key、模型和测试连接；Base URL、向量模型和本地模型保留给高级配置。Key 仅写入本机 SiftMarks 数据库，接口响应不会回显明文。
          </p>
        </div>
        <div className={`rounded-xl border px-4 py-3 text-sm ${
          isReady ? 'border-[#b7ebc6] bg-[#f0fff4] text-[#157347]' : 'border-[#ffd2d2] bg-[#fff8f8] text-[#b42318]'
        }`}>
          {isReady ? 'AI 服务已具备保存条件' : 'AI 服务未配置完整'}
        </div>
      </header>

      {error && (
        <div className="rounded-lg border border-[#ffd2d2] bg-[#fff8f8] px-4 py-3 text-sm text-[#b42318]">
          {error}
        </div>
      )}

      <section className="rounded-xl border border-[#dfe6f2] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-[#101828]">选择 AI Key 类型</h2>
            <p className="mt-1 text-sm text-[#667085]">选择服务商后会自动填充常用 API 地址和模型名。</p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {PROVIDERS.map((provider) => (
            <button
              key={provider.id}
              onClick={() => selectProvider(provider)}
              className={`rounded-xl border p-4 text-left transition ${
                providerId === provider.id
                  ? 'border-[#1463ff] bg-[#eef4ff]'
                  : 'border-[#dfe6f2] bg-[#fbfdff] hover:border-[#b9d3ff]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-[#101828]">{provider.label}</span>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-[#1463ff]">{provider.badge}</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-[#667085]">{provider.desc}</p>
            </button>
          ))}
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <Field label="API 地址">
            <>
              <input
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                placeholder={selectedProvider.type === 'ollama-compatible' ? 'http://localhost:11434' : 'https://api.example.com/v1'}
                className="h-10 w-full rounded-lg border border-[#dfe6f2] bg-[#fbfdff] px-3 text-sm outline-none focus:border-[#1463ff]"
              />
              {baseUrlSuggestion && (
                <p className="mt-2 text-xs leading-5 text-[#b54708]">
                  这个地址看起来像服务首页。OpenAI 兼容接口通常要填到接口前缀，例如 {baseUrlSuggestion}。
                </p>
              )}
            </>
          </Field>

          {selectedProvider.requiresApiKey && (
            <Field label="API Key">
              <input
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={canReuseSavedKey ? '已保存 Key；留空则沿用' : selectedProvider.keyPlaceholder}
                className="h-10 w-full rounded-lg border border-[#dfe6f2] bg-[#fbfdff] px-3 text-sm outline-none focus:border-[#1463ff]"
              />
            </Field>
          )}

          <Field label="对话模型">
            <input
              value={chatModel}
              onChange={(event) => setChatModel(event.target.value)}
              placeholder="gpt-4o-mini"
              className="h-10 w-full rounded-lg border border-[#dfe6f2] bg-[#fbfdff] px-3 text-sm outline-none focus:border-[#1463ff]"
            />
          </Field>

          <Field label="向量模型">
            <input
              value={embeddingModel}
              onChange={(event) => setEmbeddingModel(event.target.value)}
              placeholder={selectedProvider.id === 'deepseek' ? '按兼容服务填写，可留空后续补齐' : 'text-embedding-3-small'}
              className="h-10 w-full rounded-lg border border-[#dfe6f2] bg-[#fbfdff] px-3 text-sm outline-none focus:border-[#1463ff]"
            />
          </Field>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="h-10 rounded-lg bg-[#1463ff] px-4 text-sm font-semibold text-white shadow-sm shadow-blue-200 disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存 AI 配置'}
          </button>
          <button
            onClick={handleTest}
            disabled={testing}
            className="h-10 rounded-lg border border-[#dfe6f2] bg-white px-4 text-sm font-semibold text-[#344054] disabled:opacity-50"
          >
            {testing ? '测试中...' : '测试连接'}
          </button>
          {saved && <span className="text-sm font-medium text-[#157347]">已保存</span>}
          {testResult && (
            <span className={`max-w-full break-words text-sm font-medium ${testResult.ok ? 'text-[#157347]' : 'text-[#b42318]'}`}>
              {testResult.message}
            </span>
          )}
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <SecurityNote title="本地保存" desc="Key 写入本机 SiftMarks 数据库，不会同步到云端。" />
          <SecurityNote title="不会回显" desc="设置接口只返回掩码，页面留空会沿用已保存 Key。" />
          <SecurityNote title="可随时删除" desc="删除后需要重新输入 Key 才能调用外部 AI。" />
        </div>

        {canReuseSavedKey && (
          <button
            onClick={handleClearApiKey}
            disabled={saving}
            className="mt-4 rounded-lg border border-[#ffd2d2] px-3 py-2 text-sm font-semibold text-[#b42318] hover:bg-[#fff8f8] disabled:opacity-50"
          >
            删除已保存 Key
          </button>
        )}
      </section>

      <section className="rounded-xl border border-[#dfe6f2] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
        <h2 className="font-semibold text-[#101828]">当前生效逻辑</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <StatusItem label="产品定位" value="AI 书签管家" />
          <StatusItem label="当前 Provider" value={settings?.aiProvider.type === 'mock' ? '未配置真实 AI' : selectedProvider.label} />
          <StatusItem label="本地优先" value={settings?.localOnlyMode ? '开启' : '关闭'} />
        </div>
        <p className="mt-4 text-sm leading-6 text-[#667085]">
          标签只作为辅助检索元数据，AI 会优先复用已有标签、减少近义标签，避免越生成越多。文件夹层级和一级上限在「整理建议」页配置，因为它会直接影响分类建议生成。
        </p>
      </section>

      <section className="rounded-xl border border-[#ffd2d2] bg-white p-5">
        <h2 className="font-semibold text-[#b42318]">危险区域</h2>
        <div className="mt-3 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-[#101828]">重置数据库</p>
            <p className="text-xs text-[#667085]">删除所有书签、标签和建议。目前这里只提供手动提示。</p>
          </div>
          <button
            onClick={handleResetDB}
            className="rounded-lg border border-[#ffd2d2] px-3 py-1.5 text-sm font-semibold text-[#b42318] hover:bg-[#fff8f8]"
          >
            重置
          </button>
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-[#344054]">{label}</span>
      {children}
    </label>
  );
}

function StatusItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#dfe6f2] bg-[#fbfdff] p-4">
      <div className="text-xs text-[#667085]">{label}</div>
      <div className="mt-1 text-sm font-semibold text-[#101828]">{value}</div>
    </div>
  );
}

function SecurityNote({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-lg border border-[#dfe6f2] bg-[#fbfdff] p-3">
      <div className="text-sm font-semibold text-[#101828]">{title}</div>
      <div className="mt-1 text-xs leading-5 text-[#667085]">{desc}</div>
    </div>
  );
}
