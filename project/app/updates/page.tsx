import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { CampusUpdates } from '@/components/feed/campus-updates';

export const metadata = {
  title: 'Campus Updates | UniEco Ghana',
  description: 'University news, events, opportunities, research and notices from trusted official sources.',
};

export default function UpdatesPage() {
  return <>
    <SiteHeader />
    <main className="min-h-[65vh] bg-muted/25">
      <div className="container py-6 sm:py-10">
        <div className="mb-6 max-w-3xl sm:mb-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Campus network</p>
          <h1 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-4xl">Campus updates</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">News, events and opportunities from Ghanaian universities. Every post links back to its original source.</p>
        </div>
        <CampusUpdates />
      </div>
    </main>
    <SiteFooter />
  </>;
}
