import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';

export const metadata = { title: 'Marketplace photo credits', robots: { index: false, follow: true } };

const categoryPhotos = [
  {
    title: 'Waakye in Ghana', creator: 'Hiroo Yamagata',
    source: 'https://commons.wikimedia.org/wiki/File:Ghanaian_Wache_(Waakye)_cuisine_food.jpg',
    license: 'CC BY-SA 2.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/2.0/',
    changes: 'Resized and converted to WebP; cropped to fit when displayed.',
  },
  { title: 'Folded fabrics', creator: 'Hüsna Nur Ergin', source: 'https://www.pexels.com/photo/stacks-of-various-folded-fabrics-19191099/' },
  { title: 'Laptop and headphones', creator: 'Riekus', source: 'https://www.pexels.com/photo/close-up-shot-of-a-laptop-beside-a-black-headphones-on-a-white-desk-8316281/' },
  { title: 'Makeup brushes', creator: 'cottonbro studio', source: 'https://www.pexels.com/photo/close-up-shot-of-makeup-brushes-on-a-black-surface-6144292/' },
  { title: 'Notebooks and journals', creator: 'MART PRODUCTION', source: 'https://www.pexels.com/photo/notebooks-and-journals-in-stack-7718857/' },
];

export default function MarketplacePhotoCredits() {
  return <>
    <SiteHeader />
    <main className="container max-w-2xl px-4 py-6 sm:px-6 sm:py-10">
      <Link href="/marketplace" className="inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold text-primary"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Marketplace</Link>
      <h1 className="mt-2 text-2xl font-bold">Photo credits</h1>
      <p className="mt-2 text-sm text-muted-foreground">Category photos are illustrative. Listing photos come from sellers.</p>
      <ul className="mt-5 divide-y divide-border rounded-2xl border border-border bg-card">
        {categoryPhotos.map(photo => <li key={photo.source} className="p-4 text-sm">
          <a href={photo.source} className="font-semibold text-primary hover:underline">{photo.title}</a>
          <p className="mt-1 text-muted-foreground">{photo.creator} · <a href={photo.licenseUrl ?? 'https://www.pexels.com/license/'} className="underline">{photo.license ?? 'Pexels License'}</a></p>
          {photo.changes && <p className="mt-1 text-xs text-muted-foreground">{photo.changes}</p>}
        </li>)}
      </ul>
    </main>
    <SiteFooter />
  </>;
}
