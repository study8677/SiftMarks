'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';

interface Stats {
  bookmarks: number;
  folders: number;
  tags: number;
  duplicates: number;
  broken: number;
  missingSummaries: number;
  missingTags: number;
}

type HomeIconName =
  | 'bookmark'
  | 'check'
  | 'chevron'
  | 'cloud'
  | 'download'
  | 'folder'
  | 'list'
  | 'search'
  | 'shield'
  | 'sparkles'
  | 'tag';

const emptyStats: Stats = {
  bookmarks: 0,
  folders: 0,
  tags: 0,
  duplicates: 0,
  broken: 0,
  missingSummaries: 0,
  missingTags: 0,
};

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [pendingSuggestions, setPendingSuggestions] = useState(0);
  const [loading, setLoading] = useState(true);
  const displayStats = stats ?? emptyStats;

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      setLoading(true);
      try {
        const [statsRes, suggestionsRes] = await Promise.all([
          fetch('/api/stats'),
          fetch('/api/suggestions?status=pending&limit=1'),
        ]);
        const [statsData, suggestionsData] = await Promise.all([
          statsRes.json(),
          suggestionsRes.json(),
        ]);
        if (cancelled) return;
        setStats(statsData);
        setPendingSuggestions(Number(suggestionsData.total ?? 0));
      } catch {
        if (cancelled) return;
        setStats(emptyStats);
        setPendingSuggestions(0);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadDashboard();
    window.addEventListener('focus', loadDashboard);
    window.addEventListener('siftmarks:suggestions-changed', loadDashboard);

    return () => {
      cancelled = true;
      window.removeEventListener('focus', loadDashboard);
      window.removeEventListener('siftmarks:suggestions-changed', loadDashboard);
    };
  }, []);

  const todaySuggestions = useMemo(() => {
    const brokenText = displayStats.broken > 0
      ? `发现 ${displayStats.broken} 个无效链接，建议修复`
      : '未发现无效链接';
    const tagText = displayStats.missingTags > 0
      ? `为 ${displayStats.missingTags} 个未标记书签补充标签`
      : '标签状态已整理';
    const backupText = pendingSuggestions > 0
      ? `还有 ${pendingSuggestions} 条建议待处理`
      : '本地数据已保存';

    return [
      { href: displayStats.broken > 0 ? '/broken' : '/rescue', text: brokenText, active: displayStats.broken > 0 },
      { href: '/tags', text: tagText, active: displayStats.missingTags > 0 },
      { href: pendingSuggestions > 0 ? '/rescue' : '/library', text: backupText, active: pendingSuggestions > 0 },
    ];
  }, [displayStats.broken, displayStats.missingTags, pendingSuggestions]);

  return (
    <main className="mx-auto max-w-[1580px] px-4 py-4 md:px-6 lg:px-7">
      <section className="mb-5 grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(380px,1fr)]">
        <div className="rounded-3xl border border-[#dfe6f2] bg-white px-7 py-10 shadow-[0_10px_28px_rgba(16,24,40,0.04)] md:px-10 lg:py-11">
          <h1 className="max-w-[760px] text-[38px] font-bold leading-tight tracking-tight text-[#101828] md:text-[48px] lg:text-[54px]">
            持续管理收藏，简单又高效
          </h1>
          <p className="mt-5 max-w-[760px] text-lg leading-8 text-[#667085]">
            本地优先的 AI 书签管家，帮助你整理、搜索、修复并同步重要链接。
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href="/rescue"
              className="inline-flex h-12 items-center justify-center rounded-2xl bg-[#1463ff] px-7 text-base font-bold text-white shadow-[0_10px_22px_rgba(20,99,255,0.2)] transition hover:bg-[#0f57e6]"
            >
              开始整理
            </Link>
            <Link
              href="/help"
              className="inline-flex h-12 items-center justify-center rounded-2xl border border-[#dfe6f2] bg-white px-7 text-base font-bold text-[#475467] transition hover:border-[#b9c7da] hover:bg-[#f8fafc]"
            >
              了解功能
            </Link>
          </div>
        </div>

        <aside className="rounded-3xl border border-[#dfe6f2] bg-white p-6 shadow-[0_10px_28px_rgba(16,24,40,0.04)]">
          <div className="mb-5 flex items-center gap-3">
            <HomeIcon name="sparkles" className="h-5 w-5 text-[#1463ff]" />
            <h2 className="text-lg font-bold text-[#101828]">今日建议</h2>
          </div>
          <div className="overflow-hidden rounded-2xl border border-[#dfe6f2]">
            {todaySuggestions.map((item, index) => (
              <Link
                key={item.text}
                href={item.href}
                className="flex min-h-[58px] items-center gap-3 border-b border-[#eef2f7] px-5 text-base font-semibold text-[#667085] transition last:border-b-0 hover:bg-[#f8fbff] hover:text-[#101828]"
              >
                <HomeIcon name="check" className={`h-5 w-5 shrink-0 ${item.active || index === 0 ? 'text-[#3b82f6]' : 'text-[#b8c6dc]'}`} />
                <span className="min-w-0 flex-1">{item.text}</span>
                <HomeIcon name="chevron" className="h-5 w-5 shrink-0 text-[#667085]" />
              </Link>
            ))}
          </div>
        </aside>
      </section>

      <section className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatTile icon="bookmark" tone="blue" value={displayStats.bookmarks} label="书签" loading={loading} />
        <StatTile icon="folder" tone="green" value={displayStats.folders} label="文件夹" loading={loading} />
        <StatTile icon="tag" tone="purple" value={displayStats.tags} label="标签" loading={loading} />
        <StatTile icon="list" tone="orange" value={pendingSuggestions} label="待整理" loading={loading} />
      </section>

      <section className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ActionTile
          href="/import"
          icon="download"
          tone="blue"
          title="保存 / 导入"
          description="从浏览器、扩展或书签文件快速保存到本地。"
          cta="立即保存"
        />
        <ActionTile
          href="/search"
          icon="search"
          tone="green"
          title="智能搜索"
          description="用自然语言或标签快速找到任何链接。"
          cta="开始搜索"
        />
        <ActionTile
          href="/rescue"
          icon="sparkles"
          tone="purple"
          title="整理建议"
          description="AI 帮你发现重复、无效或未分类内容并给出建议。"
          cta="查看建议"
        />
        <ActionTile
          href="/rescue"
          icon="cloud"
          tone="blue"
          title="同步计划"
          description="接受建议后，预览待写回 Chrome 的改动。"
          cta="查看计划"
        />
      </section>

      <Link
        href="/settings"
        className="flex flex-col gap-4 rounded-3xl border border-[#dfe6f2] bg-white px-6 py-4 shadow-[0_10px_24px_rgba(16,24,40,0.04)] transition hover:border-[#b9c7da] md:flex-row md:items-center md:justify-between"
      >
        <div className="flex min-w-0 items-center gap-5">
          <HomeIcon name="shield" className="h-8 w-8 shrink-0 text-[#101828]" />
          <div>
            <div className="text-base font-bold text-[#101828]">所有数据保存在本地</div>
            <div className="mt-1 text-sm font-semibold text-[#98a2b3]">不上传、不共享，你的数据只属于你。</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-5 text-sm font-semibold text-[#98a2b3]">
          <span className="inline-flex items-center gap-2 text-[#344054]">
            <span className="h-3 w-3 rounded-full bg-[#22c55e]" />
            系统状态：正常
          </span>
          <span className="hidden h-8 w-px bg-[#e5eaf3] md:inline" />
          <span>最后检查：今天 {formatTime(new Date())}</span>
          <HomeIcon name="chevron" className="h-5 w-5 text-[#667085]" />
        </div>
      </Link>
    </main>
  );
}

function StatTile({
  icon,
  tone,
  value,
  label,
  loading,
}: {
  icon: HomeIconName;
  tone: ToneName;
  value: number;
  label: string;
  loading: boolean;
}) {
  return (
    <div className="flex min-h-[112px] items-center gap-5 rounded-3xl border border-[#dfe6f2] bg-white px-6 shadow-[0_8px_22px_rgba(16,24,40,0.04)]">
      <IconBadge icon={icon} tone={tone} />
      <div>
        <div className="text-[30px] font-bold leading-none tracking-tight text-[#101828]">
          {loading ? '...' : value.toLocaleString()}
        </div>
        <div className="mt-2 text-base font-semibold text-[#667085]">{label}</div>
      </div>
    </div>
  );
}

function ActionTile({
  href,
  icon,
  tone,
  title,
  description,
  cta,
}: {
  href: string;
  icon: HomeIconName;
  tone: ToneName;
  title: string;
  description: string;
  cta: string;
}) {
  return (
    <Link
      href={href}
      className="block min-h-[168px] rounded-3xl border border-[#dfe6f2] bg-white px-6 py-5 shadow-[0_8px_22px_rgba(16,24,40,0.04)] transition hover:-translate-y-0.5 hover:border-[#b9d3ff] hover:shadow-[0_14px_32px_rgba(16,24,40,0.07)]"
    >
      <div className="flex items-start gap-5">
        <IconBadge icon={icon} tone={tone} />
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-[#101828]">{title}</h3>
          <p className="mt-2 text-sm font-semibold leading-6 text-[#667085]">{description}</p>
          <div className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-[#1463ff]">
            {cta}
            <span aria-hidden>→</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

type ToneName = 'blue' | 'green' | 'orange' | 'purple';

function IconBadge({ icon, tone }: { icon: HomeIconName; tone: ToneName }) {
  const classes: Record<ToneName, string> = {
    blue: 'bg-[#eef6ff] text-[#1463ff]',
    green: 'bg-[#ecfdf3] text-[#16a34a]',
    orange: 'bg-[#fff7e8] text-[#f97316]',
    purple: 'bg-[#f3edff] text-[#7c3aed]',
  };

  return (
    <span className={`grid h-16 w-16 shrink-0 place-items-center rounded-3xl ${classes[tone]}`}>
      <HomeIcon name={icon} className="h-7 w-7" />
    </span>
  );
}

function HomeIcon({ name, className = '' }: { name: HomeIconName; className?: string }) {
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
      {homeIconPath(name)}
    </svg>
  );
}

function homeIconPath(name: HomeIconName): ReactNode {
  switch (name) {
    case 'bookmark':
      return <path d="M6 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18l-6-4-6 4V4Z" />;
    case 'check':
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="m8.5 12 2.5 2.5L16 9" />
        </>
      );
    case 'chevron':
      return <path d="m9 18 6-6-6-6" />;
    case 'cloud':
      return (
        <>
          <path d="M17.5 19H8a5 5 0 1 1 .9-9.9A6.5 6.5 0 0 1 21 12.5 3.5 3.5 0 0 1 17.5 19Z" />
          <path d="m9 15 3-3 3 3" />
          <path d="M12 12v6" />
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
    case 'folder':
      return <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />;
    case 'list':
      return (
        <>
          <path d="M8 6h13" />
          <path d="M8 12h13" />
          <path d="M8 18h13" />
          <path d="M3 6h.01" />
          <path d="M3 12h.01" />
          <path d="M3 18h.01" />
        </>
      );
    case 'search':
      return (
        <>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </>
      );
    case 'shield':
      return (
        <>
          <path d="M12 3 5 6v5c0 5 3 8.5 7 10 4-1.5 7-5 7-10V6l-7-3Z" />
          <path d="m9 12 2 2 4-5" />
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
    case 'tag':
      return (
        <>
          <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z" />
          <path d="M7 7h.01" />
        </>
      );
  }
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
