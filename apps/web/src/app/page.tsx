'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n';

interface Stats {
  bookmarks: number;
  folders: number;
  tags: number;
  duplicates: number;
  broken: number;
  missingSummaries: number;
  missingTags: number;
}

export default function Dashboard() {
  const { t } = useI18n();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/stats')
      .then((r) => r.json())
      .then(setStats)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-muted animate-pulse">{t.common.loading}</div>;
  }

  if (!stats || stats.bookmarks === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <h1 className="text-3xl font-bold mb-2">{t.dashboard.welcome}</h1>
        <p className="text-muted mb-8 max-w-md">{t.dashboard.welcomeDesc}</p>
        <Link
          href="/import"
          className="px-6 py-3 bg-accent text-white rounded-lg font-medium hover:opacity-90 transition"
        >
          {t.dashboard.importBtn}
        </Link>
      </div>
    );
  }

  const needsRescue = stats.duplicates > 0 || stats.broken > 0 || stats.missingTags > 0;

  const statItems: Array<{ label: string; value: number; variant?: string }> = [
    { label: t.dashboard.stats.bookmarks, value: stats.bookmarks },
    { label: t.dashboard.stats.folders, value: stats.folders },
    { label: t.dashboard.stats.tags, value: stats.tags },
    { label: t.dashboard.stats.duplicates, value: stats.duplicates, variant: stats.duplicates > 0 ? 'warning' : 'default' },
    { label: t.dashboard.stats.broken, value: stats.broken, variant: stats.broken > 0 ? 'danger' : 'default' },
    { label: t.dashboard.stats.missingSummaries, value: stats.missingSummaries },
    { label: t.dashboard.stats.missingTags, value: stats.missingTags },
  ];

  const actions = [
    { href: '/import', title: t.dashboard.actions.import, description: t.dashboard.actions.importDesc },
    { href: '/rescue', title: t.dashboard.actions.rescue, description: t.dashboard.actions.rescueDesc },
    { href: '/search', title: t.dashboard.actions.search, description: t.dashboard.actions.searchDesc },
    { href: '/mcp', title: t.dashboard.actions.mcp, description: t.dashboard.actions.mcpDesc },
  ];

  return (
    <div>
      {needsRescue && (
        <div className="mb-8 p-6 rounded-lg bg-warning-light border border-warning/20">
          <h2 className="text-lg font-semibold mb-1">{t.dashboard.needsRescue}</h2>
          <p className="text-muted text-sm mb-4">{t.dashboard.needsRescueDesc(stats)}</p>
          <Link
            href="/rescue"
            className="inline-block px-4 py-2 bg-accent text-white rounded-md font-medium text-sm hover:opacity-90 transition"
          >
            {t.dashboard.runRescue}
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {statItems.map((item) => (
          <StatCard key={item.label} label={item.label} value={item.value} variant={item.variant} />
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {actions.map((a) => (
          <Link key={a.href} href={a.href} className="block p-4 rounded-lg border border-border bg-card hover:border-accent transition">
            <div className="font-medium mb-1">{a.title}</div>
            <div className="text-sm text-muted">{a.description}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, variant = 'default' }: { label: string; value: number; variant?: string }) {
  const bg = variant === 'warning' ? 'bg-warning-light' : variant === 'danger' ? 'bg-danger-light' : 'bg-card';
  return (
    <div className={`${bg} p-4 rounded-lg border border-border`}>
      <div className="text-2xl font-bold">{value.toLocaleString()}</div>
      <div className="text-sm text-muted">{label}</div>
    </div>
  );
}
