'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

interface TagRecord {
  id: string;
  name: string;
  normalizedName: string;
  createdAt: string;
  count: number;
}

interface BookmarkRecord {
  id: string;
  url: string;
  title: string | null;
  summary: string | null;
  folderPath: string | null;
  status: string;
  isDuplicate: boolean;
  tags: string[];
  importedAt: string;
  updatedAt: string;
}

type SortKey = 'count' | 'name' | 'created';
interface MergeHint {
  sources: string[];
  sourceIds: string[];
  target: string;
  targetId: string;
  reason: string;
  confidence: number;
}

type IconName =
  | 'archive'
  | 'bell'
  | 'book'
  | 'box'
  | 'chevron'
  | 'clock'
  | 'download'
  | 'edit'
  | 'filter'
  | 'folder'
  | 'grid'
  | 'help'
  | 'home'
  | 'link'
  | 'list'
  | 'more'
  | 'plus'
  | 'refresh'
  | 'search'
  | 'settings'
  | 'spark'
  | 'tag'
  | 'trash'
  | 'warning';

const bookmarkLimit = 10;
const tagDotColors = ['#6d5dfc', '#21b26b', '#85c66a', '#1f78ff', '#f2b91b', '#ef476f', '#14b8a6'];
const dateFormatter = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });

export default function TagsPage() {
  const createInputRef = useRef<HTMLInputElement>(null);

  const [tags, setTags] = useState<TagRecord[]>([]);
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const [bookmarks, setBookmarks] = useState<BookmarkRecord[]>([]);
  const [totalBookmarks, setTotalBookmarks] = useState(0);
  const [bookmarkPage, setBookmarkPage] = useState(0);
  const [selectedBookmarkIds, setSelectedBookmarkIds] = useState<Set<string>>(new Set());
  const [loadingTags, setLoadingTags] = useState(true);
  const [loadingBookmarks, setLoadingBookmarks] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tagQuery, setTagQuery] = useState('');
  const [bookmarkQuery, setBookmarkQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('count');
  const [newTagName, setNewTagName] = useState('');
  const [bulkAddName, setBulkAddName] = useState('');
  const [mergeHints, setMergeHints] = useState<MergeHint[]>([]);
  const [auditingTags, setAuditingTags] = useState(false);
  const [tagAuditRan, setTagAuditRan] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const selectedTag = useMemo(
    () => tags.find((tag) => tag.id === selectedTagId) ?? null,
    [tags, selectedTagId]
  );

  const commonTags = useMemo(
    () => [...tags].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-Hans-CN')).slice(0, 6),
    [tags]
  );

  const filteredTags = useMemo(() => {
    const normalizedQuery = tagQuery.trim().toLowerCase();
    const items = normalizedQuery
      ? tags.filter((tag) => `${tag.name} ${tag.normalizedName}`.toLowerCase().includes(normalizedQuery))
      : tags;

    return [...items].sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name, 'zh-Hans-CN');
      if (sortKey === 'created') return Date.parse(b.createdAt) - Date.parse(a.createdAt);
      return b.count - a.count || a.name.localeCompare(b.name, 'zh-Hans-CN');
    });
  }, [sortKey, tagQuery, tags]);

  const visibleBookmarks = useMemo(() => {
    const query = bookmarkQuery.trim().toLowerCase();
    if (!query) return bookmarks;

    return bookmarks.filter((bookmark) => {
      const text = [
        bookmark.title,
        bookmark.url,
        bookmark.summary,
        bookmark.folderPath,
        ...bookmark.tags,
      ].filter(Boolean).join(' ').toLowerCase();

      return text.includes(query);
    });
  }, [bookmarkQuery, bookmarks]);

  const selectedBookmarkCount = selectedBookmarkIds.size;
  const allVisibleSelected = visibleBookmarks.length > 0 && visibleBookmarks.every((bookmark) => selectedBookmarkIds.has(bookmark.id));
  const totalPages = Math.max(1, Math.ceil(totalBookmarks / bookmarkLimit));
  const activeTagIndex = Math.max(0, tags.findIndex((tag) => tag.id === selectedTagId));

  const showError = useCallback((message: string) => {
    setError(message);
    setNotice('');
  }, []);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    setError('');
  }, []);

  const loadTags = useCallback(async (preferredTagId?: string | null) => {
    setLoadingTags(true);
    try {
      const res = await fetch('/api/tags');
      const data = await res.json();
      const nextTags: TagRecord[] = data.tags ?? [];
      setTags(nextTags);

      setSelectedTagId((current) => {
        const preferred = preferredTagId ?? current;
        if (preferred && nextTags.some((tag) => tag.id === preferred)) return preferred;
        return nextTags[0]?.id ?? null;
      });
    } catch {
      showError('标签列表加载失败。');
    } finally {
      setLoadingTags(false);
    }
  }, [showError]);

  const loadBookmarks = useCallback(async (tag: TagRecord | null, page: number) => {
    if (!tag) {
      setBookmarks([]);
      setTotalBookmarks(0);
      setSelectedBookmarkIds(new Set());
      return;
    }

    setLoadingBookmarks(true);
    try {
      const params = new URLSearchParams({
        tag: tag.normalizedName,
        limit: String(bookmarkLimit),
        offset: String(page * bookmarkLimit),
      });
      const res = await fetch(`/api/bookmarks?${params}`);
      const data = await res.json();
      setBookmarks(data.items ?? []);
      setTotalBookmarks(data.total ?? 0);
      setSelectedBookmarkIds(new Set());
    } catch {
      showError('书签列表加载失败。');
    } finally {
      setLoadingBookmarks(false);
    }
  }, [showError]);

  useEffect(() => {
    // Existing app pages hydrate local API state from client effects.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadTags();
  }, [loadTags]);

  useEffect(() => {
    // This resets local detail-panel state when the selected tag changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBookmarkPage(0);
    setBookmarkQuery('');
  }, [selectedTagId]);

  useEffect(() => {
    // Existing app pages hydrate local API state from client effects.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadBookmarks(selectedTag, bookmarkPage);
  }, [bookmarkPage, loadBookmarks, selectedTag]);

  async function requestJSON(url: string, options: RequestInit) {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers ?? {}),
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error ?? '操作失败。');
    }
    return data;
  }

  async function createTag() {
    const name = newTagName.trim();
    if (!name) return showError('请输入标签名称。');

    setSaving(true);
    try {
      const data = await requestJSON('/api/tags', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      setNewTagName('');
      showNotice('标签已创建。');
      await loadTags(data.tag?.id);
    } catch (err) {
      showError(err instanceof Error ? err.message : '创建标签失败。');
    } finally {
      setSaving(false);
    }
  }

  async function deleteTag() {
    if (!selectedTag) return;
    const confirmed = window.confirm(`删除标签「${selectedTag.name}」？书签不会被删除。`);
    if (!confirmed) return;

    setSaving(true);
    try {
      await requestJSON(`/api/tags/${selectedTag.id}`, { method: 'DELETE' });
      showNotice('标签已删除，书签保留。');
      await loadTags(null);
    } catch (err) {
      showError(err instanceof Error ? err.message : '删除失败。');
    } finally {
      setSaving(false);
    }
  }

  async function applyMergeHint(hint: MergeHint) {
    if (hint.sourceIds.length === 0) return;
    const confirmed = window.confirm(`合并 ${hint.sources.join('、')} 到「${hint.target}」？`);
    if (!confirmed) return;

    setSaving(true);
    try {
      const data = await requestJSON('/api/tags/merge', {
        method: 'POST',
        body: JSON.stringify({
          sourceTagIds: hint.sourceIds,
          targetTagId: hint.targetId,
        }),
      });
      showNotice(`已合并到「${data.target?.name ?? hint.target}」。`);
      setMergeHints((current) => current.filter((item) => item !== hint));
      await loadTags(data.target?.id ?? hint.targetId);
    } catch (err) {
      showError(err instanceof Error ? err.message : '合并失败。');
    } finally {
      setSaving(false);
    }
  }

  async function runTagAudit() {
    setAuditingTags(true);
    setTagAuditRan(false);
    setMergeHints([]);
    setNotice('');
    setError('');

    try {
      const data = await requestJSON('/api/tags/audit', { method: 'POST' });
      setMergeHints(Array.isArray(data.suggestions) ? data.suggestions : []);
      setTagAuditRan(true);
      const count = Number(data.suggestions?.length ?? 0);
      showNotice(count > 0 ? `AI 生成 ${count} 条标签合并建议。` : 'AI 审核完成，当前没有明确需要合并的标签。');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'AI 标签审核失败。');
    } finally {
      setAuditingTags(false);
    }
  }

  async function applyBulkTags(type: 'add' | 'remove-current') {
    if (!selectedTag || selectedBookmarkCount === 0) return;
    const bookmarkIds = Array.from(selectedBookmarkIds);

    if (type === 'add' && !bulkAddName.trim()) {
      return showError('请输入要添加的标签。');
    }

    const payload = type === 'add'
      ? { bookmarkIds, addTags: [bulkAddName.trim()] }
      : { bookmarkIds, removeTagIds: [selectedTag.id] };

    setSaving(true);
    try {
      await requestJSON('/api/bookmarks/bulk-tags', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (type === 'add') setBulkAddName('');
      showNotice(type === 'add' ? '已为选中书签添加标签。' : '已从选中书签移除当前标签。');
      await loadTags(selectedTag.id);
      await loadBookmarks(selectedTag, bookmarkPage);
    } catch (err) {
      showError(err instanceof Error ? err.message : '批量操作失败。');
    } finally {
      setSaving(false);
    }
  }

  function focusCreateInput() {
    createInputRef.current?.focus();
  }

  function toggleBookmark(id: string) {
    setSelectedBookmarkIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleAllVisible() {
    setSelectedBookmarkIds((current) => {
      if (allVisibleSelected) return new Set();
      const next = new Set(current);
      for (const bookmark of visibleBookmarks) next.add(bookmark.id);
      return next;
    });
  }

  return (
    <>
          <section className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h1 className="text-[22px] font-bold tracking-tight text-[#101828]">标签</h1>
              <p className="mt-1 text-sm text-[#475467]">标签用于补充文件夹和搜索召回：优先复用常用标签，合并近义标签，避免标签越建越多。</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={focusCreateInput}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#1463ff] px-4 text-sm font-semibold text-white shadow-sm shadow-blue-200 hover:bg-[#0f55df]"
              >
                <AdminIcon name="plus" className="h-4 w-4" />
                新建标签
              </button>
            </div>
          </section>

          <div className="mb-4 rounded-lg border border-[#dfe6f2] bg-white px-4 py-3 text-sm text-[#475467]">
            批量修正、相似标签合并和书签关联都集中在本页处理；标签不是主分类，文件夹仍是主要归档结构。
          </div>

          {(notice || error) && (
            <div className={`mb-4 rounded-lg border px-4 py-2 text-sm ${
              error
                ? 'border-[#f5c2c7] bg-[#fff3f3] text-[#c0172d]'
                : 'border-[#b7ebc6] bg-[#f0fff4] text-[#157347]'
            }`}>
              {error || notice}
            </div>
          )}

          <div className="grid gap-4 xl:grid-cols-[248px_minmax(0,1fr)_344px]">
            <aside className="rounded-xl border border-[#dfe6f2] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
              <div className="border-b border-[#eef2f7] p-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-[#172033]">标签列表</h2>
                  <button onClick={() => loadTags(selectedTagId)} className="grid h-7 w-7 place-items-center rounded-md text-[#667085] hover:bg-[#eef4ff]" title="刷新">
                    <AdminIcon name="refresh" className={`h-4 w-4 ${loadingTags ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                <label className="mt-4 flex h-9 items-center gap-2 rounded-lg border border-[#dfe6f2] bg-[#fbfdff] px-3">
                  <AdminIcon name="search" className="h-4 w-4 text-[#667085]" />
                  <input
                    value={tagQuery}
                    onChange={(event) => setTagQuery(event.target.value)}
                    placeholder="搜索标签..."
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#98a2b3]"
                  />
                </label>

                <div className="mt-3 flex gap-2">
                  <select
                    value={sortKey}
                    onChange={(event) => setSortKey(event.target.value as SortKey)}
                    className="h-9 min-w-0 flex-1 rounded-lg border border-[#dfe6f2] bg-[#fbfdff] px-3 text-sm font-medium text-[#344054] outline-none"
                  >
                    <option value="count">按使用次数排序</option>
                    <option value="name">按名称排序</option>
                    <option value="created">按创建时间排序</option>
                  </select>
                </div>
              </div>

              <div className="p-4">
                <SectionTitle label="常用标签" />
                <div className="mt-3 space-y-1.5">
                  {commonTags.length === 0 ? (
                    <EmptyLine text="暂无常用标签" />
                  ) : (
                    commonTags.map((tag, index) => (
                      <TagListButton
                        key={tag.id}
                        tag={tag}
                        active={tag.id === selectedTagId}
                        color={tagDotColors[index % tagDotColors.length]}
                        onClick={() => setSelectedTagId(tag.id)}
                      />
                    ))
                  )}
                </div>

                <div className="my-4 h-px bg-[#eef2f7]" />

                <div className="flex items-center justify-between">
                  <SectionTitle label={`全部标签 (${tags.length})`} />
                  <button onClick={focusCreateInput} className="grid h-7 w-7 place-items-center rounded-md border border-[#dfe6f2] text-[#667085] hover:border-[#1463ff] hover:text-[#1463ff]">
                    <AdminIcon name="plus" className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-3 max-h-[176px] space-y-1 overflow-auto pr-1">
                  {filteredTags.length === 0 ? (
                    <EmptyLine text="没有匹配标签" />
                  ) : (
                    filteredTags.map((tag, index) => (
                      <TagListButton
                        key={tag.id}
                        tag={tag}
                        active={tag.id === selectedTagId}
                        color={tagDotColors[index % tagDotColors.length]}
                        onClick={() => setSelectedTagId(tag.id)}
                        compact
                      />
                    ))
                  )}
                </div>

                <div className="mt-4 border-t border-[#eef2f7] pt-4">
                  <SectionTitle label="新建标签" />
                  <div className="mt-2 flex gap-2">
                    <input
                      ref={createInputRef}
                      value={newTagName}
                      onChange={(event) => setNewTagName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') createTag();
                      }}
                      placeholder="输入标签名"
                      className="h-9 min-w-0 flex-1 rounded-lg border border-[#dfe6f2] bg-[#fbfdff] px-3 text-sm outline-none focus:border-[#1463ff]"
                    />
                    <button
                      onClick={createTag}
                      disabled={saving || !newTagName.trim()}
                      className="h-9 rounded-lg bg-[#1463ff] px-3 text-sm font-semibold text-white disabled:opacity-40"
                    >
                      添加
                    </button>
                  </div>
                </div>
              </div>
            </aside>

            <section className="min-w-0 rounded-xl border border-[#dfe6f2] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
              {selectedTag ? (
                <>
                  <div className="border-b border-[#eef2f7] p-5">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="flex min-w-0 items-start gap-4">
                        <div
                          className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-base font-bold text-white shadow-sm"
                          style={{ background: `linear-gradient(135deg, ${tagDotColors[activeTagIndex % tagDotColors.length]}, #9b8cff)` }}
                        >
                          {selectedTag.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="truncate text-xl font-bold text-[#101828]">{selectedTag.name}</h2>
                            <span className="rounded-md bg-[#ede9fe] px-2 py-1 text-xs font-semibold text-[#7047eb]">本地标签</span>
                          </div>
                          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#475467]">
                            当前标签关联的书签、文件夹和 AI 建议会集中在这里治理。可以重命名、合并到高频标签，也可以批量把误打标签从书签上移除。
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-3">
                        <button
                          onClick={deleteTag}
                          disabled={saving}
                          className="inline-flex h-9 min-w-[86px] items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-[#ffd2d2] bg-[#fff8f8] px-3 text-sm font-semibold text-[#e11d48] disabled:opacity-40"
                        >
                          <AdminIcon name="trash" className="h-4 w-4" />
                          删除
                        </button>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                      <Metric label="书签数量" value={selectedTag.count} />
                      <Metric label="使用次数" value={selectedTag.count} />
                      <Metric label="相关文件夹" value={countFolders(bookmarks)} />
                      <Metric label="创建时间" value={formatDate(selectedTag.createdAt)} />
                      <Metric label="定位" value={selectedTag.count <= 1 ? '辅助索引' : '常用标签'} />
                    </div>

                  </div>

                  <div className="border-b border-[#eef2f7] px-5">
                    <div className="flex gap-8 overflow-x-auto">
                      <span className="border-b-2 border-[#1463ff] py-4 text-sm font-semibold text-[#1463ff]">
                        标签下书签 ({totalBookmarks})
                      </span>
                      <span className="py-4 text-sm font-semibold text-[#667085]">相关文件夹 {countFolders(bookmarks)}</span>
                      <span className="py-4 text-sm font-semibold text-[#667085]">相似标签合并见右侧</span>
                    </div>
                  </div>

                  <div className="border-b border-[#eef2f7] p-5">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                      <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border border-[#dfe6f2] bg-[#fbfdff] px-3">
                        <AdminIcon name="search" className="h-4 w-4 text-[#667085]" />
                        <input
                          value={bookmarkQuery}
                          onChange={(event) => setBookmarkQuery(event.target.value)}
                          placeholder="搜索当前标签下的书签..."
                          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#98a2b3]"
                        />
                      </label>

                      <div className="text-xs text-[#667085]">当前标签下共 {totalBookmarks} 条书签</div>
                    </div>

                    {selectedBookmarkCount > 0 && (
                      <div className="mt-4 flex flex-col gap-3 rounded-lg border border-[#dfe6f2] bg-[#fbfdff] px-3 py-2 xl:flex-row xl:items-center xl:justify-between">
                        <div className="flex items-center gap-3 text-sm text-[#344054]">
                          <input type="checkbox" checked readOnly className="h-4 w-4 accent-[#1463ff]" />
                          <span>已选择 {selectedBookmarkCount} 项</span>
                          <button onClick={() => setSelectedBookmarkIds(new Set())} className="font-semibold text-[#1463ff]">取消选择</button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => applyBulkTags('remove-current')}
                            disabled={saving}
                            className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#dfe6f2] bg-white px-3 text-sm font-medium text-[#344054] disabled:opacity-40"
                          >
                            <AdminIcon name="trash" className="h-4 w-4" />
                            移除标签
                          </button>
                          <label className="flex h-9 items-center gap-2 rounded-lg border border-[#dfe6f2] bg-white px-3">
                            <AdminIcon name="tag" className="h-4 w-4 text-[#667085]" />
                            <input
                              value={bulkAddName}
                              onChange={(event) => setBulkAddName(event.target.value)}
                              placeholder="添加标签"
                              className="w-24 bg-transparent text-sm outline-none"
                            />
                          </label>
                          <button
                            onClick={() => applyBulkTags('add')}
                            disabled={saving || !bulkAddName.trim()}
                            className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#dfe6f2] bg-white px-3 text-sm font-medium text-[#344054] disabled:opacity-40"
                          >
                            添加
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="overflow-x-auto px-5 pt-3">
                    {loadingBookmarks ? (
                      <div className="py-16 text-center text-sm text-[#667085]">书签加载中...</div>
                    ) : visibleBookmarks.length === 0 ? (
                      <div className="py-16 text-center text-sm text-[#667085]">这个标签下还没有书签。</div>
                    ) : (
                      <table className="w-full min-w-[760px] text-sm">
                        <thead className="text-xs font-semibold text-[#667085]">
                          <tr className="border-b border-[#eef2f7]">
                            <th className="w-9 py-3 text-left">
                              <input
                                type="checkbox"
                                checked={allVisibleSelected}
                                onChange={toggleAllVisible}
                                className="h-4 w-4 accent-[#1463ff]"
                              />
                            </th>
                            <th className="px-2 py-3 text-left">书签信息</th>
                            <th className="w-44 px-2 py-3 text-left">URL</th>
                            <th className="w-28 px-2 py-3 text-left">添加时间</th>
                            <th className="w-24 px-2 py-3 text-left">标签数</th>
                            <th className="w-36 px-2 py-3 text-left">操作</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#eef2f7]">
                          {visibleBookmarks.map((bookmark, index) => (
                            <tr key={bookmark.id} className="hover:bg-[#fbfdff]">
                              <td className="py-3 align-top">
                                <input
                                  type="checkbox"
                                  checked={selectedBookmarkIds.has(bookmark.id)}
                                  onChange={() => toggleBookmark(bookmark.id)}
                                  className="h-4 w-4 accent-[#1463ff]"
                                  aria-label={`选择 ${bookmark.title ?? bookmark.url}`}
                                />
                              </td>
                              <td className="min-w-0 px-2 py-3">
                                <div className="flex min-w-0 items-start gap-3">
                                  <BookmarkAvatar index={index} title={bookmark.title ?? bookmark.url} />
                                  <div className="min-w-0">
                                    <Link href={`/bookmarks/${bookmark.id}`} className="block truncate font-semibold text-[#101828] hover:text-[#1463ff]">
                                      {bookmark.title || '（无标题）'}
                                    </Link>
                                    {bookmark.summary && (
                                      <div className="mt-0.5 line-clamp-1 text-xs text-[#667085]">{bookmark.summary}</div>
                                    )}
                                    <div className="mt-1.5 flex flex-wrap gap-1">
                                      {bookmark.tags.slice(0, 3).map((tag) => (
                                        <span key={tag} className="rounded bg-[#eef4ff] px-1.5 py-0.5 text-xs font-medium text-[#1463ff]">
                                          {tag}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-2 py-3 align-top text-xs text-[#475467]">
                                <a href={bookmark.url} target="_blank" rel="noreferrer" className="block max-w-40 truncate hover:text-[#1463ff]">
                                  {hostname(bookmark.url)}
                                </a>
                              </td>
                              <td className="px-2 py-3 align-top text-xs text-[#475467]">
                                <div>{formatDate(bookmark.importedAt)}</div>
                                <div className="mt-1 text-[#98a2b3]">{relativeDays(bookmark.importedAt)}</div>
                              </td>
                              <td className="px-2 py-3 align-top">
                                <span className="font-semibold text-[#101828]">{bookmark.tags.length}</span>
                              </td>
                              <td className="px-2 py-3 align-top">
                                <div className="flex items-center gap-2 text-[#475467]">
                                  <Link href={`/bookmarks/${bookmark.id}`} className="grid h-7 w-7 place-items-center rounded-md hover:bg-[#eef4ff] hover:text-[#1463ff]" title="编辑书签">
                                    <AdminIcon name="edit" className="h-4 w-4" />
                                  </Link>
                                  <a href={bookmark.url} target="_blank" rel="noreferrer" className="grid h-7 w-7 place-items-center rounded-md hover:bg-[#eef4ff] hover:text-[#1463ff]" title="打开链接">
                                    <AdminIcon name="link" className="h-4 w-4" />
                                  </a>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  <div className="flex flex-col gap-3 border-t border-[#eef2f7] px-5 py-4 md:flex-row md:items-center md:justify-between">
                    <div className="text-sm text-[#667085]">共 {totalBookmarks} 条</div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setBookmarkPage((page) => Math.max(0, page - 1))}
                        disabled={bookmarkPage === 0}
                        className="grid h-8 w-8 place-items-center rounded-lg border border-[#dfe6f2] text-[#667085] disabled:opacity-40"
                      >
                        <AdminIcon name="chevron" className="h-4 w-4 rotate-90" />
                      </button>
                      {Array.from({ length: Math.min(totalPages, 4) }, (_, i) => (
                        <button
                          key={i}
                          onClick={() => setBookmarkPage(i)}
                          className={`h-8 min-w-8 rounded-lg border px-3 text-sm font-medium ${
                            bookmarkPage === i
                              ? 'border-[#1463ff] bg-[#eef4ff] text-[#1463ff]'
                              : 'border-[#dfe6f2] text-[#475467]'
                          }`}
                        >
                          {i + 1}
                        </button>
                      ))}
                      {totalPages > 4 && <span className="px-1 text-[#667085]">...</span>}
                      {totalPages > 4 && (
                        <button
                          onClick={() => setBookmarkPage(totalPages - 1)}
                          className="h-8 min-w-8 rounded-lg border border-[#dfe6f2] px-3 text-sm font-medium text-[#475467]"
                        >
                          {totalPages}
                        </button>
                      )}
                      <button
                        onClick={() => setBookmarkPage((page) => Math.min(totalPages - 1, page + 1))}
                        disabled={bookmarkPage + 1 >= totalPages}
                        className="grid h-8 w-8 place-items-center rounded-lg border border-[#dfe6f2] text-[#667085] disabled:opacity-40"
                      >
                        <AdminIcon name="chevron" className="h-4 w-4 -rotate-90" />
                      </button>
                    </div>
                    <div className="text-xs text-[#667085]">每页 {bookmarkLimit} 条</div>
                  </div>

                  <div className="flex flex-wrap items-center gap-5 border-t border-[#eef2f7] px-5 py-3 text-xs text-[#475467]">
                    <button
                      onClick={() => applyBulkTags('remove-current')}
                      disabled={selectedBookmarkCount === 0 || saving}
                      className="inline-flex items-center gap-2 disabled:opacity-40"
                    >
                      <AdminIcon name="tag" className="h-4 w-4" />
                      移除当前标签
                    </button>
                    <span className="inline-flex items-center gap-2">
                      <AdminIcon name="edit" className="h-4 w-4" />
                      单条纠错请进入详情页修改标题、URL、摘要和备注
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div className="border-b border-[#eef2f7] p-5">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="flex items-start gap-4">
                        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-[#eef4ff] text-[#1463ff]">
                          <AdminIcon name="tag" className="h-5 w-5" />
                        </div>
                        <div>
                          <h2 className="text-xl font-bold text-[#101828]">选择或新建标签</h2>
                          <p className="mt-2 text-sm leading-6 text-[#475467]">当前还没有可管理的标签。创建标签后，这里会显示书签列表、合并和批量操作。</p>
                        </div>
                      </div>
                      <button onClick={focusCreateInput} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#1463ff] px-3 text-sm font-semibold text-white">
                        <AdminIcon name="plus" className="h-4 w-4" />
                        新建标签
                      </button>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                      <Metric label="书签数量" value="-" />
                      <Metric label="使用次数" value="-" />
                      <Metric label="相关文件夹" value="-" />
                      <Metric label="创建时间" value="-" />
                      <Metric label="来源" value="-" />
                    </div>
                  </div>

                  <div className="p-8 text-center text-sm text-[#667085]">
                    创建标签后，关联书签、合并目标和批量操作会显示在这里。
                  </div>
                </>
              )}
            </section>

            <aside className="space-y-4">
              <div className="rounded-xl border border-[#dfe6f2] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
	                <div className="flex items-center justify-between border-b border-[#eef2f7] p-4">
	                  <div className="flex items-center gap-2">
	                    <AdminIcon name="spark" className="h-5 w-5 text-[#6d5dfc]" />
	                    <h2 className="text-sm font-bold text-[#101828]">全库标签审核建议</h2>
	                  </div>
                    <span className="rounded-full bg-[#eef4ff] px-2 py-0.5 text-xs font-semibold text-[#1463ff]">
                      {mergeHints.length}
                    </span>
		                </div>

                <div className="p-4">
                  <div className="rounded-lg border border-[#dfe6f2] bg-[#fbfdff] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-bold text-[#1463ff]">AI 标签合并建议</h3>
	                      <p className="mt-1 text-xs leading-5 text-[#667085]">AI 会审核全部标签和标签下的书签样本，只给出明确同义、别名或冗余标签的合并建议。</p>
                      </div>
                      <button
                        type="button"
                        onClick={runTagAudit}
                        disabled={auditingTags || tags.length < 2}
                        className="shrink-0 rounded-lg bg-[#1463ff] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {auditingTags ? '审核中...' : 'AI 审核'}
                      </button>
                    </div>

	                    <div className="mt-4 max-h-[420px] space-y-4 overflow-auto pr-1">
	                      {mergeHints.length === 0 ? (
                          <EmptyLine text={tagAuditRan ? 'AI 审核完成，当前没有明确相似标签。' : '点击“AI 审核”生成全库标签合并建议。'} />
                        ) : (
                          mergeHints.map((hint) => (
                            <div key={`${hint.sources.join('-')}-${hint.target}`} className="rounded-lg border border-[#e7ddff] bg-white p-3">
                              <div className="grid grid-cols-[minmax(0,1fr)_32px_88px] items-center gap-2">
                                <div className="flex min-w-0 flex-wrap gap-1 rounded-lg bg-[#f4efff] p-2">
                                  {hint.sources.map((source) => (
                                    <span key={source} className="rounded-md bg-[#ede9fe] px-2 py-1 text-xs font-medium text-[#7047eb]">{source}</span>
                                  ))}
                                </div>
                                <div className="text-center text-[#1463ff]">-&gt;</div>
                                <div className="text-xs text-[#475467]">
                                  <div>合并为</div>
                                  <div className="mt-1 font-bold text-[#1463ff]">{hint.target}</div>
                                </div>
                              </div>
                              <div className="mt-2 text-xs leading-5 text-[#667085]">
                                {hint.reason} · 置信度 {Math.round(hint.confidence * 100)}%
                              </div>
                              <button
                                onClick={() => applyMergeHint(hint)}
                                disabled={saving}
                                className="mt-3 inline-flex h-8 items-center justify-center rounded-lg bg-[#1463ff] px-3 text-xs font-semibold text-white disabled:opacity-50"
                              >
                                合并
                              </button>
                            </div>
                          ))
                        )}
	                    </div>
	                  </div>
	                </div>
	              </div>

              <div className="rounded-xl border border-[#f2d7a8] bg-[#fffbf4] p-4">
                <h3 className="text-sm font-bold text-[#b45309]">标签质量原则</h3>
                <p className="mt-2 text-xs leading-5 text-[#7c5a2a]">
                  当前全库共有 {tags.length} 个标签。优先复用已有标签；确实有新主题时再新增，近义标签尽量合并。
                </p>
                <p className="mt-3 text-xs text-[#7c5a2a]">标签页只负责管理标签；重新分析网页内容请进入单条书签详情页。</p>
	              </div>

              <div className="rounded-xl border border-[#dfe6f2] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
                <h3 className="text-sm font-bold text-[#101828]">批量操作</h3>
                <div className="mt-3 space-y-3">
                  <BulkAction
                    icon="trash"
                    title="移除选中书签的当前标签"
                    desc={`已选择 ${selectedBookmarkCount} 项`}
                    danger
                    disabled={selectedBookmarkCount === 0 || saving}
                    onClick={() => applyBulkTags('remove-current')}
                  />
                  <div className="rounded-lg border border-[#e8edf6] bg-[#fbfdff] p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <AdminIcon name="tag" className="h-4 w-4 text-[#1463ff]" />
                      <span className="text-sm font-semibold text-[#1463ff]">为选中书签添加标签</span>
                    </div>
                    <div className="flex gap-2">
                      <input
                        value={bulkAddName}
                        onChange={(event) => setBulkAddName(event.target.value)}
                        placeholder="标签名"
                        className="h-9 min-w-0 flex-1 rounded-lg border border-[#dfe6f2] bg-white px-3 text-sm outline-none focus:border-[#1463ff]"
                      />
                      <button
                        onClick={() => applyBulkTags('add')}
                        disabled={selectedBookmarkCount === 0 || saving || !bulkAddName.trim()}
                        className="rounded-lg bg-[#1463ff] px-3 text-sm font-semibold text-white disabled:opacity-40"
                      >
                        添加
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-[#667085]">已选择 {selectedBookmarkCount} 项</p>
                  </div>
	                </div>

              </div>
            </aside>
          </div>
    </>
  );
}

function SectionTitle({ label, danger = false }: { label: string; danger?: boolean }) {
  return (
    <div className={`text-xs font-bold ${danger ? 'text-[#e11d48]' : 'text-[#344054]'}`}>
      {label}
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <div className="rounded-md bg-[#fbfdff] px-3 py-2 text-sm text-[#98a2b3]">{text}</div>;
}

function TagListButton({
  tag,
  active,
  color,
  compact = false,
  onClick,
}: {
  tag: TagRecord;
  active: boolean;
  color: string;
  compact?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 text-sm transition ${
        compact ? 'py-1.5' : 'py-2'
      } ${
        active ? 'bg-[#eef4ff] text-[#1463ff]' : 'text-[#344054] hover:bg-[#f7faff]'
      }`}
      title={tag.name}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <span className="truncate font-medium">{tag.name}</span>
      </span>
      <span className={active ? 'font-semibold text-[#1463ff]' : 'text-[#667085]'}>{tag.count}</span>
    </button>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="border-r border-[#dfe6f2] last:border-r-0">
      <div className="text-lg font-bold text-[#101828]">{value}</div>
      <div className="mt-1 text-xs text-[#667085]">{label}</div>
    </div>
  );
}

function BulkAction({
  icon,
  title,
  desc,
  danger = false,
  disabled = false,
  onClick,
}: {
  icon: IconName;
  title: string;
  desc: string;
  danger?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center justify-between rounded-lg border border-[#e8edf6] bg-[#fbfdff] p-3 text-left disabled:opacity-55"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
          danger ? 'bg-[#fff1f2] text-[#e11d48]' : 'bg-[#eef4ff] text-[#1463ff]'
        }`}>
          <AdminIcon name={icon} className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className={`block truncate text-sm font-semibold ${danger ? 'text-[#e11d48]' : 'text-[#1463ff]'}`}>{title}</span>
          <span className="mt-0.5 block text-xs text-[#667085]">{desc}</span>
        </span>
      </span>
      <AdminIcon name="chevron" className="-rotate-90 h-4 w-4 shrink-0 text-[#667085]" />
    </button>
  );
}

function BookmarkAvatar({ index, title }: { index: number; title: string }) {
  const colors = ['#111827', '#e69b66', '#6d5dfc', '#a7c957', '#fbbf24', '#14b8a6'];
  const letter = title.trim().slice(0, 1).toUpperCase() || 'S';

  return (
    <div
      className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-sm font-bold text-white"
      style={{ backgroundColor: colors[index % colors.length] }}
    >
      {letter}
    </div>
  );
}

function AdminIcon({ name, className = '' }: { name: IconName; className?: string }) {
  const common = {
    className,
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 2,
    viewBox: '0 0 24 24',
    'aria-hidden': true,
  };

  return (
    <svg {...common}>
      {iconPath(name)}
    </svg>
  );
}

function iconPath(name: IconName) {
  switch (name) {
    case 'archive':
      return <><path d="M21 8H3" /><path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8" /><path d="M8 4h8l1 4H7l1-4Z" /></>;
    case 'bell':
      return <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" /><path d="M10 21h4" /></>;
    case 'book':
      return <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15Z" /></>;
    case 'box':
      return <><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></>;
    case 'chevron':
      return <path d="m8 10 4 4 4-4" />;
    case 'clock':
      return <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>;
    case 'download':
      return <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></>;
    case 'edit':
      return <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" /></>;
    case 'filter':
      return <><path d="M3 5h18" /><path d="M6 12h12" /><path d="M10 19h4" /></>;
    case 'folder':
      return <><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" /></>;
    case 'grid':
      return <><path d="M4 4h7v7H4z" /><path d="M13 4h7v7h-7z" /><path d="M4 13h7v7H4z" /><path d="M13 13h7v7h-7z" /></>;
    case 'help':
      return <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a3 3 0 0 1 5 2.2c0 2-2.5 2.2-2.5 4" /><path d="M12 18h.01" /></>;
    case 'home':
      return <><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10" /><path d="M9 20v-6h6v6" /></>;
    case 'link':
      return <><path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" /><path d="M14 11a5 5 0 0 0-7.1 0l-2 2a5 5 0 0 0 7.1 7.1l1.1-1.1" /></>;
    case 'list':
      return <><path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" /><path d="M3 6h.01" /><path d="M3 12h.01" /><path d="M3 18h.01" /></>;
    case 'more':
      return <><path d="M12 12h.01" /><path d="M19 12h.01" /><path d="M5 12h.01" /></>;
    case 'plus':
      return <><path d="M12 5v14" /><path d="M5 12h14" /></>;
    case 'refresh':
      return <><path d="M21 12a9 9 0 0 1-15.3 6.4L3 16" /><path d="M3 21v-5h5" /><path d="M3 12A9 9 0 0 1 18.3 5.6L21 8" /><path d="M21 3v5h-5" /></>;
    case 'search':
      return <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>;
    case 'settings':
      return <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.8 1.8 0 0 0 .4 2l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.8 1.8 0 0 0-2-.4 1.8 1.8 0 0 0-1 1.6V21a2 2 0 0 1-4 0v-.1a1.8 1.8 0 0 0-1-1.6 1.8 1.8 0 0 0-2 .4l-.1.1a2 2 0 0 1-2.8-2.8l.1-.1a1.8 1.8 0 0 0 .4-2 1.8 1.8 0 0 0-1.6-1H3a2 2 0 0 1 0-4h.1a1.8 1.8 0 0 0 1.6-1 1.8 1.8 0 0 0-.4-2l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1a1.8 1.8 0 0 0 2 .4 1.8 1.8 0 0 0 1-1.6V3a2 2 0 0 1 4 0v.1a1.8 1.8 0 0 0 1 1.6 1.8 1.8 0 0 0 2-.4l.1-.1a2 2 0 0 1 2.8 2.8l-.1.1a1.8 1.8 0 0 0-.4 2 1.8 1.8 0 0 0 1.6 1H21a2 2 0 0 1 0 4h-.1a1.8 1.8 0 0 0-1.5 1Z" /></>;
    case 'spark':
      return <><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" /><path d="m19 15 .9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z" /></>;
    case 'tag':
      return <><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z" /><path d="M7 7h.01" /></>;
    case 'trash':
      return <><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M6 6l1 16h10l1-16" /><path d="M10 11v6" /><path d="M14 11v6" /></>;
    case 'warning':
      return <><path d="M12 3 2 21h20L12 3Z" /><path d="M12 9v5" /><path d="M12 17h.01" /></>;
    default:
      return <circle cx="12" cy="12" r="9" />;
  }
}

function formatDate(value: string | null | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return dateFormatter.format(date).replace(/\//g, '-');
}

function relativeDays(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const days = Math.max(0, Math.floor((Date.now() - date.getTime()) / 86_400_000));
  if (days === 0) return '今天';
  return `${days} 天前`;
}

function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function countFolders(bookmarks: BookmarkRecord[]) {
  return new Set(bookmarks.map((bookmark) => bookmark.folderPath).filter(Boolean)).size;
}
