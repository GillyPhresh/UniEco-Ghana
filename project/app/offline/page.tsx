import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { RefreshButton } from './refresh-button';

export const metadata = {
  title: "You're Offline",
};

export default function OfflinePage() {
  return (
    <>
      <SiteHeader />
      <main className="flex min-h-[60vh] items-center justify-center px-4 py-16">
        <div className="max-w-md text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950/40">
            <WifiOff className="h-10 w-10 text-amber-600 dark:text-amber-400" />
          </div>
          <h1 className="mt-6 font-display text-2xl font-bold text-foreground">
            You&apos;re Offline
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            We can&apos;t reach the internet right now. You can still browse content
            you&apos;ve previously visited. Some features like placing orders or
            making payments require a connection.
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <RefreshButton />
            <Button asChild variant="outline">
              <Link href="/marketplace">Browse cached content</Link>
            </Button>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
