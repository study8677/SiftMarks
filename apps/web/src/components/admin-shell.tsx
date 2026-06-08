'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';

interface StatsRecord {
  bookmarks: number;
  folders: number;
  tags: number;
  duplicates: number;
  broken: number;
  missingSummaries: number;
  missingTags: number;
}

type ShellIconName =
  | 'archive'
  | 'bell'
  | 'book'
  | 'box'
  | 'chevron'
  | 'clock'
  | 'download'
  | 'folder'
  | 'help'
  | 'home'
  | 'link'
  | 'search'
  | 'settings'
  | 'tag'
  | 'trash';

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [stats, setStats] = useState<StatsRecord | null>(null);
  const [pendingSuggestions, setPendingSuggestions] = useState<number | undefined>(undefined);
  const [search, setSearch] = useState('');
  const rescueCount = pendingSuggestions;

  useEffect(() => {
    let cancelled = false;

    async function loadShellData() {
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
        setStats(null);
        setPendingSuggestions(undefined);
      }
    }

    loadShellData();
    window.addEventListener('focus', loadShellData);
    window.addEventListener('siftmarks:suggestions-changed', loadShellData);

    return () => {
      cancelled = true;
      window.removeEventListener('focus', loadShellData);
      window.removeEventListener('siftmarks:suggestions-changed', loadShellData);
    };
  }, []);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = search.trim();
    if (!query) return;
    router.push(`/search?q=${encodeURIComponent(query)}`);
  }

  return (
    <div className="min-h-screen bg-[#f7f9fc] text-[#172033]">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[204px] border-r border-[#e5eaf3] bg-white/95 lg:flex lg:flex-col">
        <div className="flex h-[62px] items-center gap-3 px-5">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#2267f3] text-white shadow-sm shadow-blue-200">
            <ShellIcon name="book" className="h-5 w-5" />
          </div>
          <div className="text-lg font-bold tracking-tight">SiftMarks</div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          <ShellSectionLabel label="书签管家" />
          <ShellNavItem href="/" icon="home" label="首页" active={pathname === '/'} />
          <ShellNavItem
            href="/rescue"
            icon="archive"
            label="整理建议"
            count={rescueCount}
            active={pathname.startsWith('/rescue')}
          />
          <ShellNavItem href="/library" icon="book" label="我的书签" active={pathname.startsWith('/library') || pathname.startsWith('/bookmarks')} />
          <ShellNavItem href="/search" icon="search" label="智能搜索" active={pathname.startsWith('/search')} />
          <ShellNavItem href="/tags" icon="tag" label="标签" active={pathname.startsWith('/tags')} />

          <ShellSectionLabel label="数据入口" />
          <ShellNavItem href="/import" icon="download" label="导入书签" active={pathname.startsWith('/import')} />
          <ShellNavItem href="/folders" icon="folder" label="文件夹" active={pathname.startsWith('/folders')} />
        </nav>

        <div className="mx-3 mb-4 rounded-lg border border-[#dbe3ef] bg-[#fbfdff] p-3 text-xs text-[#667085]">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-semibold text-[#344054]">管家状态</span>
            <span className="h-2.5 w-2.5 rounded-full bg-[#17b26a]" />
          </div>
          <div>{stats ? `${stats.broken} 条坏链` : '正在读取本地数据'}</div>
          <div className="mt-1">{stats ? `${stats.missingSummaries} 条待摘要` : 'AI 默认不自动改动'}</div>
        </div>

        <div className="space-y-1 border-t border-[#e5eaf3] px-3 py-4">
          <ShellNavItem href="/settings" icon="settings" label="AI 接入中心" compact active={pathname.startsWith('/settings')} />
          <ShellNavItem href="/mcp" icon="link" label="MCP 记忆接口" compact active={pathname.startsWith('/mcp')} />
          <ShellNavItem href="/help" icon="help" label="帮助与反馈" compact active={pathname.startsWith('/help')} />
        </div>
      </aside>

      <div className="min-h-screen lg:pl-[204px]">
        <header className="sticky top-0 z-10 flex h-[62px] items-center justify-between border-b border-[#e5eaf3] bg-white/95 px-4 backdrop-blur md:px-6">
          <form onSubmit={submitSearch} className="flex w-full max-w-[520px] items-center gap-2 rounded-lg border border-[#dfe6f2] bg-white px-3 py-2 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            <ShellIcon name="search" className="h-4 w-4 text-[#344054]" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="不记得标题？搜它是干什么的..."
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#98a2b3]"
            />
            <span className="rounded-md border border-[#d8e0ed] px-1.5 py-0.5 text-[11px] text-[#667085]">⌘ K</span>
          </form>

          <div className="ml-4 flex shrink-0 items-center gap-3">
            <Link href="/import" className="hidden h-9 items-center gap-2 rounded-lg border border-[#dfe6f2] bg-white px-3 text-sm font-medium text-[#172033] shadow-[0_1px_2px_rgba(16,24,40,0.04)] hover:border-[#b9c7dc] sm:flex">
              <ShellIcon name="download" className="h-4 w-4" />
              导入书签
            </Link>
          </div>
        </header>

        <main className="px-4 py-5 md:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}

function ShellSectionLabel({ label }: { label: string }) {
  return (
    <div className="px-3 pb-1 pt-3 text-[11px] font-bold uppercase tracking-[0.08em] text-[#98a2b3] first:pt-0">
      {label}
    </div>
  );
}

function ShellNavItem({
  href,
  icon,
  label,
  active = false,
  compact = false,
  count,
}: {
  href: string;
  icon: ShellIconName;
  label: string;
  active?: boolean;
  compact?: boolean;
  count?: number;
}) {
  return (
    <Link
      href={href}
      className={`flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition ${
        active
          ? 'bg-[#eef4ff] text-[#1463ff]'
          : compact
            ? 'text-[#475467] hover:bg-[#f5f8ff]'
            : 'text-[#344054] hover:bg-[#f5f8ff]'
      }`}
    >
      <ShellIcon name={icon} className="h-4.5 w-4.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined && count > 0 && (
        <span className="rounded-full bg-[#e8f1ff] px-2 py-0.5 text-xs font-semibold text-[#1463ff]">{count}</span>
      )}
    </Link>
  );
}

function ShellIcon({ name, className = '' }: { name: ShellIconName; className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      viewBox="0 0 24 24"
      aria-hidden
    >
      {shellIconPath(name)}
    </svg>
  );
}

function shellIconPath(name: ShellIconName) {
  switch (name) {
    case 'archive':
      return <><path d="M21 8H3" /><path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8" /><path d="M8 4h8l1 4H7l1-4Z" /></>;
    case 'bell':
      return <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" /><path d="M10 21h4" /></>;
    case 'book':
      return <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15Z" /></>;
    case 'box':
      return <><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></>;
    case 'chevron':
      return <path d="m8 10 4 4 4-4" />;
    case 'clock':
      return <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>;
    case 'download':
      return <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></>;
    case 'folder':
      return <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />;
    case 'help':
      return <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a3 3 0 0 1 5 2.2c0 2-2.5 2.2-2.5 4" /><path d="M12 18h.01" /></>;
    case 'home':
      return <><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10" /><path d="M9 20v-6h6v6" /></>;
    case 'link':
      return <><path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" /><path d="M14 11a5 5 0 0 0-7.1 0l-2 2a5 5 0 0 0 7.1 7.1l1.1-1.1" /></>;
    case 'search':
      return <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>;
    case 'settings':
      return <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.8 1.8 0 0 0 .4 2l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.8 1.8 0 0 0-2-.4 1.8 1.8 0 0 0-1 1.6V21a2 2 0 0 1-4 0v-.1a1.8 1.8 0 0 0-1-1.6 1.8 1.8 0 0 0-2 .4l-.1.1a2 2 0 0 1-2.8-2.8l.1-.1a1.8 1.8 0 0 0 .4-2 1.8 1.8 0 0 0-1.6-1H3a2 2 0 0 1 0-4h.1a1.8 1.8 0 0 0 1.6-1 1.8 1.8 0 0 0-.4-2l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1a1.8 1.8 0 0 0 2 .4 1.8 1.8 0 0 0 1-1.6V3a2 2 0 0 1 4 0v.1a1.8 1.8 0 0 0 1 1.6 1.8 1.8 0 0 0 2-.4l.1-.1a2 2 0 0 1 2.8 2.8l-.1.1a1.8 1.8 0 0 0-.4 2 1.8 1.8 0 0 0 1.6 1H21a2 2 0 0 1 0 4h-.1a1.8 1.8 0 0 0-1.5 1Z" /></>;
    case 'tag':
      return <><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z" /><path d="M7 7h.01" /></>;
    case 'trash':
      return <><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M6 6l1 16h10l1-16" /><path d="M10 11v6" /><path d="M14 11v6" /></>;
    default:
      return <circle cx="12" cy="12" r="9" />;
  }
}
