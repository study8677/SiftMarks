import type { LinkCheckStatus } from '@siftmarks/shared';

export interface FetchResult {
  status: LinkCheckStatus;
  httpStatus: number | null;
  finalUrl: string | null;
  title: string | null;
  description: string | null;
  contentText: string | null;
  error: string | null;
}

/**
 * Fetch page metadata for a single URL.
 */
export async function fetchPageMetadata(
  url: string,
  timeout: number = 10000
): Promise<FetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'SiftMarks/0.1 (bookmark-manager)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });

    clearTimeout(timer);

    const httpStatus = response.status;
    const finalUrl = response.url;
    const isRedirected = finalUrl !== url;

    if (httpStatus >= 400 && httpStatus < 500) {
      return {
        status: 'client_error',
        httpStatus,
        finalUrl,
        title: null,
        description: null,
        contentText: null,
        error: `HTTP ${httpStatus}`,
      };
    }

    if (httpStatus >= 500) {
      return {
        status: 'server_error',
        httpStatus,
        finalUrl,
        title: null,
        description: null,
        contentText: null,
        error: `HTTP ${httpStatus}`,
      };
    }

    // Try to extract metadata from HTML
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      return {
        status: isRedirected ? 'redirected' : 'ok',
        httpStatus,
        finalUrl,
        title: null,
        description: null,
        contentText: null,
        error: null,
      };
    }

    const html = await response.text();

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch?.[1]?.trim().replace(/\s+/g, ' ') ?? null;

    // Extract meta description
    const descMatch = html.match(
      /<meta[^>]+name=["']description["'][^>]+content=["']([\s\S]*?)["']/i
    ) ?? html.match(
      /<meta[^>]+content=["']([\s\S]*?)["'][^>]+name=["']description["']/i
    );
    const description = descMatch?.[1]?.trim() ?? null;

    // Extract readable text (simplified — strip tags, limit length)
    const textContent = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 5000);

    return {
      status: isRedirected ? 'redirected' : 'ok',
      httpStatus,
      finalUrl,
      title,
      description,
      contentText: textContent || null,
      error: null,
    };
  } catch (err: any) {
    clearTimeout(timer);

    if (err.name === 'AbortError') {
      return {
        status: 'timeout',
        httpStatus: null,
        finalUrl: null,
        title: null,
        description: null,
        contentText: null,
        error: 'Request timed out',
      };
    }

    const message: string = err.message ?? String(err);

    if (message.includes('ENOTFOUND') || message.includes('getaddrinfo')) {
      return {
        status: 'dns_error',
        httpStatus: null,
        finalUrl: null,
        title: null,
        description: null,
        contentText: null,
        error: 'DNS resolution failed',
      };
    }

    if (message.includes('SSL') || message.includes('CERT') || message.includes('certificate')) {
      return {
        status: 'ssl_error',
        httpStatus: null,
        finalUrl: null,
        title: null,
        description: null,
        contentText: null,
        error: `SSL error: ${message}`,
      };
    }

    return {
      status: 'unknown_error',
      httpStatus: null,
      finalUrl: null,
      title: null,
      description: null,
      contentText: null,
      error: message,
    };
  }
}

/**
 * Run fetching with concurrency limit.
 */
export async function fetchBatch(
  urls: Array<{ id: string; url: string }>,
  options: { concurrency?: number; timeout?: number; onProgress?: (done: number, total: number) => void } = {}
): Promise<Map<string, FetchResult>> {
  const { concurrency = 5, timeout = 10000, onProgress } = options;
  const results = new Map<string, FetchResult>();
  let completed = 0;

  const queue = [...urls];

  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;

      const result = await fetchPageMetadata(item.url, timeout);
      results.set(item.id, result);
      completed++;
      onProgress?.(completed, urls.length);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, urls.length) }, () => worker());
  await Promise.all(workers);

  return results;
}
