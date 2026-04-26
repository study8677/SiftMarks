import type {
  AIProviderConfig,
  AISummaryResult,
  AITagResult,
  AITitleResult,
  Bookmark,
} from '@siftmarks/shared';

export interface AIProvider {
  readonly name: string;

  summarizeBookmark(bookmark: Bookmark): Promise<AISummaryResult>;
  generateTags(bookmark: Bookmark): Promise<AITagResult>;
  suggestBetterTitle(bookmark: Bookmark): Promise<AITitleResult>;
  generateEmbedding(text: string): Promise<number[]>;
  rewriteSearchQuery(query: string): Promise<string>;
  chat(messages: Array<{ role: string; content: string }>): Promise<string>;
}

// --- Mock Provider ---

export class MockProvider implements AIProvider {
  readonly name = 'mock';

  async summarizeBookmark(_bookmark: Bookmark): Promise<AISummaryResult> {
    return {
      shortSummary: 'AI summary is unavailable. Configure an AI provider to generate summaries.',
      summary: 'AI summary is unavailable. Configure an AI provider in Settings to generate summaries for your bookmarks.',
    };
  }

  async generateTags(_bookmark: Bookmark): Promise<AITagResult> {
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
    this.embeddingModel = config.embeddingModel ?? 'text-embedding-3-small';
  }

  async chat(messages: Array<{ role: string; content: string }>): Promise<string> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.chatModel,
        messages,
        temperature: 0.3,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      throw new Error(`AI request failed: ${response.status}`);
    }

    const data = (await response.json()) as any;
    return data.choices?.[0]?.message?.content ?? '';
  }

  async summarizeBookmark(bookmark: Bookmark): Promise<AISummaryResult> {
    const content = [
      bookmark.title ? `Title: ${bookmark.title}` : '',
      `URL: ${bookmark.url}`,
      bookmark.description ? `Description: ${bookmark.description}` : '',
      bookmark.contentText ? `Content: ${bookmark.contentText.slice(0, 2000)}` : '',
      bookmark.folderPath ? `Folder: ${bookmark.folderPath}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const result = await this.chat([
      {
        role: 'system',
        content: `You summarize bookmarked web pages. Return JSON with "shortSummary" (max 160 chars, one sentence) and "summary" (max 800 chars, detailed). Be concise. Do not invent information not present in the input. For tools/repos, explain what they do. For articles, capture the key idea.`,
      },
      { role: 'user', content },
    ]);

    try {
      const cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      return JSON.parse(cleaned);
    } catch {
      return { shortSummary: result.slice(0, 160), summary: result.slice(0, 800) };
    }
  }

  async generateTags(bookmark: Bookmark): Promise<AITagResult> {
    const content = [
      bookmark.title ? `Title: ${bookmark.title}` : '',
      `URL: ${bookmark.url}`,
      bookmark.summary ?? bookmark.description ?? '',
      bookmark.folderPath ? `Folder: ${bookmark.folderPath}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const result = await this.chat([
      {
        role: 'system',
        content: `Generate 3-8 tags for a bookmarked web page. Return JSON: {"tags": [{"name": "tag-name", "confidence": 0.9}]}. Rules: lowercase kebab-case, no generic words like "article"/"website"/"homepage", keep proper nouns (mcp, sqlite, react), normalize synonyms.`,
      },
      { role: 'user', content },
    ]);

    try {
      const cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      return JSON.parse(cleaned);
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
      const cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      return JSON.parse(cleaned);
    } catch {
      return { title: '', confidence: 0 };
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const response = await fetch(`${this.baseUrl}/embeddings`, {
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
      throw new Error(`Embedding request failed: ${response.status}`);
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
    return result.trim();
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
        content: 'Summarize this bookmarked page. Return JSON: {"shortSummary": "...", "summary": "..."}',
      },
      { role: 'user', content },
    ]);

    try {
      const cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      return JSON.parse(cleaned);
    } catch {
      return { shortSummary: result.slice(0, 160), summary: result.slice(0, 800) };
    }
  }

  async generateTags(bookmark: Bookmark): Promise<AITagResult> {
    const content = [
      bookmark.title ?? '',
      bookmark.url,
      bookmark.summary ?? bookmark.description ?? '',
    ]
      .filter(Boolean)
      .join('\n');

    const result = await this.chat([
      {
        role: 'system',
        content: 'Generate 3-8 tags. Return JSON: {"tags": [{"name": "tag", "confidence": 0.9}]}. Lowercase kebab-case.',
      },
      { role: 'user', content },
    ]);

    try {
      const cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      return JSON.parse(cleaned);
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
