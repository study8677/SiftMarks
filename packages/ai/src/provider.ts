import type {
  AIProviderConfig,
  AISummaryResult,
  AITagResult,
  AITitleResult,
  Bookmark,
} from '@siftmarks/shared';
import { cleanBookmarkSummary, extractJSONFromAIText } from '@siftmarks/shared';

export interface AIProvider {
  readonly name: string;

  summarizeBookmark(bookmark: Bookmark): Promise<AISummaryResult>;
  generateTags(bookmark: Bookmark, options?: AITagOptions): Promise<AITagResult>;
  suggestBetterTitle(bookmark: Bookmark): Promise<AITitleResult>;
  generateEmbedding(text: string): Promise<number[]>;
  rewriteSearchQuery(query: string): Promise<string>;
  chat(messages: Array<{ role: string; content: string }>): Promise<string>;
}

export interface AITagOptions {
  existingTags?: string[];
  maxTags?: number;
}

function compactErrorDetail(value: unknown): string {
  if (!value) return '';

  if (typeof value === 'string') {
    return value.replace(/\s+/g, ' ').trim().slice(0, 240);
  }

  if (typeof value === 'object') {
    const record = value as Record<string, any>;
    const nested = record.error;

    if (typeof nested === 'string') return compactErrorDetail(nested);
    if (nested && typeof nested === 'object') {
      return compactErrorDetail(nested.message ?? nested.type ?? nested.code ?? nested);
    }

    return compactErrorDetail(record.message ?? record.detail ?? JSON.stringify(value));
  }

  return String(value).slice(0, 240);
}

async function openAICompatibleError(response: Response, requestUrl: string): Promise<Error> {
  let detail = '';

  try {
    detail = compactErrorDetail(await response.clone().json());
  } catch {
    try {
      const text = await response.text();
      const title = text.match(/<title[^>]*>(.*?)<\/title>/is)?.[1];
      detail = compactErrorDetail(title ?? text.replace(/<[^>]*>/g, ' '));
    } catch {
      detail = '';
    }
  }

  const hint = response.status === 404
    ? '。请确认 API 地址是否填到 OpenAI 兼容接口前缀（常见是 /v1），如果地址已经包含 /v1，再检查模型名是否存在'
    : '';
  const detailText = detail ? `。服务返回：${detail}` : '';

  return new Error(`AI request failed: ${response.status}${hint}。请求路径：${requestUrl}${detailText}`);
}

// --- Mock Provider ---

export class MockProvider implements AIProvider {
  readonly name = 'mock';

  async summarizeBookmark(_bookmark: Bookmark): Promise<AISummaryResult> {
    return {
      shortSummary: '未配置 AI，暂时无法生成网页摘要。',
      summary: '未配置 AI，暂时无法生成网页摘要。',
    };
  }

  async generateTags(_bookmark: Bookmark, _options?: AITagOptions): Promise<AITagResult> {
    return { tags: [{ name: 'untagged', confidence: 1.0 }] };
  }

  async suggestBetterTitle(_bookmark: Bookmark): Promise<AITitleResult> {
    return { title: '', confidence: 0 };
  }

  async generateEmbedding(_text: string): Promise<number[]> {
    return [];
  }

  async rewriteSearchQuery(query: string): Promise<string> {
    return query;
  }

  async chat(_messages: Array<{ role: string; content: string }>): Promise<string> {
    return '[]';
  }
}

// --- OpenAI-Compatible Provider ---

export class OpenAICompatibleProvider implements AIProvider {
  readonly name = 'openai-compatible';
  private baseUrl: string;
  private apiKey: string;
  private chatModel: string;
  private embeddingModel: string;

  constructor(config: AIProviderConfig) {
    this.baseUrl = (config.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '');
    this.apiKey = config.apiKey ?? '';
    this.chatModel = config.chatModel ?? 'gpt-4o-mini';
    this.embeddingModel = config.embeddingModel?.trim() ?? '';
  }

  async chat(messages: Array<{ role: string; content: string }>): Promise<string> {
    const requestUrl = `${this.baseUrl}/chat/completions`;
    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.chatModel,
        messages,
        temperature: 0.3,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      throw await openAICompatibleError(response, requestUrl);
    }

    const data = (await response.json()) as any;
    return data.choices?.[0]?.message?.content ?? '';
  }

  async summarizeBookmark(bookmark: Bookmark): Promise<AISummaryResult> {
    const content = [
      bookmark.title ? `Title: ${bookmark.title}` : '',
      `URL: ${bookmark.url}`,
      bookmark.description ? `Description: ${bookmark.description}` : '',
      bookmark.contentText ? `Content: ${bookmark.contentText.slice(0, 4000)}` : '',
      bookmark.folderPath ? `Folder: ${bookmark.folderPath}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const result = await this.chat([
      {
        role: 'system',
        content: `你是中文书签管家，负责给收藏网页生成便于搜索的一句话摘要。必须返回 JSON：{"shortSummary":"中文一句话，80字以内，说明这个网页是干什么的","summary":"同 shortSummary，可以稍微更完整但仍然只写一句话"}。不要输出 markdown，不要输出 <think>，不要编造输入里没有的信息。工具/项目说明用途，文章提炼核心观点。`,
      },
      { role: 'user', content },
    ]);

    try {
      const parsed = JSON.parse(extractJSONFromAIText(result)) as AISummaryResult;
      const shortSummary = cleanBookmarkSummary(parsed.shortSummary, parsed.summary, 120) ?? '';
      const summary = cleanBookmarkSummary(parsed.summary, shortSummary, 180) ?? shortSummary;
      return { shortSummary, summary };
    } catch {
      const summary = cleanBookmarkSummary(result, bookmark.description, 180) ?? '';
      return { shortSummary: summary, summary };
    }
  }

  async generateTags(bookmark: Bookmark, options: AITagOptions = {}): Promise<AITagResult> {
    const existingTags = Array.from(new Set((options.existingTags ?? []).map((tag) => tag.trim()).filter(Boolean))).slice(0, 120);
    const maxTags = Number.isFinite(options.maxTags) ? Math.min(Math.max(Math.round(options.maxTags!), 1), 3) : 3;
    const content = [
      existingTags.length > 0 ? `EXISTING_TAGS: ${JSON.stringify(existingTags)}` : '',
      `MAX_TAGS: ${maxTags}`,
      bookmark.title ? `Title: ${bookmark.title}` : '',
      `URL: ${bookmark.url}`,
      bookmark.summary ?? bookmark.description ?? '',
      bookmark.contentText ? `Content: ${bookmark.contentText.slice(0, 3000)}` : '',
      bookmark.folderPath ? `Folder: ${bookmark.folderPath}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const result = await this.chat([
      {
        role: 'system',
        content: `Generate compact tags for a bookmarked web page. Return JSON: {"tags": [{"name": "tag-name", "confidence": 0.9}]}. Rules: use 1-${maxTags} tags, fewer is better; first reuse exact names from EXISTING_TAGS when one fits; create a new tag only when no existing tag covers the concept; normalize and merge synonyms instead of creating near-duplicate tags; lowercase kebab-case for new tags; no generic words like "article"/"website"/"homepage"; keep proper nouns (mcp, sqlite, react); avoid tags that cannot be grounded in the input.`,
      },
      { role: 'user', content },
    ]);

    try {
      return JSON.parse(extractJSONFromAIText(result));
    } catch {
      return { tags: [] };
    }
  }

  async suggestBetterTitle(bookmark: Bookmark): Promise<AITitleResult> {
    const content = [
      `Current title: ${bookmark.title ?? '(empty)'}`,
      `URL: ${bookmark.url}`,
      bookmark.description ? `Description: ${bookmark.description}` : '',
      bookmark.contentText ? `Content preview: ${bookmark.contentText.slice(0, 500)}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const result = await this.chat([
      {
        role: 'system',
        content: `Suggest a better title for this bookmarked page. Return JSON: {"title": "Better Title Here", "confidence": 0.8}. Only suggest if the current title is vague (e.g. "Home", "Untitled", "Docs"). If the current title is already good, return confidence 0.`,
      },
      { role: 'user', content },
    ]);

    try {
      return JSON.parse(extractJSONFromAIText(result));
    } catch {
      return { title: '', confidence: 0 };
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.embeddingModel) return [];

    const requestUrl = `${this.baseUrl}/embeddings`;
    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.embeddingModel,
        input: text.slice(0, 8000),
      }),
    });

    if (!response.ok) {
      throw await openAICompatibleError(response, requestUrl);
    }

    const data = (await response.json()) as any;
    return data.data?.[0]?.embedding ?? [];
  }

  async rewriteSearchQuery(query: string): Promise<string> {
    const result = await this.chat([
      {
        role: 'system',
        content: 'Rewrite the user\'s natural language query into effective search keywords. Return only the keywords, no explanation.',
      },
      { role: 'user', content: query },
    ]);
    return extractJSONFromAIText(result).replace(/\s+/g, ' ').trim();
  }
}

// --- Ollama-Compatible Provider ---

export class OllamaCompatibleProvider implements AIProvider {
  readonly name = 'ollama-compatible';
  private baseUrl: string;
  private chatModel: string;
  private embeddingModel: string;

  constructor(config: AIProviderConfig) {
    this.baseUrl = (config.baseUrl ?? 'http://localhost:11434').replace(/\/$/, '');
    this.chatModel = config.chatModel ?? 'llama3.2';
    this.embeddingModel = config.embeddingModel ?? 'nomic-embed-text';
  }

  async chat(messages: Array<{ role: string; content: string }>): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.chatModel,
        messages,
        stream: false,
        options: { temperature: 0.3 },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.status}`);
    }

    const data = (await response.json()) as any;
    return data.message?.content ?? '';
  }

  async summarizeBookmark(bookmark: Bookmark): Promise<AISummaryResult> {
    const content = [
      bookmark.title ? `Title: ${bookmark.title}` : '',
      `URL: ${bookmark.url}`,
      bookmark.description ?? '',
      bookmark.contentText?.slice(0, 2000) ?? '',
    ]
      .filter(Boolean)
      .join('\n');

    const result = await this.chat([
      {
        role: 'system',
        content: '你是中文书签管家。用中文给这个收藏网页生成一句话摘要。只返回 JSON：{"shortSummary":"80字以内中文一句话","summary":"同样只写一句话"}。不要 markdown，不要 <think>。',
      },
      { role: 'user', content },
    ]);

    try {
      const parsed = JSON.parse(extractJSONFromAIText(result)) as AISummaryResult;
      const shortSummary = cleanBookmarkSummary(parsed.shortSummary, parsed.summary, 120) ?? '';
      const summary = cleanBookmarkSummary(parsed.summary, shortSummary, 180) ?? shortSummary;
      return { shortSummary, summary };
    } catch {
      const summary = cleanBookmarkSummary(result, bookmark.description, 180) ?? '';
      return { shortSummary: summary, summary };
    }
  }

  async generateTags(bookmark: Bookmark, options: AITagOptions = {}): Promise<AITagResult> {
    const existingTags = Array.from(new Set((options.existingTags ?? []).map((tag) => tag.trim()).filter(Boolean))).slice(0, 120);
    const maxTags = Number.isFinite(options.maxTags) ? Math.min(Math.max(Math.round(options.maxTags!), 1), 3) : 3;
    const content = [
      existingTags.length > 0 ? `EXISTING_TAGS: ${JSON.stringify(existingTags)}` : '',
      `MAX_TAGS: ${maxTags}`,
      bookmark.title ?? '',
      bookmark.url,
      bookmark.summary ?? bookmark.description ?? '',
      bookmark.contentText?.slice(0, 3000) ?? '',
    ]
      .filter(Boolean)
      .join('\n');

    const result = await this.chat([
      {
        role: 'system',
        content: `Generate compact tags from the bookmarked page content first, then title and URL. Return JSON: {"tags": [{"name": "tag", "confidence": 0.9}]}. Use 1-${maxTags} tags and prefer fewer. Reuse exact names from EXISTING_TAGS when possible. Create a new lowercase kebab-case tag only when no existing tag fits. Merge synonyms and avoid near-duplicate or ungrounded tags.`,
      },
      { role: 'user', content },
    ]);

    try {
      return JSON.parse(extractJSONFromAIText(result));
    } catch {
      return { tags: [] };
    }
  }

  async suggestBetterTitle(bookmark: Bookmark): Promise<AITitleResult> {
    return { title: '', confidence: 0 };
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const response = await fetch(`${this.baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.embeddingModel,
        input: text.slice(0, 8000),
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama embedding failed: ${response.status}`);
    }

    const data = (await response.json()) as any;
    return data.embeddings?.[0] ?? [];
  }

  async rewriteSearchQuery(query: string): Promise<string> {
    return query;
  }
}

// --- Factory ---

export function createProvider(config: AIProviderConfig): AIProvider {
  switch (config.type) {
    case 'openai-compatible':
      return new OpenAICompatibleProvider(config);
    case 'ollama-compatible':
      return new OllamaCompatibleProvider(config);
    default:
      return new MockProvider();
  }
}
