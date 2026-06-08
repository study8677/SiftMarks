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
      <div className="mx-auto grid max-w-5xl gap-6 py-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="rounded-xl border border-[#dfe6f2] bg-white p-7 shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#1463ff]">Local-first AI Bookmark Manager</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-[#101828]">平时帮你保存和找回，定期帮你整理和纠错</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-[#475467]">
            SiftMarks 是本地优先的 AI 书签管家：保存、整理、搜索、纠错、同步浏览器书签。AI 可以理解网页内容并提出摘要、标签和分类建议，但所有改动都要经过你审查。
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/import"
              className="inline-flex h-10 items-center rounded-lg bg-[#1463ff] px-4 text-sm font-semibold text-white shadow-sm shadow-blue-200 hover:bg-[#0f55df]"
            >
              导入书签
            </Link>
            <Link
              href="/search"
              className="inline-flex h-10 items-center rounded-lg border border-[#dfe6f2] bg-white px-4 text-sm font-semibold text-[#344054] hover:border-[#b9c7dc]"
            >
              试试记忆搜索
            </Link>
          </div>
        </section>

        <aside className="rounded-xl border border-[#dfe6f2] bg-[#fbfdff] p-5">
          <h2 className="text-sm font-bold text-[#101828]">MVP 闭环</h2>
          <div className="mt-4 space-y-3">
            {[
              '平时保存：从浏览器或导入文件进入本地库',
              '智能理解：抓取网页内容，生成摘要和标签',
              '日常找回：按关键词、语义、标签和文件夹搜索',
              '定期整理：发现坏链、空标题和分类问题',
              '安全同步：审查后再写回 Chrome',
            ].map((item, index) => (
              <div key={item} className="flex gap-3 text-sm text-[#344054]">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#eef4ff] text-xs font-bold text-[#1463ff]">{index + 1}</span>
                <span className="leading-6">{item}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    );
  }

  const needsRescue = stats.broken > 0 || stats.missingSummaries > 0;

  const statItems: Array<{ label: string; value: number; variant?: string }> = [
    { label: t.dashboard.stats.bookmarks, value: stats.bookmarks },
    { label: t.dashboard.stats.folders, value: stats.folders },
    { label: t.dashboard.stats.tags, value: stats.tags },
    { label: t.dashboard.stats.broken, value: stats.broken, variant: stats.broken > 0 ? 'danger' : 'default' },
    { label: t.dashboard.stats.missingSummaries, value: stats.missingSummaries },
  ];

  const actions = [
    { href: '/import', title: '保存 / 导入', description: '从浏览器、扩展或 bookmarks.html 把书签进入本地库。' },
    { href: '/search', title: '智能搜索', description: '不记得标题时，用网页用途、摘要和内容找回书签。' },
    { href: '/rescue', title: '整理建议', description: '定期处理坏链、空标题、缺摘要和分类建议。' },
    { href: '/tags', title: '标签', description: '标签只辅助搜索，可合并相似标签或修正误标。' },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-[#dfe6f2] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#1463ff]">本地优先的 AI 书签管家</p>
            <h1 className="mt-2 text-[26px] font-bold tracking-tight text-[#101828]">持续管理收藏、整理、搜索、纠错和同步</h1>
          </div>
          <div className="rounded-lg border border-[#dfe6f2] bg-[#fbfdff] px-4 py-3 text-sm">
            <div className="font-semibold text-[#101828]">下一步重点</div>
            <div className="mt-1 text-[#667085]">
              {stats.missingSummaries + stats.broken > 0
                ? '先审查待处理项，再同步回 Chrome。'
                : '保持摘要和 embedding 索引新鲜。'}
            </div>
          </div>
        </div>
      </section>

      {needsRescue && (
        <div className="rounded-xl border border-[#f2d7a8] bg-[#fffbf4] p-5">
          <h2 className="text-lg font-semibold text-[#92400e]">{t.dashboard.needsRescue}</h2>
          <p className="mt-1 text-sm text-[#7c5a2a]">{t.dashboard.needsRescueDesc(stats)}</p>
          <Link
            href="/rescue"
            className="mt-4 inline-flex h-9 items-center rounded-lg bg-[#1463ff] px-3 text-sm font-semibold text-white hover:bg-[#0f55df]"
          >
            进入审查队列
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-7">
        {statItems.map((item) => (
          <StatCard key={item.label} label={item.label} value={item.value} variant={item.variant} />
        ))}
      </div>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {actions.map((a) => (
          <Link key={a.href} href={a.href} className="block rounded-xl border border-[#dfe6f2] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.03)] transition hover:border-[#1463ff]">
            <div className="mb-1 font-semibold text-[#101828]">{a.title}</div>
            <div className="text-sm leading-6 text-[#667085]">{a.description}</div>
          </Link>
        ))}
      </section>
    </div>
  );
}

function StatCard({ label, value, variant = 'default' }: { label: string; value: number; variant?: string }) {
  const bg = variant === 'warning' ? 'bg-[#fffbf4]' : variant === 'danger' ? 'bg-[#fff8f8]' : 'bg-white';
  const border = variant === 'warning' ? 'border-[#f2d7a8]' : variant === 'danger' ? 'border-[#ffd2d2]' : 'border-[#dfe6f2]';
  return (
    <div className={`${bg} ${border} rounded-xl border p-4`}>
      <div className="text-2xl font-bold text-[#101828]">{value.toLocaleString()}</div>
      <div className="mt-1 text-sm text-[#667085]">{label}</div>
    </div>
  );
}
