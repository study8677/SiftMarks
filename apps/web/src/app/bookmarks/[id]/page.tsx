'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n';

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
  tags: Array<{ name: string; source: string; confidence: number | null }>;
}

export default function BookmarkDetailPage() {
  const { t } = useI18n();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [bookmark, setBookmark] = useState<BookmarkDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');

  useEffect(() => {
    fetch(`/api/bookmarks/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setBookmark(data);
        setEditTitle(data.title ?? '');
      })
      .finally(() => setLoading(false));
  }, [id]);

  const handleSaveTitle = async () => {
    await fetch(`/api/bookmarks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: editTitle }),
    });
    setBookmark((b) => b ? { ...b, title: editTitle } : b);
    setEditing(false);
  };

  const handleDelete = async () => {
    await fetch(`/api/bookmarks/${id}`, { method: 'DELETE' });
    router.push('/library');
  };

  if (loading) return <div className="text-muted animate-pulse">{t.common.loading}</div>;
  if (!bookmark) return <div className="text-muted">{t.detail.notFound}</div>;

  return (
    <div className="max-w-3xl mx-auto">
      <button onClick={() => router.back()} className="text-sm text-muted hover:text-foreground mb-4 block">
        &larr; {t.detail.back}
      </button>

      <div className="bg-card border border-border rounded-lg p-6">
        <div className="mb-4">
          {editing ? (
            <div className="flex gap-2">
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="flex-1 px-3 py-1.5 border border-border rounded bg-background"
              />
              <button onClick={handleSaveTitle} className="px-3 py-1.5 bg-accent text-white rounded text-sm">{t.detail.save}</button>
              <button onClick={() => setEditing(false)} className="px-3 py-1.5 border border-border rounded text-sm">{t.detail.cancel}</button>
            </div>
          ) : (
            <h1 className="text-xl font-bold cursor-pointer hover:text-accent" onClick={() => setEditing(true)}>
              {bookmark.title || t.detail.untitled}
            </h1>
          )}
        </div>

        <a href={bookmark.url} target="_blank" rel="noopener noreferrer" className="text-sm text-accent hover:underline break-all">
          {bookmark.url}
        </a>

        <div className="flex gap-2 mt-4">
          <span className={`text-xs px-2 py-0.5 rounded ${
            bookmark.status === 'ok' ? 'bg-success-light text-success' :
            bookmark.status === 'broken' ? 'bg-danger-light text-danger' :
            'bg-accent-light text-muted'
          }`}>
            {bookmark.status}
          </span>
          {bookmark.isDuplicate && (
            <span className="text-xs px-2 py-0.5 rounded bg-warning-light text-warning">{t.library.dup}</span>
          )}
          {bookmark.httpStatus && <span className="text-xs text-muted">HTTP {bookmark.httpStatus}</span>}
        </div>

        {bookmark.folderPath && (
          <div className="mt-4">
            <div className="text-xs text-muted uppercase font-semibold mb-1">{t.detail.folder}</div>
            <div className="text-sm">{bookmark.folderPath}</div>
          </div>
        )}

        <div className="mt-4">
          <div className="text-xs text-muted uppercase font-semibold mb-1">{t.detail.tags}</div>
          {bookmark.tags.length > 0 ? (
            <div className="flex gap-1 flex-wrap">
              {bookmark.tags.map((tg) => (
                <span key={tg.name} className="text-xs px-2 py-0.5 rounded bg-accent-light text-accent">
                  #{tg.name}
                  {tg.confidence !== null && <span className="ml-1 opacity-60">{Math.round(tg.confidence * 100)}%</span>}
                </span>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted">{t.detail.noTags}</div>
          )}
        </div>

        {bookmark.summary && (
          <div className="mt-4">
            <div className="text-xs text-muted uppercase font-semibold mb-1">{t.detail.summary}</div>
            <div className="text-sm">{bookmark.summary}</div>
          </div>
        )}

        {bookmark.description && (
          <div className="mt-4">
            <div className="text-xs text-muted uppercase font-semibold mb-1">{t.detail.description}</div>
            <div className="text-sm text-muted">{bookmark.description}</div>
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-border text-xs text-muted flex gap-6">
          {bookmark.createdAt && <div>{t.detail.created}: {new Date(bookmark.createdAt).toLocaleDateString()}</div>}
          <div>{t.detail.imported}: {new Date(bookmark.importedAt).toLocaleDateString()}</div>
        </div>

        <div className="mt-4 pt-4 border-t border-border flex gap-2">
          <button
            onClick={handleDelete}
            className="px-3 py-1.5 text-sm text-danger border border-danger/30 rounded hover:bg-danger-light transition"
          >
            {t.detail.delete}
          </button>
        </div>
      </div>
    </div>
  );
}
