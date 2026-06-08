'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n';

interface Bookmark {
  id: string;
  url: string;
  title: string | null;
  summary: string | null;
  folderPath: string | null;
  status: string;
  isDuplicate: boolean;
  tags: string[];
  createdAt: string | null;
}

type FilterType = 'all' | 'untagged' | 'duplicates' | 'broken' | 'missing-summary';

export default function LibraryPage() {
  const { t } = useI18n();
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [folders, setFolders] = useState<Array<{ path: string; count: number }>>([]);
  const [tags, setTags] = useState<Array<{ name: string; count: number }>>([]);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const limit = 30;

  const fetchBookmarks = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    params.set('offset', String(page * limit));

    if (filter === 'duplicates') params.set('isDuplicate', 'true');
    if (filter === 'broken') params.set('status', 'broken');
    if (selectedFolder) params.set('folder', selectedFolder);
    if (selectedTag) params.set('tag', selectedTag);

    const res = await fetch(`/api/bookmarks?${params}`);
    const data = await res.json();

    let items = data.items;
    if (filter === 'untagged') {
      items = items.filter((b: Bookmark) => b.tags.length === 0);
    }
    if (filter === 'missing-summary') {
      items = items.filter((b: Bookmark) => !b.summary);
    }

    setBookmarks(items);
    setTotal(data.total);
    setLoading(false);
  }, [filter, selectedFolder, selectedTag, page]);

  useEffect(() => {
    // Existing app pages hydrate local API state from client effects.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchBookmarks();
  }, [fetchBookmarks]);

  useEffect(() => {
    fetch('/api/folders').then((r) => r.json()).then((d) => setFolders(d.folders));
    fetch('/api/tags').then((r) => r.json()).then((d) => setTags(d.tags));
  }, []);

  const filters: { key: FilterType; label: string }[] = [
    { key: 'all', label: t.library.filters.all },
    { key: 'untagged', label: t.library.filters.untagged },
    { key: 'duplicates', label: t.library.filters.duplicates },
    { key: 'broken', label: t.library.filters.broken },
    { key: 'missing-summary', label: t.library.filters.missingSummary },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">{t.library.title}</h1>

      <div className="flex gap-6">
        {/* Sidebar */}
        <div className="w-56 shrink-0 hidden md:block">
          <div className="mb-6">
            <h3 className="text-xs font-semibold text-muted uppercase mb-2">{t.library.sidebar.status}</h3>
            {filters.map((f) => (
              <button
                key={f.key}
                onClick={() => { setFilter(f.key); setPage(0); }}
                className={`block w-full text-left px-2 py-1 rounded text-sm transition ${
                  filter === f.key ? 'bg-accent-light text-accent font-medium' : 'text-muted hover:text-foreground'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {folders.length > 0 && (
            <div className="mb-6">
              <h3 className="text-xs font-semibold text-muted uppercase mb-2">{t.library.sidebar.folders}</h3>
              <button
                onClick={() => { setSelectedFolder(null); setPage(0); }}
                className={`block w-full text-left px-2 py-1 rounded text-sm ${!selectedFolder ? 'text-accent font-medium' : 'text-muted hover:text-foreground'}`}
              >
                {t.library.sidebar.allFolders}
              </button>
              {folders.map((f) => (
                <button
                  key={f.path}
                  onClick={() => { setSelectedFolder(f.path); setPage(0); }}
                  className={`block w-full text-left px-2 py-1 rounded text-sm truncate ${
                    selectedFolder === f.path ? 'text-accent font-medium' : 'text-muted hover:text-foreground'
                  }`}
                  title={f.path}
                >
                  {f.path.split('/').pop()} ({f.count})
                </button>
              ))}
            </div>
          )}

          {tags.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-muted uppercase mb-2">{t.library.sidebar.tags}</h3>
              <button
                onClick={() => { setSelectedTag(null); setPage(0); }}
                className={`block w-full text-left px-2 py-1 rounded text-sm ${!selectedTag ? 'text-accent font-medium' : 'text-muted hover:text-foreground'}`}
              >
                {t.library.sidebar.allTags}
              </button>
              {tags.slice(0, 20).map((tg) => (
                <button
                  key={tg.name}
                  onClick={() => { setSelectedTag(tg.name); setPage(0); }}
                  className={`block w-full text-left px-2 py-1 rounded text-sm ${
                    selectedTag === tg.name ? 'text-accent font-medium' : 'text-muted hover:text-foreground'
                  }`}
                >
                  #{tg.name} ({tg.count})
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {loading ? (
            <div className="text-muted animate-pulse">{t.common.loading}</div>
          ) : bookmarks.length === 0 ? (
            <div className="text-center py-12 text-muted">
              {t.library.noBookmarks}{' '}
              <Link href="/import" className="text-accent">{t.library.importSome}</Link>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted mb-4">{t.library.bookmarksCount(total)}</p>
              <div className="space-y-2">
                {bookmarks.map((b) => (
                  <Link
                    key={b.id}
                    href={`/bookmarks/${b.id}`}
                    className="block p-3 rounded-lg border border-border bg-card hover:border-accent transition"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{b.title || t.library.untitled}</div>
                        <div className="text-xs text-muted truncate">{b.url}</div>
                        {b.summary && <div className="text-sm text-muted mt-1 line-clamp-2">{b.summary}</div>}
                        {b.tags.length > 0 && (
                          <div className="flex gap-1 mt-1.5 flex-wrap">
                            {b.tags.map((tg) => (
                              <span key={tg} className="text-xs px-1.5 py-0.5 rounded bg-accent-light text-accent">#{tg}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 flex flex-col items-end gap-1">
                        {b.folderPath && <span className="text-xs text-muted">{b.folderPath.split('/').pop()}</span>}
                        {b.isDuplicate && <span className="text-xs px-1.5 py-0.5 rounded bg-warning-light text-warning">{t.library.dup}</span>}
                        {b.status === 'broken' && <span className="text-xs px-1.5 py-0.5 rounded bg-danger-light text-danger">{t.library.broken}</span>}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>

              {total > limit && (
                <div className="flex justify-center gap-2 mt-6">
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="px-3 py-1 rounded border border-border text-sm disabled:opacity-30"
                  >
                    {t.library.prev}
                  </button>
                  <span className="px-3 py-1 text-sm text-muted">
                    {t.library.page(page + 1, Math.ceil(total / limit))}
                  </span>
                  <button
                    onClick={() => setPage((p) => p + 1)}
                    disabled={(page + 1) * limit >= total}
                    className="px-3 py-1 rounded border border-border text-sm disabled:opacity-30"
                  >
                    {t.library.next}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
