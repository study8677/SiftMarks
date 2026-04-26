'use client';

import { useEffect, useState, useCallback } from 'react';
import { useI18n } from '@/lib/i18n';

interface Suggestion {
  id: string;
  type: string;
  status: string;
  bookmarkId: string | null;
  beforeJson: string;
  afterJson: string;
  reason: string | null;
  confidence: number | null;
  bookmark: { title: string | null; url: string } | null;
}

interface ChromeSyncNotice {
  count: number;
}

export default function RescuePage() {
  const { t } = useI18n();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const [filterType, setFilterType] = useState<string | null>(null);

  const typeLabels = t.rescue.types as Record<string, string>;

  const fetchSuggestions = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ status: 'pending', limit: '100' });
    if (filterType) params.set('type', filterType);

    const res = await fetch(`/api/suggestions?${params}`);
    const data = await res.json();
    setSuggestions(data.items);
    setTotal(data.total);
    setLoading(false);
    setHasScanned(true);
  }, [filterType]);

  const runRescue = async () => {
    setScanning(true);
    await fetch('/api/rescue', { method: 'POST' });
    setScanning(false);
    fetchSuggestions();
  };

  const handleAccept = async (id: string) => {
    await fetch(`/api/suggestions/${id}/accept`, { method: 'POST' });
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
    setTotal((n) => n - 1);
  };

  const handleDismiss = async (id: string) => {
    await fetch(`/api/suggestions/${id}/dismiss`, { method: 'POST' });
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
    setTotal((n) => n - 1);
  };

  const [acceptingAll, setAcceptingAll] = useState(false);
  const [syncingChrome, setSyncingChrome] = useState(false);
  const [syncResult, setSyncResult] = useState<ChromeSyncNotice | null>(null);

  const fetchChromeSyncNotice = useCallback(async (showEmpty = false) => {
    const res = await fetch('/api/extension/sync-back');
    const data = await res.json();
    const count = data.count ?? 0;
    setSyncResult(count > 0 || showEmpty ? { count } : null);
  }, []);

  const handleAcceptAllSuggestions = async () => {
    setAcceptingAll(true);
    await fetch('/api/suggestions/accept-all', { method: 'POST' });
    setAcceptingAll(false);
    fetchSuggestions();
  };

  const handleDismissAll = async () => {
    for (const s of suggestions) {
      await fetch(`/api/suggestions/${s.id}/dismiss`, { method: 'POST' });
    }
    fetchSuggestions();
  };

  const handleAcceptAndSync = async () => {
    setAcceptingAll(true);
    await fetch('/api/suggestions/accept-all', { method: 'POST' });
    setAcceptingAll(false);
    await fetchChromeSyncNotice(true);
    fetchSuggestions();
  };

  const handleSyncToChrome = async () => {
    setSyncingChrome(true);
    await fetchChromeSyncNotice(true);
    setSyncingChrome(false);
  };

  useEffect(() => {
    fetchSuggestions();
    fetchChromeSyncNotice();
  }, [fetchSuggestions, fetchChromeSyncNotice]);

  const typeCounts = new Map<string, number>();
  for (const s of suggestions) {
    typeCounts.set(s.type, (typeCounts.get(s.type) ?? 0) + 1);
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{t.rescue.title}</h1>
          <p className="text-muted text-sm mt-1">{t.rescue.desc}</p>
        </div>
        <button
          onClick={runRescue}
          disabled={scanning}
          className="px-4 py-2 bg-accent text-white rounded-md font-medium text-sm hover:opacity-90 transition disabled:opacity-50"
        >
          {scanning ? t.rescue.scanning : t.rescue.runScan}
        </button>
      </div>

      {hasScanned && total > 0 && (
        <div className="mb-6 p-4 rounded-lg bg-warning-light border border-warning/20">
          <p className="font-medium">{t.rescue.cleanupPR(total)}</p>
          <p className="text-sm text-muted mt-1">{t.rescue.cleanupPRDesc}</p>
        </div>
      )}

      {total > 0 && (
        <div className="flex gap-1 mb-4 flex-wrap">
          <button
            onClick={() => setFilterType(null)}
            className={`px-3 py-1 rounded-md text-sm ${!filterType ? 'bg-accent text-white' : 'text-muted border border-border'}`}
          >
            {t.library.filters.all} ({total})
          </button>
          {Array.from(typeCounts.entries()).map(([type, count]) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`px-3 py-1 rounded-md text-sm ${filterType === type ? 'bg-accent text-white' : 'text-muted border border-border'}`}
            >
              {typeLabels[type] ?? type} ({count})
            </button>
          ))}
        </div>
      )}

      {/* Sync result banner */}
      {syncResult && (
        <div className="mb-4 p-4 rounded-lg bg-accent-light border border-accent/20">
          <p className="font-semibold">
            {syncResult.count > 0
              ? t.rescue.syncReady(syncResult.count)
              : t.rescue.syncNoOps}
          </p>
          {syncResult.count > 0 && (
            <p className="text-sm text-muted mt-1">{t.rescue.syncUseExtension}</p>
          )}
        </div>
      )}

      {total === 0 && syncResult?.count ? (
        <div className="mb-4">
          <button
            onClick={handleSyncToChrome}
            disabled={syncingChrome}
            className="px-4 py-3 border-2 border-accent text-accent rounded-lg font-medium text-sm hover:bg-accent-light transition disabled:opacity-50"
          >
            {syncingChrome ? t.rescue.syncingChrome : t.rescue.syncToChrome}
          </button>
        </div>
      ) : null}

      {total > 0 && (
        <div className="space-y-3 mb-4">
          {/* Primary: one-click accept + sync to Chrome */}
            <button
              onClick={handleAcceptAndSync}
              disabled={acceptingAll || syncingChrome}
              className="w-full px-4 py-4 bg-accent text-white rounded-lg font-bold text-base hover:opacity-90 transition disabled:opacity-50"
            >
            {acceptingAll ? t.rescue.accepting : syncingChrome ? t.rescue.syncingChrome : t.rescue.acceptAndSync(total)}
          </button>

          <div className="flex gap-3">
            <button
              onClick={handleAcceptAllSuggestions}
              disabled={acceptingAll}
              className="flex-1 px-4 py-3 bg-success text-white rounded-lg font-medium text-sm hover:opacity-90 transition disabled:opacity-50"
            >
              {acceptingAll ? t.rescue.accepting : t.rescue.acceptAll(total)}
            </button>
            <button
              onClick={handleSyncToChrome}
              disabled={syncingChrome}
              className="flex-1 px-4 py-3 border-2 border-accent text-accent rounded-lg font-medium text-sm hover:bg-accent-light transition disabled:opacity-50"
            >
              {syncingChrome ? t.rescue.syncingChrome : t.rescue.syncToChrome}
            </button>
            <button
              onClick={handleDismissAll}
              className="px-4 py-3 border border-border rounded-lg text-sm text-muted hover:text-foreground hover:border-danger transition"
            >
              {t.rescue.dismissAll}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-muted animate-pulse">{t.common.loading}</div>
      ) : suggestions.length === 0 ? (
        <div className="text-center py-12 text-muted">
          {hasScanned ? t.rescue.noPending : t.rescue.clickToScan}
        </div>
      ) : (
        <div className="space-y-3">
          {suggestions.map((s) => (
            <SuggestionCard
              key={s.id}
              suggestion={s}
              typeLabels={typeLabels}
              t={t}
              onAccept={() => handleAccept(s.id)}
              onDismiss={() => handleDismiss(s.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SuggestionCard({
  suggestion,
  typeLabels,
  t,
  onAccept,
  onDismiss,
}: {
  suggestion: Suggestion;
  typeLabels: Record<string, string>;
  t: any;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const before = JSON.parse(suggestion.beforeJson);
  const after = JSON.parse(suggestion.afterJson);

  return (
    <div className="p-4 rounded-lg border border-border bg-card">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-xs px-2 py-0.5 rounded font-medium ${
              suggestion.type === 'merge_duplicate' ? 'bg-warning-light text-warning' :
              suggestion.type === 'delete_broken' ? 'bg-danger-light text-danger' :
              'bg-accent-light text-accent'
            }`}>
              {typeLabels[suggestion.type] ?? suggestion.type}
            </span>
            {suggestion.confidence !== null && (
              <span className="text-xs text-muted">{t.rescue.confidence(Math.round(suggestion.confidence * 100))}</span>
            )}
          </div>

          {suggestion.bookmark && (
            <div className="text-sm mb-2">
              <span className="font-medium">{suggestion.bookmark.title ?? t.detail.untitled}</span>
              <span className="text-muted text-xs ml-2">{suggestion.bookmark.url}</span>
            </div>
          )}

          <div className="font-mono text-xs space-y-0.5">
            {before.title !== undefined && <div className="text-danger">{t.rescue.diff.removeTitle(before.title)}</div>}
            {after.title !== undefined && <div className="text-success">{t.rescue.diff.addTitle(after.title)}</div>}
            {before.url && suggestion.type === 'merge_duplicate' && <div className="text-danger">- {before.url}</div>}
            {after.targetUrl && <div className="text-success">{t.rescue.diff.keepUrl(after.targetUrl)}</div>}
            {after.tags && <div className="text-success">{t.rescue.diff.addTags(JSON.stringify(after.tags))}</div>}
            {after.action === 'delete' && <div className="text-danger">{t.rescue.diff.removeBroken}</div>}
          </div>

          {suggestion.reason && <div className="text-xs text-muted mt-2">{suggestion.reason}</div>}
        </div>

        <div className="flex gap-1 shrink-0">
          <button onClick={onAccept} className="px-3 py-1 bg-success text-white rounded text-xs hover:opacity-90 transition">
            {t.rescue.accept}
          </button>
          <button onClick={onDismiss} className="px-3 py-1 border border-border rounded text-xs hover:bg-card transition">
            {t.rescue.dismiss}
          </button>
        </div>
      </div>
    </div>
  );
}
