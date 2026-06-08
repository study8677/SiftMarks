'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

interface FolderItem {
  id: string;
  path: string;
  name: string;
  parentPath: string | null;
  count: number;
}

interface BookmarkItem {
  id: string;
  url: string;
  title: string | null;
  summary: string | null;
  folderPath: string | null;
  status: string;
  isDuplicate: boolean;
  tags: string[];
}

export default function FoldersPage() {
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loadingFolders, setLoadingFolders] = useState(true);
  const [loadingBookmarks, setLoadingBookmarks] = useState(false);
  const [query, setQuery] = useState('');
  const [localPendingCount, setLocalPendingCount] = useState(0);

  const selectedFolder = useMemo(
    () => folders.find((folder) => folder.path === selectedPath) ?? null,
    [folders, selectedPath]
  );

  const filteredFolders = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return folders;
    return folders.filter((folder) => `${folder.path} ${folder.name}`.toLowerCase().includes(q));
  }, [folders, query]);

  const loadFolders = useCallback(async () => {
    setLoadingFolders(true);
    try {
      const res = await fetch('/api/folders?scope=chrome');
      const data = await res.json();
      const nextFolders: FolderItem[] = data.folders ?? [];
      setFolders(nextFolders);
      setLocalPendingCount(Number(data.localPendingCount ?? 0));
      setSelectedPath((current) => current && nextFolders.some((folder) => folder.path === current)
        ? current
        : nextFolders[0]?.path ?? null
      );
    } finally {
      setLoadingFolders(false);
    }
  }, []);

  const loadBookmarks = useCallback(async (folderPath: string | null) => {
    if (!folderPath) {
      setBookmarks([]);
      setTotal(0);
      return;
    }

    setLoadingBookmarks(true);
    try {
      const params = new URLSearchParams({ folder: folderPath, limit: '100', offset: '0', chromeLinked: 'true' });
      const res = await fetch(`/api/bookmarks?${params}`);
      const data = await res.json();
      setBookmarks(data.items ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setLoadingBookmarks(false);
    }
  }, []);

  useEffect(() => {
    // Existing app pages hydrate local API state from client effects.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadFolders();
  }, [loadFolders]);

  useEffect(() => {
    // Existing app pages hydrate local API state from client effects.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadBookmarks(selectedPath);
  }, [loadBookmarks, selectedPath]);

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-[#101828]">文件夹</h1>
          <p className="mt-1 text-sm text-[#475467]">查看已连接 Chrome 的书签文件夹。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="rounded-xl border border-[#dfe6f2] bg-white px-4 py-3 text-sm shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
            <span className="text-[#667085]">Chrome 文件夹</span>
            <span className="ml-2 font-bold text-[#101828]">{folders.length}</span>
          </div>
          {localPendingCount > 0 && (
            <Link
              href="/rescue"
              className="rounded-xl border border-[#b9d3ff] bg-[#eef4ff] px-4 py-3 text-sm font-semibold text-[#1463ff]"
            >
              待写回 {localPendingCount}
            </Link>
          )}
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="rounded-xl border border-[#dfe6f2] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
          <div className="border-b border-[#eef2f7] p-4">
            <h2 className="text-sm font-semibold text-[#101828]">文件夹列表</h2>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索文件夹..."
              className="mt-3 h-10 w-full rounded-lg border border-[#dfe6f2] bg-[#fbfdff] px-3 text-sm outline-none focus:border-[#1463ff]"
            />
          </div>
          <div className="max-h-[640px] overflow-auto p-2">
            {loadingFolders ? (
              <div className="p-6 text-center text-sm text-[#667085]">加载中...</div>
            ) : filteredFolders.length === 0 ? (
              <div className="p-6 text-center text-sm text-[#667085]">暂无文件夹</div>
            ) : (
              filteredFolders.map((folder) => (
                <button
                  key={folder.id}
                  onClick={() => setSelectedPath(folder.path)}
                  className={`mb-1 flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm ${
                    selectedPath === folder.path
                      ? 'bg-[#eef4ff] text-[#1463ff]'
                      : 'text-[#344054] hover:bg-[#f7faff]'
                  }`}
                  title={folder.path}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{folder.name}</span>
                    <span className="mt-0.5 block truncate text-xs text-[#667085]">{folder.path}</span>
                  </span>
                  <span className="shrink-0 rounded-full border border-[#dfe6f2] px-2 py-0.5 text-xs text-[#667085]">{folder.count}</span>
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="min-w-0 rounded-xl border border-[#dfe6f2] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
          <div className="border-b border-[#eef2f7] p-5">
            <h2 className="text-lg font-bold text-[#101828]">{selectedFolder?.name ?? '选择文件夹'}</h2>
            <p className="mt-1 text-sm text-[#667085]">
              {selectedFolder ? `${selectedFolder.path} · ${total} 条书签` : '左侧选择一个文件夹查看书签。'}
            </p>
          </div>

          {loadingBookmarks ? (
            <div className="p-10 text-center text-sm text-[#667085]">书签加载中...</div>
          ) : bookmarks.length === 0 ? (
            <div className="grid min-h-[360px] place-items-center p-8 text-center">
              <div>
                <h3 className="text-lg font-semibold text-[#101828]">暂无书签</h3>
                <p className="mt-2 text-sm text-[#667085]">这个文件夹下还没有导入的书签。</p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-[#eef2f7]">
              {bookmarks.map((bookmark) => (
                <div key={bookmark.id} className="p-4 hover:bg-[#fbfdff]">
                  <Link href={`/bookmarks/${bookmark.id}`} className="font-semibold text-[#101828] hover:text-[#1463ff]">
                    {bookmark.title || '（无标题）'}
                  </Link>
                  <a href={bookmark.url} target="_blank" rel="noreferrer" className="mt-1 block truncate text-xs text-[#667085] hover:text-[#1463ff]">
                    {bookmark.url}
                  </a>
                  {bookmark.summary && <p className="mt-2 line-clamp-2 text-sm text-[#667085]">{bookmark.summary}</p>}
                  {bookmark.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {bookmark.tags.slice(0, 6).map((tag) => (
                        <span key={tag} className="rounded bg-[#eef4ff] px-1.5 py-0.5 text-xs font-medium text-[#1463ff]">#{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
