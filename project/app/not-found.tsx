import Link from 'next/link';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { Button } from '@/components/ui/button';
import { Compass, ArrowRight } from 'lucide-react';

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10">
            <Compass className="h-10 w-10 text-primary" />
          </div>
          <h1 className="mt-6 font-display text-3xl font-bold text-foreground">
            Page not found
          </h1>
          <p className="mt-3 max-w-md text-sm text-muted-foreground">
            The page you are looking for might have been moved, deleted, or never
            existed. Let us help you find what you need.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button asChild>
              <Link href="/">
                Go to homepage
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/discover">Browse businesses</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/events">View events</Link>
            </Button>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
