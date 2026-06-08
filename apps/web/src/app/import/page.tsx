'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n';

interface DetectedProfile {
  name: string;
  path: string;
  bookmarkCount: number;
}

interface ImportResult {
  imported: number;
  folders: number;
  duplicates: number;
  missingTitles: number;
}

interface IndexResult {
  processed: number;
  summaries: number;
  tags: number;
  embeddings: number;
  errors: number;
}

export default function ImportPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [profiles, setProfiles] = useState<DetectedProfile[]>([]);
  const [detecting, setDetecting] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importingProfile, setImportingProfile] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [indexResult, setIndexResult] = useState<IndexResult | null>(null);

  // Auto-detect on mount
  useEffect(() => {
    fetch('/api/detect')
      .then((r) => r.json())
      .then((data) => setProfiles(data.profiles ?? []))
      .finally(() => setDetecting(false));
  }, []);

  const handleAutoImport = async (profile: DetectedProfile) => {
    setImportingProfile(profile.name);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/import-auto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: profile.path }),
      });
      const data = await res.json() as Partial<ImportResult> & { error?: string };
      if (!res.ok) {
        setError(data.error || 'Import failed');
      } else {
        setResult(data as ImportResult);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImportingProfile(null);
    }
  };

  const handleFile = useCallback((f: File) => {
    setFile(f);
    setResult(null);
    setError(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const handleFileImport = async () => {
    if (!file) return;
    setImporting(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/import', { method: 'POST', body: formData });
      const data = await res.json() as Partial<ImportResult> & { error?: string };
      if (!res.ok) {
        setError(data.error || 'Import failed');
      } else {
        setResult(data as ImportResult);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const handleIndexMissing = async () => {
    setIndexing(true);
    setIndexResult(null);
    setError(null);

    try {
      const res = await fetch('/api/index-bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 100, onlyMissing: true, useAI: true }),
      });
      const data = await res.json() as Partial<IndexResult> & { error?: string };
      if (!res.ok) {
        setError(data.error || 'Indexing failed');
      } else {
        setIndexResult(data as IndexResult);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Indexing failed');
    } finally {
      setIndexing(false);
    }
  };

  const browserIcon = (name: string) => {
    if (name.includes('Edge')) return '🌐';
    if (name.includes('Brave')) return '🦁';
    if (name.includes('Arc')) return '🌈';
    return '🔵';
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="rounded-xl border border-[#dfe6f2] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#1463ff]">Safe Import</p>
        <h1 className="mt-2 text-[24px] font-bold tracking-tight text-[#101828]">{t.import.title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-[#475467]">
          {t.import.desc} SiftMarks 会先只读导入所有可解析书签并重建本地关键词索引；网页抓取、AI 摘要、标签和坏链检测在导入后单独执行，避免少数超时链接拖垮 2k 级别导入。
        </p>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        {[
          ['只读导入', '不直接修改 Chrome 书签'],
          ['已存在跳过', '相同链接不会二次入库'],
          ['URL 规范化', '去追踪参数并识别已保存链接'],
          ['导入后分析', '摘要、最多 3 个标签和索引独立执行'],
        ].map(([title, desc]) => (
          <div key={title} className="rounded-xl border border-[#dfe6f2] bg-white p-4">
            <div className="text-sm font-bold text-[#101828]">{title}</div>
            <div className="mt-1 text-xs leading-5 text-[#667085]">{desc}</div>
          </div>
        ))}
      </section>

      {/* Auto-detect section */}
      {detecting ? (
        <div className="p-6 rounded-lg border border-border bg-card mb-6">
          <div className="text-muted animate-pulse">{t.common.loading}</div>
        </div>
      ) : profiles.length > 0 ? (
        <div className="mb-6">
          <div className="space-y-3">
            {profiles.map((profile) => (
              <button
                key={profile.path}
                onClick={() => handleAutoImport(profile)}
                disabled={importingProfile !== null}
                className="w-full flex items-center gap-4 p-4 rounded-lg border-2 border-accent bg-card hover:bg-accent-light transition text-left disabled:opacity-50"
              >
                <span className="text-3xl">{browserIcon(profile.name)}</span>
                <div className="flex-1">
                  <div className="font-semibold text-base">
                    {importingProfile === profile.name
                      ? t.import.importing
                      : `${profile.name}`}
                  </div>
                  <div className="text-sm text-muted">
                    {profile.bookmarkCount.toLocaleString()} {t.import.detected}
                  </div>
                </div>
                <div className="text-accent font-medium text-sm">
                  只读入库 →
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Result */}
      {result && (
        <div className="rounded-xl border border-[#b7ebc6] bg-[#f0fff4] p-6">
          <h3 className="font-semibold text-[#157347]">{t.import.complete}</h3>
          <p className="mt-1 text-sm text-[#344054]">新书签已经进入本地库；已存在链接会直接跳过，不会二次导入。下一步可以异步分析内容，失败项会留在待审查队列里。</p>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
            <ResultMetric label={t.import.imported} value={result.imported} />
            <ResultMetric label={t.import.folders} value={result.folders} />
            <ResultMetric label={t.import.duplicates} value={result.duplicates} />
            <ResultMetric label={t.import.missingTitles} value={result.missingTitles} />
          </div>
          {indexResult && (
            <div className="mt-4 rounded-lg border border-[#dfe6f2] bg-white/80 px-4 py-3 text-sm text-[#344054]">
              已处理 {indexResult.processed} 条；生成摘要 {indexResult.summaries} 个、标签 {indexResult.tags} 个、embedding {indexResult.embeddings} 个；错误 {indexResult.errors} 个。
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={handleIndexMissing}
              disabled={indexing}
              className="px-4 py-2 bg-[#1463ff] text-white rounded-md text-sm font-semibold hover:opacity-90 transition disabled:opacity-50"
            >
              {indexing ? '分析中...' : '分析摘要和搜索索引'}
            </button>
            <button
              onClick={() => router.push('/library')}
              className="px-4 py-2 border border-[#dfe6f2] bg-white rounded-md text-sm font-semibold text-[#344054] hover:border-[#b9c7dc] transition"
            >
              {t.import.viewLibrary}
            </button>
            <button
              onClick={() => router.push('/rescue')}
              className="px-4 py-2 border border-[#dfe6f2] bg-white rounded-md text-sm font-semibold text-[#344054] hover:border-[#b9c7dc] transition"
            >
              去审查建议
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-6 p-3 rounded-md bg-danger-light text-danger text-sm">{error}</div>
      )}

      {/* Manual upload fallback */}
      {!result && (
        <div className="rounded-xl border border-[#dfe6f2] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
          {!showManual && profiles.length > 0 ? (
            <button
              onClick={() => setShowManual(true)}
              className="text-sm text-muted hover:text-foreground"
            >
              {t.import.manualUpload}
            </button>
          ) : (
            <>
              <div
                className={`border-2 border-dashed rounded-lg p-10 text-center transition ${
                  dragOver ? 'border-accent bg-accent-light' : 'border-border'
                }`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
              >
                {file ? (
                  <div>
                    <p className="font-medium mb-1">{file.name}</p>
                    <p className="text-sm text-muted">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-muted mb-2">{t.import.dragDrop}</p>
                    <label className="inline-block px-4 py-2 bg-accent text-white rounded-md cursor-pointer text-sm hover:opacity-90 transition">
                      {t.import.chooseFile}
                      <input
                        type="file"
                        accept=".html,.htm"
                        className="hidden"
                        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                      />
                    </label>
                  </div>
                )}
              </div>
              {file && (
                <button
                  onClick={handleFileImport}
                  disabled={importing}
                  className="mt-4 w-full px-4 py-2 bg-accent text-white rounded-md font-medium hover:opacity-90 transition disabled:opacity-50"
                >
                  {importing ? t.import.importing : t.import.importBtn}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ResultMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-[#dfe6f2] bg-white/85 p-3">
      <div className="text-xl font-bold text-[#101828]">{value.toLocaleString()}</div>
      <div className="mt-1 text-xs text-[#667085]">{label}</div>
    </div>
  );
}
