import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { createProvider } from '@siftmarks/ai';
import type { AIProviderConfig } from '@siftmarks/shared';

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => {
      setTimeout(() => reject(new Error('AI test timed out')), timeoutMs);
    }),
  ]);
}

function isLocalOpenAICompatible(baseUrl: string | undefined): boolean {
  if (!baseUrl) return false;

  try {
    const url = new URL(baseUrl);
    return ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const body = await request.json();
  const aiProvider = body.aiProvider as AIProviderConfig | undefined;

  if (!aiProvider || aiProvider.type === 'mock') {
    return NextResponse.json(
      { ok: false, error: 'Configure an OpenAI-compatible or Ollama-compatible provider first.' },
      { status: 400 }
    );
  }

  if (aiProvider.type === 'openai-compatible' && (!aiProvider.apiKey || aiProvider.apiKey === '****')) {
    const savedStr = getDB().getSetting('aiProvider');
    const saved = savedStr ? JSON.parse(savedStr) as AIProviderConfig : null;
    const sameEndpoint = saved?.baseUrl?.replace(/\/$/, '') === aiProvider.baseUrl?.replace(/\/$/, '');

    if (saved?.type === 'openai-compatible' && sameEndpoint && saved.apiKey) {
      aiProvider.apiKey = saved.apiKey;
    }
  }

  if (aiProvider.type === 'openai-compatible' && !aiProvider.apiKey && !isLocalOpenAICompatible(aiProvider.baseUrl)) {
    return NextResponse.json(
      { ok: false, error: 'API key is required.' },
      { status: 400 }
    );
  }

  try {
    const provider = createProvider(aiProvider);
    const result = await withTimeout(
      provider.chat([
        { role: 'system', content: 'Reply with exactly: ok' },
        { role: 'user', content: 'Connectivity test.' },
      ]),
      15000
    );

    return NextResponse.json({
      ok: true,
      provider: aiProvider.type,
      model: aiProvider.chatModel,
      responsePreview: result.slice(0, 80),
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 502 }
    );
  }
}
