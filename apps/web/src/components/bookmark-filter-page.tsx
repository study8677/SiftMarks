'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

interface BookmarkItem {
  id: string;
  url: string;
  title: string | null;
  summary: string | null;
  folderPath: string | null;
  status: string;
  isDuplicate: boolean;
  tags: string[];
  importedAt?: string;
  updatedAt?: string;
}

interface BookmarkFilterPageProps {
  title: string;
  desc: string;
  emptyTitle: string;
  emptyDesc: string;
  query: Record<string, string>;
  badgeLabel?: string;
  trashMode?: boolean;
}

export function BookmarkFilterPage({
  title,
  desc,
  emptyTitle,
  emptyDesc,
  query,
  badgeLabel,
  trashMode = false,
}: BookmarkFilterPageProps) {
  const [items, setItems] = useState<BookmarkItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const params = useMemo(() => {
    const next = new URLSearchParams({ limit: '100', offset: '0', ...query });
    return next.toString();
  }, [query]);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/bookmarks?${params}`);
      const data = await res.json();
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setError('加载失败，请检查本地服务。');
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    // Existing app pages hydrate local API state from client effects.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchItems();
  }, [fetchItems]);

  async function restoreBookmark(bookmark: BookmarkItem) {
    setWorkingId(bookmark.id);
    setError('');
    setNotice('');
    try {
      const res = await fetch(`/api/bookmarks/${encodeURIComponent(bookmark.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ok' }),
      });
      if (!res.ok) throw new Error('restore failed');
      setNotice('书签已恢复。');
      await fetchItems();
    } catch {
      setError('恢复失败。');
    } finally {
      setWorkingId(null);
    }
  }

  async function deleteForever(bookmark: BookmarkItem) {
    if (!window.confirm(`永久删除「${bookmark.title || bookmark.url}」？这个操作不可撤销。`)) return;

    setWorkingId(bookmark.id);
    setError('');
      setNotice('');
      try {
      const res = await fetch(`/api/bookmarks/${encodeURIComponent(bookmark.id)}?permanent=true`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('delete failed');
      setNotice('书签已永久删除。');
      await fetchItems();
    } catch {
      setError('删除失败。');
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-[#101828]">{title}</h1>
          <p className="mt-1 text-sm text-[#475467]">{desc}</p>
        </div>
        <div className="rounded-xl border border-[#dfe6f2] bg-white px-4 py-3 text-sm shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
          <span className="text-[#667085]">当前数量</span>
          <span className="ml-2 font-bold text-[#101828]">{total}</span>
        </div>
      </header>

      {(notice || error) && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${
          error ? 'border-[#ffd2d2] bg-[#fff8f8] text-[#b42318]' : 'border-[#b7ebc6] bg-[#f0fff4] text-[#157347]'
        }`}>
          {error || notice}
        </div>
      )}

      <section className="rounded-xl border border-[#dfe6f2] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
        {loading ? (
          <div className="p-10 text-center text-sm text-[#667085]">加载中...</div>
        ) : items.length === 0 ? (
          <div className="grid min-h-[360px] place-items-center p-8 text-center">
            <div>
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-[#eef4ff] text-[#1463ff]">✓</div>
              <h2 className="mt-4 text-lg font-semibold text-[#101828]">{emptyTitle}</h2>
              <p className="mt-2 text-sm text-[#667085]">{emptyDesc}</p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b border-[#eef2f7] bg-[#fbfdff] text-xs font-semibold text-[#667085]">
                <tr>
                  <th className="px-4 py-3 text-left">书签</th>
                  <th className="w-44 px-4 py-3 text-left">文件夹</th>
                  <th className="w-36 px-4 py-3 text-left">状态</th>
                  <th className="w-40 px-4 py-3 text-left">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eef2f7]">
                {items.map((bookmark) => (
                  <tr key={bookmark.id} className="hover:bg-[#fbfdff]">
                    <td className="min-w-0 px-4 py-4">
                      <Link href={`/bookmarks/${bookmark.id}`} className="block min-w-0 font-semibold text-[#101828] hover:text-[#1463ff]">
                        <span className="block truncate">{bookmark.title || '（无标题）'}</span>
                      </Link>
                      <a href={bookmark.url} target="_blank" rel="noreferrer" className="mt-1 block truncate text-xs text-[#667085] hover:text-[#1463ff]">
                        {bookmark.url}
                      </a>
                      {bookmark.summary && <p className="mt-1 line-clamp-1 text-xs text-[#667085]">{bookmark.summary}</p>}
                      {bookmark.tags.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {bookmark.tags.slice(0, 5).map((tag) => (
                            <span key={tag} className="rounded bg-[#eef4ff] px-1.5 py-0.5 text-xs font-medium text-[#1463ff]">
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4 align-top text-xs text-[#667085]">
                      <span className="block max-w-40 truncate" title={bookmark.folderPath ?? ''}>
                        {bookmark.folderPath || '未分类'}
                      </span>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="flex flex-wrap gap-1">
                        <span className="rounded-full border border-[#dfe6f2] px-2 py-0.5 text-xs text-[#475467]">
                          {bookmark.status}
                        </span>
                        {bookmark.isDuplicate && (
                          <span className="rounded-full bg-[#fff7ed] px-2 py-0.5 text-xs text-[#c2410c]">已存在</span>
                        )}
                        {badgeLabel && (
                          <span className="rounded-full bg-[#eef4ff] px-2 py-0.5 text-xs text-[#1463ff]">{badgeLabel}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top">
                      {trashMode ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => restoreBookmark(bookmark)}
                            disabled={workingId === bookmark.id}
                            className="rounded-lg bg-[#1463ff] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                          >
                            恢复
                          </button>
                          <button
                            onClick={() => deleteForever(bookmark)}
                            disabled={workingId === bookmark.id}
                            className="rounded-lg border border-[#ffd2d2] px-3 py-1.5 text-xs font-semibold text-[#b42318] disabled:opacity-50"
                          >
                            永久删除
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <Link href={`/bookmarks/${bookmark.id}`} className="rounded-lg border border-[#dfe6f2] px-3 py-1.5 text-xs font-semibold text-[#344054]">
                            查看
                          </Link>
                          <a href={bookmark.url} target="_blank" rel="noreferrer" className="rounded-lg border border-[#dfe6f2] px-3 py-1.5 text-xs font-semibold text-[#344054]">
                            打开
                          </a>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
