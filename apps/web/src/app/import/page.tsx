'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n';

interface DetectedProfile {
  name: string;
  path: string;
  bookmarkCount: number;
}

export default function ImportPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [profiles, setProfiles] = useState<DetectedProfile[]>([]);
  const [detecting, setDetecting] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importingProfile, setImportingProfile] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showManual, setShowManual] = useState(false);

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
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Import failed');
      } else {
        setResult(data);
      }
    } catch (err: any) {
      setError(err.message);
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
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Import failed');
      } else {
        setResult(data);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  };

  const browserIcon = (name: string) => {
    if (name.includes('Edge')) return '🌐';
    if (name.includes('Brave')) return '🦁';
    if (name.includes('Arc')) return '🌈';
    return '🔵';
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">{t.import.title}</h1>
      <p className="text-muted mb-6">{t.import.desc}</p>

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
                  {t.import.oneClick}
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Result */}
      {result && (
        <div className="mb-6 p-6 rounded-lg bg-success-light border border-success/20">
          <h3 className="font-semibold mb-3">{t.import.complete}</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>{t.import.imported}: <span className="font-medium">{result.imported}</span></div>
            <div>{t.import.folders}: <span className="font-medium">{result.folders}</span></div>
            <div>{t.import.duplicates}: <span className="font-medium">{result.duplicates}</span></div>
            <div>{t.import.missingTitles}: <span className="font-medium">{result.missingTitles}</span></div>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => router.push('/library')}
              className="px-4 py-2 bg-accent text-white rounded-md text-sm hover:opacity-90 transition"
            >
              {t.import.viewLibrary}
            </button>
            <button
              onClick={() => router.push('/rescue')}
              className="px-4 py-2 border border-border rounded-md text-sm hover:bg-card transition"
            >
              {t.import.runRescue}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-6 p-3 rounded-md bg-danger-light text-danger text-sm">{error}</div>
      )}

      {/* Manual upload fallback */}
      {!result && (
        <div className="mt-2">
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
