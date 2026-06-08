'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n';

interface SearchResult {
  bookmark: {
    id: string;
    url: string;
    title: string | null;
    summary: string | null;
    folderPath: string | null;
  };
  score: number;
  matchReason: string;
  matchedFields: string[];
  tags: string[];
}

export default function SearchPage() {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = useCallback(async (q?: string) => {
    const searchQuery = q ?? query;
    if (!searchQuery.trim()) return;

    setSearching(true);
    setSearched(true);

    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery, mode: 'memory', limit: 20 }),
      });
      const data = await res.json();
      setResults(data.results ?? []);
    } finally {
      setSearching(false);
    }
  }, [query]);

  useEffect(() => {
    const urlQuery = new URLSearchParams(window.location.search).get('q');
    if (!urlQuery) return;
    // Existing app pages hydrate local API/UI state from client effects.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuery(urlQuery);
    handleSearch(urlQuery);
    // Run only on entry so sidebar/top-bar searches do not become a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="rounded-xl border border-[#dfe6f2] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#1463ff]">AI Search</p>
        <h1 className="mt-2 text-[24px] font-bold tracking-tight text-[#101828]">{t.search.title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-[#475467]">
          不需要记住标题、URL 或标签。直接描述“它是干什么的”，书签管家会用摘要、网页内容、已有分类和语义索引帮你找回。
        </p>
      </header>

      <section className="rounded-xl border border-[#dfe6f2] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
      <div className="relative mb-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder={t.search.placeholder}
          className="w-full px-4 py-3 rounded-lg border border-[#dfe6f2] bg-[#fbfdff] text-[#101828] focus:outline-none focus:border-[#1463ff]"
        />
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="text-sm text-[#667085]">AI 搜索会自动兜底关键词召回。</div>
        <button
          onClick={() => handleSearch()}
          disabled={searching || !query.trim()}
          className="h-10 rounded-lg bg-[#1463ff] px-4 text-sm font-semibold text-white hover:bg-[#0f55df] disabled:opacity-50"
        >
          {searching ? t.search.searching : 'AI 搜索'}
        </button>
      </div>
      </section>

      {!searched && (
        <section className="rounded-xl border border-[#dfe6f2] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
          <div className="mb-3 text-sm font-bold text-[#101828]">可以这样搜</div>
          <div className="flex flex-wrap gap-2">
          {[
            ...t.search.examples,
            '可以让 AI 调用工具的协议',
            '之前收藏过的 MCP server 示例',
            '适合做竞品分析的工具',
            '能把网页变成本地知识库的项目',
          ].map((q) => (
            <button
              key={q}
              onClick={() => { setQuery(q); handleSearch(q); }}
              className="rounded-full border border-[#dfe6f2] px-3 py-1.5 text-sm text-[#475467] transition hover:border-[#1463ff] hover:text-[#1463ff]"
            >
              {q}
            </button>
          ))}
          </div>
        </section>
      )}

      {searched && results.length === 0 && !searching && (
        <div className="rounded-xl border border-[#dfe6f2] bg-white py-12 text-center text-[#667085]">{t.search.noResults}</div>
      )}

      {results.length > 0 && (
        <div className="space-y-3">
          {results.map((r) => (
            <Link
              key={r.bookmark.id}
              href={`/bookmarks/${r.bookmark.id}`}
              className="block rounded-xl border border-[#dfe6f2] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.03)] transition hover:border-[#1463ff]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-[#101828]">{r.bookmark.title ?? '(untitled)'}</div>
                  <div className="truncate text-xs text-[#667085]">{r.bookmark.url}</div>
                  {r.bookmark.summary && <div className="mt-2 line-clamp-2 text-sm leading-6 text-[#475467]">{r.bookmark.summary}</div>}
                  {r.tags.length > 0 && (
                    <div className="flex gap-1 mt-1.5 flex-wrap">
                      {r.tags.map((tg) => (
                        <span key={tg} className="rounded bg-[#eef4ff] px-1.5 py-0.5 text-xs font-medium text-[#1463ff]">#{tg}</span>
                      ))}
                    </div>
                  )}
                  <div className="mt-2 text-xs text-[#667085]">{r.matchReason}</div>
                </div>
                <div className="shrink-0 rounded-full bg-[#fbfdff] px-2 py-1 text-xs font-semibold text-[#475467]">{Math.round(r.score * 100)}%</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
