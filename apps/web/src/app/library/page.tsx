'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n';

interface Bookmark {
  id: string;
  url: string;
  title: string | null;
  description: string | null;
  summary: string | null;
  folderPath: string | null;
  faviconUrl: string | null;
  status: string;
  httpStatus: number | null;
  isDuplicate: boolean;
  tags: string[];
  createdAt: string | null;
  importedAt: string;
  updatedAt: string | null;
  lastCheckedAt: string | null;
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
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
    const data = await res.json() as { items?: Bookmark[]; total?: number };

    let items = Array.isArray(data.items) ? data.items : [];
    if (filter === 'untagged') {
      items = items.filter((b: Bookmark) => b.tags.length === 0);
    }
    if (filter === 'missing-summary') {
      items = items.filter((b: Bookmark) => !b.summary);
    }

    setBookmarks(items);
    setTotal(Number(data.total ?? items.length));
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

  const selectedBookmark = useMemo(() => {
    if (!detailOpen) return null;
    return bookmarks.find((bookmark) => bookmark.id === selectedId) ?? bookmarks[0] ?? null;
  }, [bookmarks, detailOpen, selectedId]);

  async function copyBookmarkUrl(bookmark: Bookmark) {
    try {
      await navigator.clipboard.writeText(bookmark.url);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = bookmark.url;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }

    setCopiedId(bookmark.id);
    window.setTimeout(() => {
      setCopiedId((current) => (current === bookmark.id ? null : current));
    }, 1600);
  }

  const filters: { key: FilterType; label: string }[] = [
    { key: 'all', label: t.library.filters.all },
    { key: 'untagged', label: t.library.filters.untagged },
    { key: 'duplicates', label: t.library.filters.duplicates },
    { key: 'broken', label: t.library.filters.broken },
    { key: 'missing-summary', label: t.library.filters.missingSummary },
  ];

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-[#101828]">{t.library.title}</h1>
          <p className="mt-1 text-sm text-[#475467]">
            点选左侧书签，在右侧快速查看摘要、文件夹、标签和操作入口。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="rounded-xl border border-[#dfe6f2] bg-white px-4 py-3 text-sm shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
            <span className="text-[#667085]">当前结果</span>
            <span className="ml-2 font-bold text-[#101828]">{total}</span>
          </div>
          <div className="rounded-xl border border-[#dfe6f2] bg-white px-4 py-3 text-sm shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
            <span className="text-[#667085]">已显示</span>
            <span className="ml-2 font-bold text-[#101828]">{bookmarks.length}</span>
          </div>
        </div>
      </header>

      <div className="flex gap-4">
        {/* Sidebar */}
        <div className="hidden w-56 shrink-0 md:block">
          <div className="rounded-xl border border-[#dfe6f2] bg-white p-3 shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
            <h3 className="text-xs font-semibold text-muted uppercase mb-2">{t.library.sidebar.status}</h3>
            {filters.map((f) => (
              <button
                key={f.key}
                onClick={() => { setFilter(f.key); setPage(0); setDetailOpen(true); }}
                className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                  filter === f.key ? 'bg-[#eef4ff] text-[#1463ff] font-semibold' : 'text-[#475467] hover:bg-[#f7faff] hover:text-[#172033]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {folders.length > 0 && (
            <div className="mt-4 rounded-xl border border-[#dfe6f2] bg-white p-3 shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
              <h3 className="text-xs font-semibold text-muted uppercase mb-2">{t.library.sidebar.folders}</h3>
              <button
                onClick={() => { setSelectedFolder(null); setPage(0); setDetailOpen(true); }}
                className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${!selectedFolder ? 'bg-[#eef4ff] font-semibold text-[#1463ff]' : 'text-[#475467] hover:bg-[#f7faff] hover:text-[#172033]'}`}
              >
                {t.library.sidebar.allFolders}
              </button>
              {folders.map((f) => (
                <button
                  key={f.path}
                  onClick={() => { setSelectedFolder(f.path); setPage(0); setDetailOpen(true); }}
                  className={`block w-full rounded-lg px-3 py-2 text-left text-sm truncate ${
                    selectedFolder === f.path ? 'bg-[#eef4ff] font-semibold text-[#1463ff]' : 'text-[#475467] hover:bg-[#f7faff] hover:text-[#172033]'
                  }`}
                  title={f.path}
                >
                  {f.path.split('/').pop()} ({f.count})
                </button>
              ))}
            </div>
          )}

          {tags.length > 0 && (
            <div className="mt-4 rounded-xl border border-[#dfe6f2] bg-white p-3 shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
              <h3 className="text-xs font-semibold text-muted uppercase mb-2">{t.library.sidebar.tags}</h3>
              <button
                onClick={() => { setSelectedTag(null); setPage(0); setDetailOpen(true); }}
                className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${!selectedTag ? 'bg-[#eef4ff] font-semibold text-[#1463ff]' : 'text-[#475467] hover:bg-[#f7faff] hover:text-[#172033]'}`}
              >
                {t.library.sidebar.allTags}
              </button>
              {tags.slice(0, 20).map((tg) => (
                <button
                  key={tg.name}
                  onClick={() => { setSelectedTag(tg.name); setPage(0); setDetailOpen(true); }}
                  className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${
                    selectedTag === tg.name ? 'bg-[#eef4ff] font-semibold text-[#1463ff]' : 'text-[#475467] hover:bg-[#f7faff] hover:text-[#172033]'
                  }`}
                >
                  #{tg.name} ({tg.count})
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Main content */}
        <div className="grid min-w-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,1fr)_380px]">
          <section className="min-w-0 rounded-xl border border-[#dfe6f2] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
            <div className="flex items-center justify-between gap-3 border-b border-[#eef2f7] px-4 py-3">
              <div>
                <h2 className="text-sm font-bold text-[#101828]">书签列表</h2>
                <p className="mt-0.5 text-xs text-[#667085]">{t.library.bookmarksCount(total)}</p>
              </div>
              {selectedBookmark && (
                <span className="hidden rounded-full bg-[#eef4ff] px-2.5 py-1 text-xs font-semibold text-[#1463ff] sm:inline">
                  已选中
                </span>
              )}
            </div>

            {loading ? (
              <div className="p-10 text-center text-sm text-[#667085] animate-pulse">{t.common.loading}</div>
            ) : bookmarks.length === 0 ? (
              <div className="grid min-h-[360px] place-items-center p-8 text-center text-muted">
                <div>
                  <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-[#eef4ff] text-lg font-bold text-[#1463ff]">B</div>
                  <p className="mt-4 text-sm">
                    {t.library.noBookmarks}{' '}
                    <Link href="/import" className="font-semibold text-accent">{t.library.importSome}</Link>
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="divide-y divide-[#eef2f7]">
                  {bookmarks.map((b) => {
                    const selected = selectedBookmark?.id === b.id;

                    return (
                      <button
                        key={b.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => { setSelectedId(b.id); setDetailOpen(true); }}
                        className={`block w-full px-4 py-3 text-left transition ${
                          selected ? 'bg-[#f5f8ff]' : 'bg-white hover:bg-[#fbfdff]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className={`truncate font-semibold ${selected ? 'text-[#1463ff]' : 'text-[#101828]'}`}>
                              {b.title || t.library.untitled}
                            </div>
                            <div className="mt-1 truncate text-xs text-[#667085]">{b.url}</div>
                            {b.summary && <div className="mt-1.5 line-clamp-2 text-sm leading-5 text-[#475467]">{b.summary}</div>}
                            {b.tags.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {b.tags.slice(0, 4).map((tg) => (
                                  <span key={tg} className="rounded bg-[#eef4ff] px-1.5 py-0.5 text-xs font-medium text-[#1463ff]">#{tg}</span>
                                ))}
                                {b.tags.length > 4 && (
                                  <span className="rounded bg-[#f2f4f7] px-1.5 py-0.5 text-xs font-medium text-[#667085]">+{b.tags.length - 4}</span>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="shrink-0 text-right">
                            {b.folderPath && <span className="block max-w-28 truncate text-xs text-[#667085]" title={b.folderPath}>{lastFolderName(b.folderPath)}</span>}
                            <div className="mt-2 flex flex-col items-end gap-1">
                              {b.isDuplicate && <span className="rounded-full bg-warning-light px-2 py-0.5 text-xs font-semibold text-warning">{t.library.dup}</span>}
                              {b.status === 'broken' && <span className="rounded-full bg-danger-light px-2 py-0.5 text-xs font-semibold text-danger">{t.library.broken}</span>}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {total > limit && (
                  <div className="flex justify-center gap-2 border-t border-[#eef2f7] px-4 py-4">
                    <button
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      disabled={page === 0}
                      className="rounded-lg border border-[#dfe6f2] px-3 py-1.5 text-sm font-semibold text-[#344054] disabled:opacity-30"
                    >
                      {t.library.prev}
                    </button>
                    <span className="px-3 py-1.5 text-sm text-muted">
                      {t.library.page(page + 1, Math.ceil(total / limit))}
                    </span>
                    <button
                      onClick={() => setPage((p) => p + 1)}
                      disabled={(page + 1) * limit >= total}
                      className="rounded-lg border border-[#dfe6f2] px-3 py-1.5 text-sm font-semibold text-[#344054] disabled:opacity-30"
                    >
                      {t.library.next}
                    </button>
                  </div>
                )}
              </>
            )}
          </section>

          <BookmarkPreviewPanel
            bookmark={selectedBookmark}
            copied={selectedBookmark ? copiedId === selectedBookmark.id : false}
            onClose={() => setDetailOpen(false)}
            onCopy={copyBookmarkUrl}
          />
        </div>
      </div>
    </div>
  );
}

function BookmarkPreviewPanel({
  bookmark,
  copied,
  onClose,
  onCopy,
}: {
  bookmark: Bookmark | null;
  copied: boolean;
  onClose: () => void;
  onCopy: (bookmark: Bookmark) => void;
}) {
  if (!bookmark) {
    return (
      <aside className="min-w-0">
        <section className="sticky top-[82px] grid min-h-[320px] place-items-center rounded-xl border border-[#dfe6f2] bg-white p-6 text-center shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
          <div>
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-[#eef4ff] text-lg font-bold text-[#1463ff]">i</div>
            <h2 className="mt-4 text-base font-bold text-[#101828]">书签详情</h2>
            <p className="mt-2 text-sm leading-6 text-[#667085]">选择一条书签后，这里会显示摘要、文件夹、标签和常用操作。</p>
          </div>
        </section>
      </aside>
    );
  }

  const title = bookmark.title || '（无标题）';
  const host = hostnameOf(bookmark.url);
  const summary = bookmark.summary || bookmark.description || '还没有摘要。可以进入详情页重新分析网页，补齐摘要后会参与搜索。';

  return (
    <aside className="min-w-0">
      <section className="sticky top-[82px] overflow-hidden rounded-xl border border-[#dfe6f2] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
        <div className="flex items-center justify-between gap-3 border-b border-[#eef2f7] px-4 py-3">
          <div>
            <h2 className="text-sm font-bold text-[#101828]">书签详情</h2>
            <p className="mt-0.5 text-xs text-[#667085]">{host}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg border border-[#dfe6f2] text-lg leading-none text-[#667085] hover:bg-[#f8fafc] hover:text-[#101828]"
            aria-label="收起详情"
            title="收起详情"
          >
            ×
          </button>
        </div>

        <div className="space-y-4 p-4">
          <div className="flex items-start gap-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-[#dfe6f2] bg-[#f8fbff] text-base font-bold text-[#1463ff]">
              {bookmark.faviconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={bookmark.faviconUrl} alt="" className="h-7 w-7 object-contain" />
              ) : (
                title.slice(0, 1).toUpperCase()
              )}
            </div>
            <div className="min-w-0">
              <h3 className="line-clamp-2 text-base font-bold leading-6 text-[#101828]">{title}</h3>
              <a href={bookmark.url} target="_blank" rel="noreferrer" className="mt-1 block truncate text-xs font-medium text-[#1463ff] hover:underline">
                {bookmark.url}
              </a>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={bookmark.status} />
            {bookmark.httpStatus && <span className="rounded-full border border-[#dfe6f2] px-2 py-0.5 text-xs text-[#667085]">HTTP {bookmark.httpStatus}</span>}
            {bookmark.isDuplicate && <span className="rounded-full bg-warning-light px-2 py-0.5 text-xs font-semibold text-warning">已存在</span>}
          </div>

          <PreviewSection label="摘要">
            <p className="line-clamp-4 text-sm leading-6 text-[#475467]">{summary}</p>
          </PreviewSection>

          <PreviewSection label="文件夹">
            {bookmark.folderPath ? (
              <div className="flex flex-wrap gap-1.5">
                {bookmark.folderPath.split('/').filter(Boolean).map((part, index, parts) => (
                  <span key={`${part}-${index}`} className={`rounded-lg px-2 py-1 text-xs font-semibold ${
                    index === parts.length - 1 ? 'bg-[#eef4ff] text-[#1463ff]' : 'bg-[#f2f4f7] text-[#475467]'
                  }`}>
                    {part}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-sm text-[#667085]">未分类，建议生成整理建议后归入明确文件夹。</span>
            )}
          </PreviewSection>

          <PreviewSection label="标签">
            {bookmark.tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {bookmark.tags.slice(0, 6).map((tag) => (
                  <span key={tag} className="rounded-lg bg-[#ecfdf3] px-2 py-1 text-xs font-semibold text-[#027a48]">#{tag}</span>
                ))}
              </div>
            ) : (
              <span className="text-sm text-[#667085]">暂无标签。标签只辅助搜索，不影响文件夹分类。</span>
            )}
          </PreviewSection>

          <div className="grid grid-cols-2 gap-3 border-t border-[#eef2f7] pt-4 text-sm">
            <MetaItem label="收藏时间" value={formatDate(bookmark.createdAt ?? bookmark.importedAt)} />
            <MetaItem label="更新时间" value={formatDate(bookmark.updatedAt)} />
            <MetaItem label="检测时间" value={formatDate(bookmark.lastCheckedAt)} />
            <MetaItem label="来源域名" value={host} />
          </div>

          <div className="grid grid-cols-2 gap-2 border-t border-[#eef2f7] pt-4">
            <a
              href={bookmark.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center justify-center rounded-lg bg-[#1463ff] px-3 text-sm font-semibold text-white hover:bg-[#0f56d9]"
            >
              打开网页
            </a>
            <Link
              href={`/bookmarks/${bookmark.id}`}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-[#b9d3ff] bg-[#eef4ff] px-3 text-sm font-semibold text-[#1463ff]"
            >
              编辑详情
            </Link>
            <button
              type="button"
              onClick={() => onCopy(bookmark)}
              className="col-span-2 inline-flex h-10 items-center justify-center rounded-lg border border-[#dfe6f2] px-3 text-sm font-semibold text-[#344054] hover:bg-[#f8fafc]"
            >
              {copied ? '已复制链接' : '复制链接'}
            </button>
          </div>
        </div>
      </section>
    </aside>
  );
}

function PreviewSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="border-t border-[#eef2f7] pt-4">
      <h4 className="mb-2 text-xs font-bold uppercase tracking-[0.08em] text-[#98a2b3]">{label}</h4>
      {children}
    </section>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-[#98a2b3]">{label}</div>
      <div className="mt-1 truncate text-xs font-semibold text-[#344054]" title={value}>{value}</div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const classes = status === 'ok'
    ? 'bg-success-light text-success'
    : status === 'broken'
      ? 'bg-danger-light text-danger'
      : status === 'redirected'
        ? 'bg-warning-light text-warning'
        : 'bg-accent-light text-accent';

  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${classes}`}>{statusLabel(status)}</span>;
}

function statusLabel(status: string): string {
  if (status === 'ok') return '可访问';
  if (status === 'broken') return '失效';
  if (status === 'redirected') return '重定向';
  if (status === 'unchecked') return '未检测';
  return status;
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function lastFolderName(folderPath: string): string {
  const parts = folderPath.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? folderPath;
}

function formatDate(value?: string | null): string {
  if (!value) return '未记录';
  const time = Date.parse(value);
  if (Number.isNaN(time)) return '未记录';
  return new Date(time).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}
