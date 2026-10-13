import Link from 'next/link';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { getCategoryCounts, ALL_CATEGORIES, CATEGORY_ICONS } from '@/lib/data/public-queries';
import { ArrowRight } from 'lucide-react';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Browse Categories',
  description: 'Discover businesses by category on UniEco Ghana — from food and fashion to electronics and education.',
};

export default async function CategoriesPage() {
  const categoryCounts = await getCategoryCounts();
  const activeCategories = ALL_CATEGORIES.filter((c) => (categoryCounts[c] || 0) > 0);
  const upcomingCategories = ALL_CATEGORIES.filter((c) => (categoryCounts[c] || 0) === 0);

  return (
    <>
      <SiteHeader />
      <main className="container py-8 sm:py-10">
        <div className="mb-8">
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Browse by category
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Find exactly what you need — from campus food to phone repairs, fashion to printing.
          </p>
        </div>

        {activeCategories.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {activeCategories.map((category) => (
              <Link
                key={category}
                href={`/discover?category=${encodeURIComponent(category)}`}
                className="group flex items-center gap-4 rounded-xl border border-border bg-card p-5 shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
              >
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/5 text-3xl">
                  {CATEGORY_ICONS[category] || '🏪'}
                </span>
                <div className="flex-1">
                  <h2 className="font-display font-semibold text-foreground group-hover:text-primary transition-colors">
                    {category}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {categoryCounts[category]} {categoryCounts[category] === 1 ? 'business' : 'businesses'}
                  </p>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
              </Link>
            ))}
          </div>
        )}

        {upcomingCategories.length > 0 && (
          <div className="mt-10">
            <h2 className="mb-4 font-display text-lg font-semibold text-foreground">
              More categories coming soon
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {upcomingCategories.map((category) => (
                <div
                  key={category}
                  className="flex items-center gap-4 rounded-xl border border-dashed border-border bg-muted/20 p-5"
                >
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-muted text-3xl opacity-50">
                    {CATEGORY_ICONS[category] || '🏪'}
                  </span>
                  <div>
                    <h3 className="font-display font-semibold text-muted-foreground">
                      {category}
                    </h3>
                    <p className="text-sm text-muted-foreground">No businesses yet</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
