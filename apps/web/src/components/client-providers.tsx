'use client';

import { AdminShell } from './admin-shell';
import { I18nProvider } from '@/lib/i18n';

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <AdminShell>{children}</AdminShell>
    </I18nProvider>
  );
}
