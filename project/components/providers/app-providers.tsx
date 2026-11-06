'use client';

import { AuthProvider } from '@/lib/auth/auth-context';
import { QueryProvider } from '@/lib/query/query-provider';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { Toaster } from '@/components/ui/sonner';

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      storageKey="unieco-theme-mode"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <QueryProvider>
        <AuthProvider>
          {children}
          <Toaster position="top-center" closeButton />
        </AuthProvider>
      </QueryProvider>
    </ThemeProvider>
  );
}
