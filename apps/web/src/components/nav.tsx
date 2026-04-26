'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n, type Locale } from '@/lib/i18n';

export function Nav() {
  const pathname = usePathname();
  const { t, locale, setLocale } = useI18n();

  const links = [
    { href: '/', label: t.nav.dashboard },
    { href: '/import', label: t.nav.import },
    { href: '/library', label: t.nav.library },
    { href: '/search', label: t.nav.search },
    { href: '/rescue', label: t.nav.rescue },
    { href: '/taxonomy', label: t.nav.taxonomy },
    { href: '/settings', label: t.nav.settings },
    { href: '/mcp', label: t.nav.mcp },
  ];

  return (
    <nav className="border-b border-border bg-card">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          <Link href="/" className="font-bold text-lg tracking-tight">
            SiftMarks
          </Link>
          <div className="flex items-center gap-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                  pathname === link.href
                    ? 'bg-accent text-white'
                    : 'text-muted hover:text-foreground hover:bg-accent-light'
                }`}
              >
                {link.label}
              </Link>
            ))}
            <button
              onClick={() => setLocale(locale === 'zh' ? 'en' : 'zh')}
              className="ml-2 px-2 py-1 rounded border border-border text-xs text-muted hover:text-foreground hover:border-accent transition-colors"
              title={locale === 'zh' ? 'Switch to English' : '切换到中文'}
            >
              {locale === 'zh' ? 'EN' : '中文'}
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
