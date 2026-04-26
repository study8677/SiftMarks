'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n';

interface Category {
  name: string;
  description: string;
  examples: string[];
}

interface Taxonomy {
  categories: Category[];
  fallback: string;
  language: 'zh' | 'en' | 'mixed';
  generatedAt: string;
  totalBookmarks: number;
  model: string;
}

interface ApplyResult {
  created: number;
  errors: number;
  skipped: number;
  total: number;
}

export default function TaxonomyPage() {
  const { t } = useI18n();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null);

  // edit mode local state
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Taxonomy | null>(null);

  useEffect(() => {
    fetch('/api/taxonomy')
      .then((r) => r.json())
      .then((data) => setTaxonomy(data.taxonomy))
      .finally(() => setLoading(false));
  }, []);

  const handleGenerate = async () => {
    if (taxonomy && !confirm(t.taxonomy.confirmRegenerate)) return;
    setGenerating(true);
    setError(null);
    setErrorCode(null);
    setApplyResult(null);
    try {
      const res = await fetch('/api/taxonomy/generate', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Generation failed');
        setErrorCode(data.code ?? null);
      } else {
        setTaxonomy(data.taxonomy);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  };

  const handleApply = async () => {
    setApplying(true);
    setError(null);
    setErrorCode(null);
    setApplyResult(null);
    try {
      const res = await fetch('/api/taxonomy/apply', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Apply failed');
        setErrorCode(data.code ?? null);
      } else {
        setApplyResult(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setApplying(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(t.taxonomy.confirmDelete)) return;
    await fetch('/api/taxonomy', { method: 'DELETE' });
    setTaxonomy(null);
    setApplyResult(null);
  };

  const startEdit = () => {
    if (!taxonomy) return;
    setDraft(JSON.parse(JSON.stringify(taxonomy)));
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft(null);
  };

  const saveEdit = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const res = await fetch('/api/taxonomy', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taxonomy: draft }),
      });
      const data = await res.json();
      if (res.ok) {
        setTaxonomy(data.taxonomy);
        setEditing(false);
        setDraft(null);
      } else {
        setError(data.error ?? 'Save failed');
      }
    } finally {
      setSaving(false);
    }
  };

  const updateDraftCategory = (idx: number, patch: Partial<Category>) => {
    if (!draft) return;
    const next = { ...draft, categories: draft.categories.map((c, i) => (i === idx ? { ...c, ...patch } : c)) };
    setDraft(next);
  };

  const removeDraftCategory = (idx: number) => {
    if (!draft) return;
    setDraft({ ...draft, categories: draft.categories.filter((_, i) => i !== idx) });
  };

  const addDraftCategory = () => {
    if (!draft) return;
    setDraft({
      ...draft,
      categories: [...draft.categories, { name: '', description: '', examples: [] }],
    });
  };

  if (loading) return <div className="text-muted animate-pulse">{t.common.loading}</div>;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t.taxonomy.title}</h1>
        <p className="text-muted text-sm mt-1">{t.taxonomy.desc}</p>
      </div>

      {error && (
        <div className="mb-4 p-4 rounded-lg bg-danger-light border border-danger/20">
          <p className="text-sm text-danger">
            {errorCode === 'mock_provider' ? t.taxonomy.mockProviderError : error}
          </p>
          {errorCode === 'mock_provider' && (
            <Link
              href="/settings"
              className="inline-block mt-2 text-sm font-medium text-accent hover:underline"
            >
              {t.taxonomy.goToSettings} →
            </Link>
          )}
        </div>
      )}

      {applyResult && (
        <div className="mb-4 p-4 rounded-lg bg-success-light border border-success/20">
          <p className="font-medium text-sm">
            {t.taxonomy.appliedSummary(applyResult.created, applyResult.total)}
          </p>
          {applyResult.skipped > 0 && (
            <p className="text-xs text-muted mt-1">{t.taxonomy.appliedSkipped(applyResult.skipped)}</p>
          )}
          {applyResult.errors > 0 && (
            <p className="text-xs text-danger mt-1">{t.taxonomy.appliedErrors(applyResult.errors)}</p>
          )}
          {applyResult.created > 0 && (
            <button
              onClick={() => router.push('/rescue')}
              className="mt-3 px-4 py-2 bg-accent text-white rounded text-sm font-medium hover:opacity-90 transition"
            >
              {t.taxonomy.viewSuggestions} →
            </button>
          )}
        </div>
      )}

      {!taxonomy ? (
        <EmptyState
          generating={generating}
          onGenerate={handleGenerate}
          t={t}
        />
      ) : (
        <>
          <TaxonomyHeader
            taxonomy={taxonomy}
            generating={generating}
            applying={applying}
            editing={editing}
            onApply={handleApply}
            onRegenerate={handleGenerate}
            onEdit={startEdit}
            onDelete={handleDelete}
            t={t}
          />

          {editing && draft ? (
            <CategoryEditor
              draft={draft}
              saving={saving}
              onChange={updateDraftCategory}
              onRemove={removeDraftCategory}
              onAdd={addDraftCategory}
              onFallbackChange={(v) => setDraft({ ...draft, fallback: v })}
              onSave={saveEdit}
              onCancel={cancelEdit}
              t={t}
            />
          ) : (
            <CategoryList categories={taxonomy.categories} fallback={taxonomy.fallback} t={t} />
          )}
        </>
      )}
    </div>
  );
}

function EmptyState({
  generating,
  onGenerate,
  t,
}: {
  generating: boolean;
  onGenerate: () => void;
  t: ReturnType<typeof useI18n>['t'];
}) {
  return (
    <div className="border border-border rounded-lg p-12 text-center bg-card">
      <p className="text-muted text-sm mb-6 max-w-md mx-auto">{t.taxonomy.notGeneratedYet}</p>
      <button
        onClick={onGenerate}
        disabled={generating}
        className="px-6 py-3 bg-accent text-white rounded-lg font-medium text-sm hover:opacity-90 transition disabled:opacity-50"
      >
        {generating ? t.taxonomy.generating : t.taxonomy.generate}
      </button>
    </div>
  );
}

function TaxonomyHeader({
  taxonomy,
  generating,
  applying,
  editing,
  onApply,
  onRegenerate,
  onEdit,
  onDelete,
  t,
}: {
  taxonomy: Taxonomy;
  generating: boolean;
  applying: boolean;
  editing: boolean;
  onApply: () => void;
  onRegenerate: () => void;
  onEdit: () => void;
  onDelete: () => void;
  t: ReturnType<typeof useI18n>['t'];
}) {
  const when = new Date(taxonomy.generatedAt).toLocaleString();
  return (
    <div className="mb-4 p-4 rounded-lg border border-border bg-card">
      <p className="text-xs text-muted">
        {t.taxonomy.summary(taxonomy.categories.length, taxonomy.model, when)}
      </p>
      {!editing && (
        <div className="flex flex-wrap gap-2 mt-3">
          <button
            onClick={onApply}
            disabled={applying || generating}
            className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
          >
            {applying ? t.taxonomy.applying : t.taxonomy.apply}
          </button>
          <button
            onClick={onEdit}
            className="px-3 py-2 border border-border rounded-md text-sm hover:bg-accent-light transition"
          >
            {t.taxonomy.edit}
          </button>
          <button
            onClick={onRegenerate}
            disabled={generating || applying}
            className="px-3 py-2 border border-border rounded-md text-sm text-muted hover:text-foreground transition disabled:opacity-50"
          >
            {generating ? t.taxonomy.generating : t.taxonomy.regenerate}
          </button>
          <button
            onClick={onDelete}
            className="ml-auto px-3 py-2 border border-border rounded-md text-sm text-muted hover:text-danger hover:border-danger/40 transition"
          >
            {t.taxonomy.deleteAll}
          </button>
        </div>
      )}
    </div>
  );
}

function CategoryList({
  categories,
  fallback,
  t,
}: {
  categories: Category[];
  fallback: string;
  t: ReturnType<typeof useI18n>['t'];
}) {
  return (
    <div className="space-y-2">
      {categories.map((c, i) => (
        <div key={i} className="p-4 rounded-lg border border-border bg-card">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="font-semibold">{c.name}</h3>
            {c.examples.length > 0 && (
              <p className="text-xs text-muted truncate">
                {t.taxonomy.examples}: {c.examples.join(', ')}
              </p>
            )}
          </div>
          {c.description && <p className="text-sm text-muted mt-1">{c.description}</p>}
        </div>
      ))}
      <div className="p-4 rounded-lg border border-dashed border-border bg-card text-sm text-muted">
        <span className="font-semibold">{t.taxonomy.fallbackLabel}:</span> {fallback}
      </div>
    </div>
  );
}

function CategoryEditor({
  draft,
  saving,
  onChange,
  onRemove,
  onAdd,
  onFallbackChange,
  onSave,
  onCancel,
  t,
}: {
  draft: Taxonomy;
  saving: boolean;
  onChange: (idx: number, patch: Partial<Category>) => void;
  onRemove: (idx: number) => void;
  onAdd: () => void;
  onFallbackChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  t: ReturnType<typeof useI18n>['t'];
}) {
  return (
    <div>
      <div className="space-y-2 mb-4">
        {draft.categories.map((c, i) => (
          <div key={i} className="p-4 rounded-lg border border-border bg-card space-y-2">
            <div className="flex gap-2 items-start">
              <input
                value={c.name}
                onChange={(e) => onChange(i, { name: e.target.value })}
                placeholder={t.taxonomy.categoryName}
                className="flex-1 px-3 py-2 border border-border rounded bg-background font-medium"
              />
              <button
                onClick={() => onRemove(i)}
                className="px-3 py-2 text-sm text-muted hover:text-danger transition"
              >
                {t.taxonomy.remove}
              </button>
            </div>
            <textarea
              value={c.description}
              onChange={(e) => onChange(i, { description: e.target.value })}
              placeholder={t.taxonomy.description}
              rows={2}
              className="w-full px-3 py-2 border border-border rounded bg-background text-sm"
            />
          </div>
        ))}
      </div>

      <button
        onClick={onAdd}
        className="w-full mb-4 px-4 py-2 border border-dashed border-border rounded-md text-sm text-muted hover:text-foreground hover:border-accent transition"
      >
        + {t.taxonomy.addCategory}
      </button>

      <div className="mb-4 p-4 rounded-lg border border-dashed border-border bg-card">
        <label className="block text-sm font-medium mb-1">{t.taxonomy.fallbackLabel}</label>
        <input
          value={draft.fallback}
          onChange={(e) => onFallbackChange(e.target.value)}
          className="w-full px-3 py-2 border border-border rounded bg-background"
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={onSave}
          disabled={saving}
          className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
        >
          {saving ? t.taxonomy.saving : t.taxonomy.save}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 border border-border rounded-md text-sm hover:bg-card transition"
        >
          {t.taxonomy.cancel}
        </button>
      </div>
    </div>
  );
}
