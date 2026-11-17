import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { marketPhotography } from '@/lib/marketplace/photography';

export const metadata = { title: 'Marketplace photo credits', robots: { index: false, follow: true } };

export default function MarketplacePhotoCredits() {
  return <>
    <SiteHeader />
    <main className="container max-w-2xl px-4 py-6 sm:px-6 sm:py-10">
      <Link href="/marketplace" className="inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold text-primary"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Marketplace</Link>
      <h1 className="mt-2 text-2xl font-bold">Photo credits</h1>
      <p className="mt-2 text-sm text-muted-foreground">Category photos are illustrative. Listing photos come from sellers.</p>
      <ul className="mt-5 divide-y divide-border rounded-2xl border border-border bg-card">
        {Object.values(marketPhotography).map(photo => <li key={photo.source} className="p-4 text-sm">
          <a href={photo.source} className="font-semibold text-primary hover:underline">{photo.title}</a>
          <p className="mt-1 text-muted-foreground">{photo.creator} · <a href="https://www.pexels.com/license/" className="underline">Pexels License</a></p>
        </li>)}
      </ul>
      <details className="mt-5 text-xs text-muted-foreground">
        <summary className="cursor-pointer">Earlier artwork</summary>
        <p className="mt-2"><a className="underline" href="https://commons.wikimedia.org/wiki/File:Ghanaian_Wache_(Waakye)_cuisine_food.jpg">Waakye in Ghana</a> by Hiroo Yamagata · <a className="underline" href="https://creativecommons.org/licenses/by-sa/2.0/">CC BY-SA 2.0</a>. Resized, cropped for display, and converted to WebP.</p>
      </details>
    </main>
    <SiteFooter />
  </>;
}
