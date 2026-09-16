'use client';

import { AuthProvider } from '@/lib/auth/auth-context';
import { QueryProvider } from '@/lib/query/query-provider';
import { ThemeProvider } from '@/components/providers/theme-provider';

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      <QueryProvider>
        <AuthProvider>{children}</AuthProvider>
      </QueryProvider>
    </ThemeProvider>
  );
}
