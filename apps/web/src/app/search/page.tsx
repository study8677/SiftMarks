'use client';

import { useState } from 'react';
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
  const [mode, setMode] = useState<'keyword' | 'memory'>('keyword');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async (q?: string) => {
    const searchQuery = q ?? query;
    if (!searchQuery.trim()) return;

    setSearching(true);
    setSearched(true);

    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery, mode, limit: 20 }),
      });
      const data = await res.json();
      setResults(data.results ?? []);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">{t.search.title}</h1>

      <div className="relative mb-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder={t.search.placeholder}
          className="w-full px-4 py-3 rounded-lg border border-border bg-card text-foreground focus:outline-none focus:border-accent"
        />
      </div>

      <div className="flex items-center gap-4 mb-6">
        <div className="flex gap-1">
          <button
            onClick={() => setMode('keyword')}
            className={`px-3 py-1 rounded-md text-sm ${mode === 'keyword' ? 'bg-accent text-white' : 'text-muted border border-border'}`}
          >
            {t.search.keyword}
          </button>
          <button
            onClick={() => setMode('memory')}
            className={`px-3 py-1 rounded-md text-sm ${mode === 'memory' ? 'bg-accent text-white' : 'text-muted border border-border'}`}
          >
            {t.search.memory}
          </button>
        </div>
        <button
          onClick={() => handleSearch()}
          disabled={searching || !query.trim()}
          className="px-4 py-1.5 bg-accent text-white rounded-md text-sm hover:opacity-90 transition disabled:opacity-50"
        >
          {searching ? t.search.searching : t.search.searchBtn}
        </button>
      </div>

      {!searched && (
        <div className="flex gap-2 flex-wrap">
          {t.search.examples.map((q) => (
            <button
              key={q}
              onClick={() => { setQuery(q); handleSearch(q); }}
              className="px-3 py-1 rounded-full border border-border text-sm text-muted hover:text-foreground hover:border-accent transition"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {searched && results.length === 0 && !searching && (
        <div className="text-center py-12 text-muted">{t.search.noResults}</div>
      )}

      {results.length > 0 && (
        <div className="space-y-3">
          {results.map((r) => (
            <Link
              key={r.bookmark.id}
              href={`/bookmarks/${r.bookmark.id}`}
              className="block p-4 rounded-lg border border-border bg-card hover:border-accent transition"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium">{r.bookmark.title ?? '(untitled)'}</div>
                  <div className="text-xs text-muted truncate">{r.bookmark.url}</div>
                  {r.bookmark.summary && <div className="text-sm text-muted mt-1 line-clamp-2">{r.bookmark.summary}</div>}
                  {r.tags.length > 0 && (
                    <div className="flex gap-1 mt-1.5 flex-wrap">
                      {r.tags.map((tg) => (
                        <span key={tg} className="text-xs px-1.5 py-0.5 rounded bg-accent-light text-accent">#{tg}</span>
                      ))}
                    </div>
                  )}
                  <div className="text-xs text-muted mt-1">{r.matchReason}</div>
                </div>
                <div className="text-xs text-muted shrink-0">{Math.round(r.score * 100)}%</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
