'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

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
  ops: ChromeSyncOp[];
}

interface ChromeSyncOp {
  id: string;
  action: 'update' | 'remove' | 'move' | 'create';
  chromeId?: string;
  bookmarkId?: string;
  bookmarkTitle?: string | null;
  bookmarkUrl?: string;
  title?: string;
  url?: string;
  folderPath?: string;
}

interface RescueRunResult {
  suggestionsCount: number;
  duplicates: number;
  broken: number;
  renames: number;
  tags: number;
  folders: number;
  aiPowered: boolean;
  analysis?: {
    processed: number;
    fetched: number;
    summaries: number;
    tags: number;
    embeddings: number;
    linkFailures: number;
    errors: number;
    firstError: string | null;
  };
  folderPolicy?: {
    folderDepth: 1 | 2;
    topLevelFolderLimit: number;
    topLevelFolderCount: number;
    projectedTopLevelFolderCount: number;
    limitReached: boolean;
    willReachLimit: boolean;
    message: string | null;
  };
}

const typeLabels: Record<string, string> = {
  rename: '标题修复',
  tag: '标签修改',
  move: '分类建议',
  delete_broken: '坏链处理',
  merge_folder: '文件夹合并',
  normalize_tag: '标签规范化',
};

function notifySuggestionsChanged() {
  window.dispatchEvent(new Event('siftmarks:suggestions-changed'));
}

export default function RescuePage() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [allSuggestions, setAllSuggestions] = useState<Suggestion[]>([]);
  const [total, setTotal] = useState(0);
  const [visibleTotal, setVisibleTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const [filterType, setFilterType] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<RescueRunResult | null>(null);
  const [syncingChrome, setSyncingChrome] = useState(false);
  const [syncResult, setSyncResult] = useState<ChromeSyncNotice | null>(null);
  const [folderDepth, setFolderDepth] = useState<1 | 2>(1);
  const [topLevelFolderLimit, setTopLevelFolderLimit] = useState(10);
  const [savingFolderPolicy, setSavingFolderPolicy] = useState(false);
  const [bulkAccepting, setBulkAccepting] = useState(false);
  const [bulkUndoing, setBulkUndoing] = useState(false);
  const [lastBulkAcceptedIds, setLastBulkAcceptedIds] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const fetchSuggestions = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ status: 'pending', limit: '100' });
    if (filterType) params.set('type', filterType);

    try {
      const allParams = new URLSearchParams({ status: 'pending', limit: '100000' });
      const [res, allRes] = await Promise.all([
        fetch(`/api/suggestions?${params}`),
        fetch(`/api/suggestions?${allParams}`),
      ]);
      const [data, allData] = await Promise.all([
        res.json(),
        allRes.json(),
      ]);
      setSuggestions(data.items ?? []);
      setAllSuggestions(allData.items ?? []);
      setVisibleTotal(data.total ?? 0);
      setTotal(allData.total ?? 0);
      setHasScanned(true);
      setError('');
    } catch {
      setError('建议列表加载失败。');
    } finally {
      setLoading(false);
    }
  }, [filterType]);

  const fetchChromeSyncNotice = useCallback(async (showEmpty = false) => {
    try {
      const res = await fetch('/api/extension/sync-back');
      const data = await res.json();
      const count = data.count ?? 0;
      setSyncResult(count > 0 || showEmpty ? { count, ops: Array.isArray(data.ops) ? data.ops : [] } : null);
    } catch {
      setError('同步影响预览失败。');
    }
  }, []);

  const fetchFolderPolicy = useCallback(async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      setFolderDepth(data.folderDepth === 2 ? 2 : 1);
      const value = Number(data.topLevelFolderLimit);
      setTopLevelFolderLimit(Number.isFinite(value) ? Math.min(Math.max(Math.round(value), 3), 50) : 10);
    } catch {
      setError('文件夹策略加载失败。');
    }
  }, []);

  useEffect(() => {
    // Existing app pages hydrate local API state from client effects.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchSuggestions();
    fetchChromeSyncNotice();
    fetchFolderPolicy();
  }, [fetchSuggestions, fetchChromeSyncNotice, fetchFolderPolicy]);

  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const suggestion of allSuggestions) {
      counts.set(suggestion.type, (counts.get(suggestion.type) ?? 0) + 1);
    }
    return counts;
  }, [allSuggestions]);

  async function runRescue() {
    setScanning(true);
    setNotice('');
    setError('');

    try {
      const res = await fetch('/api/rescue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deep: true, analysisLimit: 20 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '整理扫描失败。');
      setScanResult(data);
      const suggestionsCount = data.suggestionsCount ?? 0;
      setNotice(suggestionsCount > 0
        ? `生成 ${suggestionsCount} 条待审查建议。`
        : '整理检查完成，当前没有需要处理的建议。'
      );
      await fetchSuggestions();
      notifySuggestionsChanged();
      await fetchChromeSyncNotice();
    } catch (err) {
      setError(err instanceof Error ? err.message : '整理扫描失败。');
    } finally {
      setScanning(false);
    }
  }

  async function acceptSuggestion(id: string) {
    setNotice('');
    setError('');

    try {
      const res = await fetch(`/api/suggestions/${id}/accept`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? '接受建议失败。');

      setSuggestions((prev) => prev.filter((suggestion) => suggestion.id !== id));
      setAllSuggestions((prev) => prev.filter((suggestion) => suggestion.id !== id));
      setVisibleTotal((count) => Math.max(0, count - 1));
      setTotal((count) => Math.max(0, count - 1));
      setNotice('建议已写入本地。涉及 Chrome 的改动会进入同步预览。');
      setLastBulkAcceptedIds([]);
      notifySuggestionsChanged();
      await fetchChromeSyncNotice();
    } catch (err) {
      setError(err instanceof Error ? err.message : '接受建议失败。');
    }
  }

  async function dismissSuggestion(id: string) {
    setNotice('');
    setError('');

    try {
      const res = await fetch(`/api/suggestions/${id}/dismiss`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? '忽略建议失败。');

      setSuggestions((prev) => prev.filter((suggestion) => suggestion.id !== id));
      setAllSuggestions((prev) => prev.filter((suggestion) => suggestion.id !== id));
      setVisibleTotal((count) => Math.max(0, count - 1));
      setTotal((count) => Math.max(0, count - 1));
      setLastBulkAcceptedIds([]);
      notifySuggestionsChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : '忽略建议失败。');
    }
  }

  async function acceptAllSuggestions() {
    if (visibleTotal === 0) {
      setNotice('当前没有可接受的待审查建议。');
      setError('');
      return;
    }
    const targetCount = filterType ? visibleTotal : total;
    const confirmed = window.confirm(`接受全部 ${targetCount} 条待审查建议？改动会先写入本地，涉及 Chrome 的项目进入同步预览。`);
    if (!confirmed) return;

    setBulkAccepting(true);
    setNotice('');
    setError('');

    try {
      const res = await fetch('/api/suggestions/accept-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(filterType ? { type: filterType } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? '一键接受失败。');

      const accepted = Number(data.accepted ?? 0);
      const acceptedIds = Array.isArray(data.acceptedIds)
        ? data.acceptedIds.map((id: unknown) => String(id)).filter(Boolean)
        : [];
      setLastBulkAcceptedIds(acceptedIds);
      setNotice(accepted > 0
        ? `已接受 ${accepted} 条建议。需要写回 Chrome 的改动会进入同步预览，可在写回前一键撤回。`
        : '当前没有可接受的待审查建议。'
      );
      await fetchSuggestions();
      notifySuggestionsChanged();
      await fetchChromeSyncNotice(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '一键接受失败。');
    } finally {
      setBulkAccepting(false);
    }
  }

  async function undoAcceptedSuggestions() {
    setBulkUndoing(true);
    setNotice('');
    setError('');

    try {
      const res = await fetch('/api/suggestions/undo-accepted', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lastBulkAcceptedIds.length > 0
          ? { suggestionIds: lastBulkAcceptedIds, includeSynced: true }
          : {}
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? '撤回失败。');

      const reverted = Number(data.reverted ?? 0);
      setLastBulkAcceptedIds([]);
      setNotice(reverted > 0
        ? `已撤回 ${reverted} 条已接受建议，改动已恢复为待审查状态。`
        : '当前没有可撤回的已接受建议。'
      );
      await fetchSuggestions();
      notifySuggestionsChanged();
      await fetchChromeSyncNotice(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '撤回失败。');
    } finally {
      setBulkUndoing(false);
    }
  }

  async function dismissVisibleSuggestions() {
    const confirmed = window.confirm('忽略当前列表里的所有建议？');
    if (!confirmed) return;

    for (const suggestion of suggestions) {
      await fetch(`/api/suggestions/${suggestion.id}/dismiss`, { method: 'POST' });
    }
    await fetchSuggestions();
    notifySuggestionsChanged();
    setLastBulkAcceptedIds([]);
    setNotice('当前列表建议已忽略。');
  }

  async function previewChromeSync() {
    setSyncingChrome(true);
    await fetchChromeSyncNotice(true);
    setSyncingChrome(false);
  }

  async function exportChromeFromWeb() {
    setSyncingChrome(true);
    setNotice('');
    setError('');

    try {
      const res = await fetch('/api/extension/sync-back');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? '导出回 Chrome 失败。');

      const count = Number(data.count ?? 0);
      const ops = Array.isArray(data.ops) ? data.ops : [];
      setSyncResult({ count, ops });
      setNotice(count > 0
        ? `已准备 ${count} 项待写回 Chrome。网页没有 Chrome 书签权限，请打开 SiftMarks 插件弹窗并点击“安全写回 Chrome”完成写回。`
        : '当前没有需要导出回 Chrome 的改动。'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '导出回 Chrome 失败。');
    } finally {
      setSyncingChrome(false);
    }
  }

  async function saveFolderPolicy() {
    setSavingFolderPolicy(true);
    setNotice('');
    setError('');

    try {
      const normalizedLimit = Number.isFinite(topLevelFolderLimit)
        ? Math.min(Math.max(Math.round(topLevelFolderLimit), 3), 50)
        : 10;
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folderDepth,
          topLevelFolderLimit: normalizedLimit,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? '保存文件夹策略失败。');
      setTopLevelFolderLimit(normalizedLimit);
      if (data.folderDepthChanged) {
        await fetchSuggestions();
        notifySuggestionsChanged();
        const cleared = Number(data.clearedPendingFolderSuggestions ?? 0);
        setNotice(cleared > 0
          ? `文件夹策略已保存，已清空 ${cleared} 条旧分类建议。请重新生成整理建议后再接受分类建议。`
          : '文件夹策略已保存。请重新生成整理建议，让 AI 按新层级重新判断分类。'
        );
      } else if (data.topLevelFolderLimitChanged) {
        if (data.topLevelFolderLimitExceeded) {
          setNotice(`一级文件夹上限已保存。当前已有 ${data.topLevelFolderCount} 个一级文件夹，超过新上限 ${data.topLevelFolderLimit}；现有建议不会清空，建议重新整理分类方案或调高上限。`);
        } else if (data.topLevelFolderLimitDecreased) {
          setNotice('一级文件夹上限已保存。当前一级文件夹数量未超过新上限，现有建议不需要重新生成。');
        } else {
          setNotice('一级文件夹上限已保存。上限变大不会影响现有建议，不需要重新生成。');
        }
      } else {
        setNotice('文件夹策略未变化，现有建议可继续审查。');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存文件夹策略失败。');
    } finally {
      setSavingFolderPolicy(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1380px] pb-6">
      <header className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-[#101828]">整理建议</h1>
          <p className="mt-1 max-w-[820px] text-sm leading-6 text-[#667085]">
            书签管家会定期发现坏链、空标题、缺摘要和分类问题；AI 只给建议，不会绕过你直接改 Chrome。
          </p>
        </div>
        <button
          onClick={runRescue}
          disabled={scanning}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-[#1463ff] px-4 text-sm font-bold text-white shadow-[0_8px_18px_rgba(20,99,255,0.2)] transition hover:bg-[#0f57e6] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RescueIcon name="sparkles" className="h-4 w-4" />
          {scanning ? '扫描中...' : '生成整理建议'}
        </button>
      </header>

      <section id="folder-policy" className="mb-4 rounded-xl border border-[#dfe6f2] bg-white px-5 py-5 shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-center">
          <div>
            <h2 className="text-base font-bold tracking-tight text-[#101828]">AI 文件夹策略</h2>
            <p className="mt-2 max-w-[760px] text-sm leading-6 text-[#667085]">
              AI 先参考已有文件夹；不合适才建议新文件夹。切换层级后需重新生成分类建议；二级文件夹不单独设上限。
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end xl:justify-end">
            <div>
              <div className="mb-2 text-xs font-semibold text-[#667085]">层级</div>
              <div className="inline-flex rounded-lg border border-[#dfe6f2] bg-[#f8fafc] p-1">
                {[1, 2].map((depth) => (
                  <button
                    key={depth}
                    type="button"
                    onClick={() => setFolderDepth(depth as 1 | 2)}
                    className={`h-9 min-w-16 rounded-md px-3 text-sm font-bold transition ${
                      folderDepth === depth
                        ? 'bg-[#1463ff] text-white shadow-[0_8px_18px_rgba(20,99,255,0.22)]'
                        : 'text-[#667085] hover:bg-white hover:text-[#101828]'
                    }`}
                  >
                    {depth === 1 ? '一级' : '二级'}
                  </button>
                ))}
              </div>
            </div>
            <label className="block">
              <div className="mb-2 text-xs font-semibold text-[#667085]">一级文件夹上限</div>
              <input
                type="number"
                min={3}
                max={50}
                value={topLevelFolderLimit}
                onChange={(event) => setTopLevelFolderLimit(Number(event.target.value))}
                className="h-10 w-28 rounded-lg border border-[#dfe6f2] bg-white px-3 text-sm text-[#101828] outline-none transition focus:border-[#1463ff] focus:ring-4 focus:ring-[#1463ff]/10"
              />
            </label>
            <button
              type="button"
              onClick={saveFolderPolicy}
              disabled={savingFolderPolicy}
              className="h-10 rounded-lg border border-[#1463ff] bg-white px-4 text-sm font-bold text-[#1463ff] transition hover:bg-[#eef4ff] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingFolderPolicy ? '保存中...' : '保存策略'}
            </button>
          </div>
        </div>
      </section>

      {(notice || error) && (
        <div className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
          error ? 'border-[#f5c2c7] bg-[#fff3f3] text-[#c0172d]' : 'border-[#b7ebc6] bg-[#f0fff4] text-[#157347]'
        }`}>
          {error || notice}
        </div>
      )}

      {scanResult?.analysis && (
        <section className="mb-4 rounded-xl border border-[#dfe6f2] bg-white p-4 text-sm text-[#344054] shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
          <div className="font-bold text-[#101828]">本次整理扫描</div>
          <div className="mt-2 grid gap-2 md:grid-cols-6">
            <Metric label="分析书签" value={scanResult.analysis.processed} />
            <Metric label="抓到正文" value={scanResult.analysis.fetched} />
            <Metric label="生成摘要" value={scanResult.analysis.summaries} />
            <Metric label="辅助标签" value={scanResult.analysis.tags} />
            <Metric label="语义索引" value={scanResult.analysis.embeddings} />
            <Metric label="坏链/超时" value={scanResult.analysis.linkFailures} />
          </div>
          {scanResult.analysis.firstError && (
            <div className="mt-2 text-xs text-[#c0172d]">首个错误：{scanResult.analysis.firstError}</div>
          )}
        </section>
      )}

      {scanResult?.folderPolicy?.willReachLimit && (
        <section className="mb-4 rounded-xl border border-[#f2d06b] bg-[#fff9e6] p-4 text-sm text-[#7a4b00]">
          <div className="font-semibold text-[#5f3b00]">一级文件夹已达到上限</div>
          <p className="mt-1 leading-6">
            {scanResult.folderPolicy.message}
            {' '}如果你希望 AI 继续拆出新的一级文件夹，可以调整上限；如果当前分类已经太散，可以先重新生成一套分类方案。
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/taxonomy"
              className="rounded-lg border border-[#d39b21] bg-white px-3 py-1.5 text-xs font-semibold text-[#7a4b00] transition hover:bg-[#fff3c2]"
            >
              重新整理分类方案
            </Link>
            <Link
              href="#folder-policy"
              className="rounded-lg bg-[#d39b21] px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
            >
              调整一级文件夹上限
            </Link>
          </div>
        </section>
      )}

      {hasScanned && total > 0 && (
        <section className="mb-4 rounded-xl border border-warning/20 bg-warning-light p-4">
          <p className="text-sm font-medium">待审查建议：{total} 条</p>
          <p className="mt-1 text-sm text-muted">接受建议只先写入本地；涉及 Chrome 标题、移动、删除的改动会进入同步预览。</p>
        </section>
      )}

      <section className="mb-4 flex flex-col gap-3 rounded-xl border border-[#dfe6f2] bg-white px-5 py-4 shadow-[0_1px_2px_rgba(16,24,40,0.03)] md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2">
          <Link
            href="/import"
            className="inline-flex h-11 items-center gap-2 rounded-lg border border-[#1463ff] bg-white px-4 text-sm font-bold text-[#1463ff] transition hover:bg-[#eef4ff]"
          >
            <RescueIcon name="download" className="h-4 w-4" />
            导入书签
          </Link>
          <button
            type="button"
            onClick={acceptAllSuggestions}
            disabled={bulkAccepting || loading}
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#1463ff] px-4 text-sm font-bold text-white shadow-[0_8px_18px_rgba(20,99,255,0.2)] transition hover:bg-[#0f57e6] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RescueIcon name="check" className="h-4 w-4" />
            {bulkAccepting ? '接受中...' : '一键接受全部建议'}
          </button>
          <button
            type="button"
            onClick={undoAcceptedSuggestions}
            disabled={bulkUndoing || (lastBulkAcceptedIds.length === 0 && (syncResult?.count ?? 0) === 0)}
            className="inline-flex h-11 items-center gap-2 rounded-lg border border-[#d8e1ee] bg-white px-4 text-sm font-bold text-[#667085] transition hover:border-[#b9c7da] hover:bg-[#f7faff] hover:text-[#344054] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RescueIcon name="undo" className="h-4 w-4" />
            {bulkUndoing ? '撤回中...' : '一键撤回'}
          </button>
          <button
            type="button"
            onClick={exportChromeFromWeb}
            disabled={syncingChrome}
            className="inline-flex h-11 items-center gap-2 rounded-lg border border-[#1463ff] bg-[#eef4ff] px-4 text-sm font-bold text-[#1463ff] transition hover:bg-[#dce9ff] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RescueIcon name="upload" className="h-4 w-4" />
            {syncingChrome ? '准备中...' : '导出回 Chrome'}
          </button>
        </div>
        <div className="text-sm text-[#667085]">
          接受后先写入本地，写回 Chrome 前可撤回。
        </div>
      </section>

      {total > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            onClick={() => setFilterType(null)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${!filterType ? 'bg-accent text-white' : 'border border-border bg-white text-muted'}`}
          >
            全部 ({total})
          </button>
          {Array.from(typeCounts.entries()).map(([type, count]) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${filterType === type ? 'bg-accent text-white' : 'border border-border bg-white text-muted'}`}
            >
              {typeLabels[type] ?? type} ({count})
            </button>
          ))}
        </div>
      )}

      <section className="mb-4 rounded-xl border border-[#dfe6f2] bg-white px-5 py-4 shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3 text-sm leading-6 text-[#475467]">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#f2f4f7] text-[#344054]">
              <RescueIcon name="eye" className="h-5 w-5" />
            </span>
            接受后的改名、移动、删除，以及本地已分类但未写入 Chrome 的书签，会先留在同步计划里。
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={previewChromeSync}
              disabled={syncingChrome}
              className="h-10 rounded-lg border border-accent bg-white px-4 text-sm font-bold text-accent transition hover:bg-accent-light disabled:cursor-not-allowed disabled:opacity-50"
            >
              {syncingChrome ? '读取中...' : '预览待写回 Chrome'}
            </button>
            {suggestions.length > 0 && (
              <button
                onClick={dismissVisibleSuggestions}
                className="h-10 rounded-lg border border-border bg-white px-4 text-sm font-semibold text-muted transition hover:border-danger hover:text-foreground"
              >
                忽略当前列表
              </button>
            )}
          </div>
        </div>
      </section>

      {syncResult && (
        <section className="mb-4 rounded-xl border border-accent/20 bg-accent-light p-4">
          <p className="text-sm font-semibold">
            {syncResult.count > 0 ? `有 ${syncResult.count} 项 Chrome 改动等待插件写回。` : '当前没有需要写回 Chrome 的改动。'}
          </p>
          <p className="mt-1 text-sm text-muted">这里只预览待写回影响；预览不会修改 Chrome。</p>
          {syncResult.count > 0 && (
            <>
              <p className="mt-1 text-sm text-muted">真正写入 Chrome 仍需在 SiftMarks 插件弹窗点击“导出回 Chrome / 安全写回 Chrome”。</p>
              <div className="mt-3 space-y-2">
                {syncResult.ops.map((op) => (
                  <div key={op.id} className="rounded-lg border border-[#b9d3ff] bg-white/85 px-3 py-2 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-[#eef4ff] px-2 py-0.5 text-xs font-semibold text-[#1463ff]">{formatChromeOpAction(op)}</span>
                      <span className="min-w-0 truncate font-medium text-[#101828]">{op.bookmarkTitle || op.bookmarkUrl || op.chromeId || op.bookmarkId}</span>
                    </div>
                    <div className="mt-1 text-xs text-[#667085]">{formatChromeOpDetail(op)}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {loading ? (
        <div className="rounded-xl border border-dashed border-[#cbd5e1] bg-white py-12 text-center text-sm text-muted animate-pulse">加载中...</div>
      ) : suggestions.length === 0 ? (
        <EmptySuggestionState hasScanned={hasScanned} />
      ) : (
        <div className="space-y-2">
          {suggestions.map((suggestion) => (
            <SuggestionCard
              key={suggestion.id}
              suggestion={suggestion}
              onAccept={() => acceptSuggestion(suggestion.id)}
              onDismiss={() => dismissSuggestion(suggestion.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SuggestionCard({
  suggestion,
  onAccept,
  onDismiss,
}: {
  suggestion: Suggestion;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const before = parseJSON(suggestion.beforeJson);
  const after = parseJSON(suggestion.afterJson);

  return (
    <article className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className={`rounded px-2 py-0.5 text-xs font-medium ${
              suggestion.type === 'delete_broken'
                  ? 'bg-danger-light text-danger'
                  : 'bg-accent-light text-accent'
            }`}>
              {typeLabels[suggestion.type] ?? suggestion.type}
            </span>
            {suggestion.confidence !== null && (
              <span className="text-xs text-muted">置信度 {Math.round(suggestion.confidence * 100)}%</span>
            )}
          </div>

          {suggestion.bookmark && (
            <div className="mb-2 min-w-0 text-sm">
              <span className="font-medium">{suggestion.bookmark.title ?? '无标题'}</span>
              <span className="ml-2 text-xs text-muted">{suggestion.bookmark.url}</span>
            </div>
          )}

          <div className="space-y-1 rounded-lg bg-[#fbfdff] p-3 font-mono text-xs">
            {renderDiff(before, after, suggestion.type).map((line) => (
              <div key={line.text} className={line.tone === 'remove' ? 'text-danger' : line.tone === 'add' ? 'text-success' : 'text-[#475467]'}>
                {line.text}
              </div>
            ))}
          </div>

          {suggestion.reason && <div className="mt-2 text-xs text-muted">{suggestion.reason}</div>}
        </div>

        <div className="flex shrink-0 flex-wrap gap-1">
          {suggestion.bookmarkId && (
            <Link href={`/bookmarks/${suggestion.bookmarkId}`} className="rounded border border-border px-3 py-1 text-xs transition hover:bg-card">
              编辑
            </Link>
          )}
          <button onClick={onAccept} className="rounded bg-success px-3 py-1 text-xs text-white transition hover:opacity-90">
            接受
          </button>
          <button onClick={onDismiss} className="rounded border border-border px-3 py-1 text-xs transition hover:bg-card">
            忽略
          </button>
        </div>
      </div>
    </article>
  );
}

function EmptySuggestionState({ hasScanned }: { hasScanned: boolean }) {
  return (
    <div className="grid min-h-[150px] place-items-center rounded-xl border border-dashed border-[#cbd5e1] bg-white px-5 py-8 text-center">
      <div>
        <div className="relative mx-auto h-16 w-24">
          <RescueIcon name="sparkles" className="absolute left-2 top-1 h-4 w-4 text-[#b7c7e6]" />
          <RescueIcon name="sparkles" className="absolute right-4 top-6 h-3.5 w-3.5 text-[#b7c7e6]" />
          <div className="absolute left-1/2 top-4 grid h-12 w-14 -translate-x-1/2 place-items-center rounded-xl bg-[#e6edf8] text-[#9aaccc] shadow-[0_8px_18px_rgba(118,137,169,0.16)]">
            <RescueIcon name="inbox" className="h-7 w-7" />
          </div>
        </div>
        <div className="mt-2 text-base font-bold text-[#667085]">
          {hasScanned ? '当前没有待审查建议。' : '点击“生成整理建议”开始检查书签库。'}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-[#fbfdff] px-3 py-2">
      <div className="text-sm font-bold text-[#101828]">{value}</div>
      <div className="mt-0.5 text-xs text-[#667085]">{label}</div>
    </div>
  );
}

type RescueIconName = 'check' | 'download' | 'eye' | 'inbox' | 'sparkles' | 'undo' | 'upload';

function RescueIcon({ name, className = '' }: { name: RescueIconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {rescueIconPath(name)}
    </svg>
  );
}

function rescueIconPath(name: RescueIconName) {
  switch (name) {
    case 'check':
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="m8 12 2.5 2.5L16 9" />
        </>
      );
    case 'download':
      return (
        <>
          <path d="M12 3v12" />
          <path d="m7 10 5 5 5-5" />
          <path d="M5 21h14" />
        </>
      );
    case 'eye':
      return (
        <>
          <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      );
    case 'inbox':
      return (
        <>
          <path d="M5 6h14l2 8v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4l2-8Z" />
          <path d="M3 14h5l1.5 2h5L16 14h5" />
        </>
      );
    case 'sparkles':
      return (
        <>
          <path d="M12 3 14 9l6 2-6 2-2 6-2-6-6-2 6-2 2-6Z" />
          <path d="M19 3v4" />
          <path d="M21 5h-4" />
        </>
      );
    case 'undo':
      return (
        <>
          <path d="M9 14 4 9l5-5" />
          <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
        </>
      );
    case 'upload':
      return (
        <>
          <path d="M12 3v12" />
          <path d="m7 8 5-5 5 5" />
          <path d="M5 21h14" />
        </>
      );
  }
}

function parseJSON(value: string): Record<string, unknown> {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function renderDiff(before: Record<string, unknown>, after: Record<string, unknown>, type: string) {
  const lines: Array<{ text: string; tone: 'add' | 'remove' | 'neutral' }> = [];

  if (before.title !== undefined) lines.push({ text: `- title: ${formatDiffValue(before.title, '(empty)')}`, tone: 'remove' });
  if (after.title !== undefined) lines.push({ text: `+ title: ${formatDiffValue(after.title)}`, tone: 'add' });
  if (before.folderPath !== undefined) lines.push({ text: `- folder: ${formatDiffValue(before.folderPath, '(none)')}`, tone: 'remove' });
  if (after.folderPath !== undefined) lines.push({ text: `+ folder: ${formatDiffValue(after.folderPath)}`, tone: 'add' });
  if (before.url !== undefined) lines.push({ text: `- url: ${formatDiffValue(before.url)}`, tone: 'remove' });
  if (after.targetUrl !== undefined) lines.push({ text: `keep url: ${formatDiffValue(after.targetUrl)}`, tone: 'neutral' });
  if (Array.isArray(after.tags)) lines.push({ text: `+ tags: ${after.tags.map((tag) => formatDiffValue(tag)).join(', ')}`, tone: 'add' });
  if (after.action === 'delete') lines.push({ text: '+ action: move to local deleted state', tone: 'remove' });
  if (after.action === 'merge_into') lines.push({ text: `+ action: merge into ${formatDiffValue(after.targetTitle ?? after.targetId, 'target bookmark')}`, tone: 'add' });

  if (lines.length === 0) {
    lines.push({ text: `${type}: ${JSON.stringify(after)}`, tone: 'neutral' });
  }

  return lines;
}

function formatDiffValue(value: unknown, fallback = ''): string {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function formatChromeOpAction(op: ChromeSyncOp): string {
  if (op.action === 'update') return '改标题';
  if (op.action === 'move') return '移动文件夹';
  if (op.action === 'create') return '写入 Chrome';
  return '删除书签';
}

function formatChromeOpDetail(op: ChromeSyncOp): string {
  if (op.action === 'update') return `Chrome 标题将改为：${op.title || '未命名'}`;
  if (op.action === 'move') return `Chrome 书签将移动到：${op.folderPath || '书签栏'}`;
  if (op.action === 'create') return `Chrome 会保存到：${op.folderPath || '书签栏'}`;
  return `Chrome 中会删除这条书签：${op.bookmarkUrl || op.chromeId || op.bookmarkId}`;
}
