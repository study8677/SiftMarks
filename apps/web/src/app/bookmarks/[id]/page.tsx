'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n';

interface BookmarkTag {
  name: string;
  source: string;
  confidence: number | null;
}

interface BookmarkDetail {
  id: string;
  url: string;
  title: string | null;
  originalTitle: string | null;
  description: string | null;
  contentText: string | null;
  summary: string | null;
  folderPath: string | null;
  faviconUrl: string | null;
  status: string;
  httpStatus: number | null;
  isDuplicate: boolean;
  createdAt: string | null;
  importedAt: string;
  updatedAt?: string;
  lastCheckedAt?: string | null;
  lastIndexedAt?: string | null;
  tags: BookmarkTag[];
}

interface EditForm {
  title: string;
  url: string;
  folderPath: string;
  tags: string;
  summary: string;
  description: string;
}

type BookmarkResponse = Omit<BookmarkDetail, 'tags'> & {
  tags?: Array<string | Partial<BookmarkTag>>;
  error?: string;
};

type BusyAction = 'saving' | 'checking' | 'reanalyzing' | 'deleting' | null;

const MAX_BOOKMARK_TAGS = 3;

export default function BookmarkDetailPage() {
  const { t } = useI18n();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [bookmark, setBookmark] = useState<BookmarkDetail | null>(null);
  const [form, setForm] = useState<EditForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const loadBookmark = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/bookmarks/${id}`);
      const data = await res.json() as BookmarkResponse;
      if (!res.ok) throw new Error(data.error ?? '书签加载失败。');
      const normalized = normalizeBookmark(data);
      setBookmark(normalized);
      setForm(toForm(normalized));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '书签加载失败。');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    // Existing client pages in this app load local API state this way.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadBookmark();
  }, [loadBookmark]);

  const tagList = useMemo(() => parseTags(form.tags), [form.tags]);

  function updateForm<K extends keyof EditForm>(key: K, value: EditForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function saveBookmark() {
    if (!form.url.trim()) {
      setError('URL 不能为空。');
      return;
    }

    setBusy('saving');
    setNotice('');
    setError('');

    try {
      const res = await fetch(`/api/bookmarks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title.trim() || null,
          url: form.url.trim(),
          folderPath: form.folderPath.trim() || null,
          summary: form.summary.trim() || null,
          description: form.description.trim() || null,
          tags: tagList,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? '保存失败。');

      await loadBookmark();
      setNotice('已保存，搜索索引已刷新。');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败。');
    } finally {
      setBusy(null);
    }
  }

  async function checkLink() {
    setBusy('checking');
    setNotice('');
    setError('');

    try {
      const res = await fetch(`/api/bookmarks/${id}/check-link`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '检测失败。');

      setBookmark((current) => current
        ? {
            ...current,
            status: data.ok ? (data.status === 'redirected' ? 'redirected' : 'ok') : 'broken',
            httpStatus: data.httpStatus,
            lastCheckedAt: data.checkedAt,
          }
        : current);
      setNotice(data.ok ? '链接可访问。' : `链接需要处理：${data.error ?? data.status}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '检测失败。');
    } finally {
      setBusy(null);
    }
  }

  async function reanalyzeBookmark() {
    setBusy('reanalyzing');
    setNotice('');
    setError('');

    try {
      const res = await fetch(`/api/bookmarks/${id}/reanalyze`, { method: 'POST' });
      const data = await res.json() as { error?: string; bookmark?: BookmarkResponse; aiPowered?: boolean };
      if (!res.ok) throw new Error(data.error ?? '重新分析失败。');

      if (!data.bookmark) throw new Error('重新分析返回为空。');
      const next = normalizeBookmark(data.bookmark);
      setBookmark(next);
      setForm(toForm(next));
      setNotice(data.aiPowered ? '已基于网页内容重新生成中文摘要并刷新索引。' : '已抓取网页内容并刷新索引；配置 AI 后可生成中文摘要。');
    } catch (err) {
      setError(err instanceof Error ? err.message : '重新分析失败。');
    } finally {
      setBusy(null);
    }
  }

  async function deleteBookmark() {
    const confirmed = window.confirm('移入回收状态？同步前不会直接删除 Chrome 书签。');
    if (!confirmed) return;

    setBusy('deleting');
    try {
      await fetch(`/api/bookmarks/${id}`, { method: 'DELETE' });
      router.push('/library');
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <div className="text-muted animate-pulse">{t.common.loading}</div>;
  if (!bookmark) return <div className="text-muted">{error || t.detail.notFound}</div>;

  return (
    <div className="mx-auto max-w-5xl">
      <button onClick={() => router.back()} className="mb-4 block text-sm text-muted hover:text-foreground">
        &larr; {t.detail.back}
      </button>

      <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <StatusPill status={bookmark.status} />
            {bookmark.isDuplicate && <span className="rounded bg-warning-light px-2 py-0.5 text-xs font-semibold text-warning">{t.library.dup}</span>}
            {bookmark.httpStatus && <span className="text-xs text-muted">HTTP {bookmark.httpStatus}</span>}
          </div>
          <h1 className="break-words text-2xl font-bold text-[#101828]">{bookmark.title || t.detail.untitled}</h1>
          <a href={bookmark.url} target="_blank" rel="noopener noreferrer" className="mt-1 block break-all text-sm text-accent hover:underline">
            {bookmark.url}
          </a>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={checkLink}
            disabled={busy !== null}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-[#344054] disabled:opacity-50"
          >
            {busy === 'checking' ? '检测中...' : '检测链接'}
          </button>
          <button
            onClick={reanalyzeBookmark}
            disabled={busy !== null}
            className="rounded-lg border border-[#b9d3ff] bg-[#eef4ff] px-3 py-2 text-sm font-semibold text-[#1463ff] disabled:opacity-50"
          >
            {busy === 'reanalyzing' ? '分析中...' : '重新分析网页'}
          </button>
        </div>
      </div>

      {(notice || error) && (
        <div className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
          error ? 'border-[#f5c2c7] bg-[#fff3f3] text-[#c0172d]' : 'border-[#b7ebc6] bg-[#f0fff4] text-[#157347]'
        }`}>
          {error || notice}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="rounded-lg border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-bold text-[#101828]">书签纠错</h2>
            <button
              onClick={saveBookmark}
              disabled={busy !== null}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy === 'saving' ? '保存中...' : '保存修改'}
            </button>
          </div>

          <div className="space-y-4">
            <Field label="标题">
              <input
                value={form.title}
                onChange={(event) => updateForm('title', event.target.value)}
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-accent"
                placeholder="给书签一个能搜索到的标题"
              />
            </Field>

            <Field label="URL">
              <input
                value={form.url}
                onChange={(event) => updateForm('url', event.target.value)}
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-accent"
                placeholder="https://example.com"
              />
            </Field>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="文件夹">
                <input
                  value={form.folderPath}
                  onChange={(event) => updateForm('folderPath', event.target.value)}
                  className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-accent"
                  placeholder="AI/Tools"
                />
              </Field>

              <Field label="标签">
                <input
                  value={form.tags}
                  onChange={(event) => updateForm('tags', event.target.value)}
                  className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-accent"
                  placeholder="mcp, ai-tools, docs"
                />
                <div className="mt-1.5 text-xs text-muted">最多保留 {MAX_BOOKMARK_TAGS} 个标签，用逗号分隔。</div>
              </Field>
            </div>

            <Field label="摘要">
              <textarea
                value={form.summary}
                onChange={(event) => updateForm('summary', event.target.value)}
                rows={5}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm leading-6 outline-none focus:border-accent"
                placeholder="这个网页是做什么的，为什么值得保留"
              />
            </Field>

            <Field label="备注 / 描述">
              <textarea
                value={form.description}
                onChange={(event) => updateForm('description', event.target.value)}
                rows={3}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm leading-6 outline-none focus:border-accent"
                placeholder="补充你自己的搜索线索，比如使用场景、项目名、当时为什么收藏"
              />
            </Field>
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-bold text-[#101828]">索引状态</h2>
            <div className="mt-3 space-y-2 text-sm text-[#475467]">
              <MetaRow label="导入时间" value={formatDate(bookmark.importedAt)} />
              <MetaRow label="更新时间" value={formatDate(bookmark.updatedAt)} />
              <MetaRow label="检测时间" value={formatDate(bookmark.lastCheckedAt)} />
              <MetaRow label="索引时间" value={formatDate(bookmark.lastIndexedAt)} />
              <MetaRow label="原始标题" value={bookmark.originalTitle || '无'} />
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-bold text-[#101828]">当前标签</h2>
            {tagList.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {tagList.map((tag) => (
                  <span key={tag} className="rounded bg-accent-light px-2 py-0.5 text-xs font-semibold text-accent">#{tag}</span>
                ))}
              </div>
            ) : (
              <div className="mt-3 text-sm text-muted">{t.detail.noTags}</div>
            )}
            <p className="mt-3 text-xs leading-5 text-muted">分类、标签和摘要会进入全文索引；生成 embedding 后，也会参与智能搜索召回。</p>
          </section>

          <section className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-bold text-[#101828]">网页正文</h2>
            {bookmark.contentText ? (
              <p className="mt-3 max-h-52 overflow-auto text-xs leading-5 text-[#667085]">
                {bookmark.contentText}
              </p>
            ) : (
              <div className="mt-3 rounded-lg bg-[#fbfdff] p-3 text-sm text-muted">
                还没有抓取到网页正文。点击“重新分析网页”会先抓取内容，再更新中文摘要和索引。
              </div>
            )}
          </section>

          <button
            onClick={deleteBookmark}
            disabled={busy !== null}
            className="inline-flex h-10 w-full items-center justify-center whitespace-nowrap rounded-lg border border-danger/30 bg-white px-3 text-sm font-semibold text-danger hover:bg-danger-light disabled:opacity-50"
          >
            {busy === 'deleting' ? '处理中...' : t.detail.delete}
          </button>
        </aside>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted">{label}</div>
      {children}
    </label>
  );
}

function StatusPill({ status }: { status: string }) {
  const classes = status === 'ok'
    ? 'bg-success-light text-success'
    : status === 'broken'
      ? 'bg-danger-light text-danger'
      : status === 'redirected'
        ? 'bg-warning-light text-warning'
        : 'bg-accent-light text-muted';

  return <span className={`rounded px-2 py-0.5 text-xs font-semibold ${classes}`}>{status}</span>;
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-muted">{label}</span>
      <span className="min-w-0 break-words text-right text-[#101828]">{value}</span>
    </div>
  );
}

function normalizeBookmark(data: BookmarkResponse): BookmarkDetail {
  const tags = Array.isArray(data?.tags)
    ? data.tags.flatMap((tag): BookmarkTag[] => {
      if (typeof tag === 'string') {
        return [{ name: tag, source: 'ai', confidence: null }];
      }

      if (!tag.name) return [];

      return [{
        name: tag.name,
        source: tag.source ?? 'user',
        confidence: tag.confidence ?? null,
      }];
    })
    : [];

  return { ...data, tags };
}

function toForm(bookmark: BookmarkDetail): EditForm {
  return {
    title: bookmark.title ?? '',
    url: bookmark.url,
    folderPath: bookmark.folderPath ?? '',
    tags: bookmark.tags.map((tag) => tag.name).join(', '),
    summary: bookmark.summary ?? '',
    description: bookmark.description ?? '',
  };
}

function parseTags(value: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];

  for (const raw of value.split(/[,\n，]/)) {
    const tag = raw.trim();
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length >= MAX_BOOKMARK_TAGS) break;
  }

  return tags;
}

function formatDate(value?: string | null): string {
  if (!value) return '未记录';
  const time = Date.parse(value);
  if (Number.isNaN(time)) return '未记录';
  return new Date(time).toLocaleString();
}

const emptyForm: EditForm = {
  title: '',
  url: '',
  folderPath: '',
  tags: '',
  summary: '',
  description: '',
};
