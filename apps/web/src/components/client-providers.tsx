'use client';

import { I18nProvider } from '@/lib/i18n';
import { Nav } from './nav';

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <Nav />
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {children}
      </main>
    </I18nProvider>
  );
}
