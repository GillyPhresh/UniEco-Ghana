'use client';

import { AuthProvider } from '@/lib/auth/auth-context';
import { QueryProvider } from '@/lib/query/query-provider';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { Toaster } from '@/components/ui/sonner';

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      forcedTheme="light"
      enableSystem={false}
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
