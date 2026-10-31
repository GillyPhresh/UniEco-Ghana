'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { ProductCard, ServiceCard, ProductCardSkeleton } from '@/components/marketplace/product-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ALL_CATEGORIES, CATEGORY_ICONS } from '@/lib/constants/categories';
import {
  getTrendingProducts, getFeaturedServices, getDealsAndPromotions,
  getRecentlyAddedProducts, searchProducts,
} from '@/lib/data/marketplace-client';
import type { Product, Service } from '@/lib/types';
import { trackAnalyticsEvent } from '@/lib/data/analytics-client';
import { normalizeSearchTerm } from '@/lib/utils/search';
import {
  Search, TrendingUp, Tag, Clock, Wrench, ArrowRight,
  Sparkles, ShoppingBag, Star,
} from 'lucide-react';

type ProductWithVendor = Product & { vendor?: { business_name: string; business_slug: string; logo_url?: string | null } };
type ServiceWithVendor = Service & { vendor?: { business_name: string; business_slug: string; logo_url?: string | null } };
type MarketplaceLandingData = {
  trending: ProductWithVendor[];
  services: ServiceWithVendor[];
  deals: ProductWithVendor[];
  recent: ProductWithVendor[];
};

export default function MarketplacePage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ProductWithVendor[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState('newest');
  const searchRequestId = useRef(0);

  const {
    data: marketplaceData,
    isPending: loading,
    isError: loadError,
    refetch: reloadMarketplace,
  } = useQuery<MarketplaceLandingData>({
    queryKey: ['marketplace', 'landing'],
    queryFn: async () => {
      const [trendingProducts, featuredServices, promotions, recentProducts] = await Promise.all([
        getTrendingProducts(8),
        getFeaturedServices(6),
        getDealsAndPromotions(4),
        getRecentlyAddedProducts(4),
      ]);
      return {
        trending: trendingProducts as ProductWithVendor[],
        services: featuredServices as ServiceWithVendor[],
        deals: promotions as ProductWithVendor[],
        recent: recentProducts as ProductWithVendor[],
      };
    },
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });

  const trending: ProductWithVendor[] = marketplaceData?.trending ?? [];
  const services: ServiceWithVendor[] = marketplaceData?.services ?? [];
  const deals: ProductWithVendor[] = marketplaceData?.deals ?? [];
  const recent: ProductWithVendor[] = marketplaceData?.recent ?? [];

  const doSearch = useCallback(async () => {
    const requestId = ++searchRequestId.current;
    setSearching(true);
    try {
      const { products, total, error } = await searchProducts({
        query: searchQuery.trim(),
        category: activeCategory || undefined,
        sort: sortBy,
        limit: 12,
      });
      if (requestId === searchRequestId.current && !error && normalizeSearchTerm(searchQuery)) {
        trackAnalyticsEvent({ event_type: 'search', result_count: Math.min(total, 1000) });
      }
      if (requestId === searchRequestId.current) {
        setSearchError(error);
        setSearchResults(products as ProductWithVendor[]);
      }
    } catch {
      if (requestId === searchRequestId.current) {
        setSearchError(true);
        setSearchResults([]);
      }
    } finally {
      if (requestId === searchRequestId.current) setSearching(false);
    }
  }, [searchQuery, activeCategory, sortBy]);

  useEffect(() => {
    if (searchQuery.trim() || activeCategory) {
      const timer = setTimeout(() => { void doSearch(); }, 180);
      return () => clearTimeout(timer);
    } else {
      searchRequestId.current += 1;
      setSearching(false);
      setSearchResults([]);
      setSearchError(false);
    }
  }, [searchQuery, activeCategory, sortBy, doSearch]);

  const showSearch = searchQuery.trim().length > 0 || activeCategory;

  return (
    <>
      <SiteHeader />
      <main className="container max-w-7xl px-4 py-5 sm:px-6 sm:py-8">
        {/* Hero */}
        <div className="mb-6 rounded-2xl border border-primary/10 bg-gradient-to-br from-primary/10 via-primary/5 to-background p-4 sm:mb-8 sm:p-8">
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-6 w-6 text-primary" />
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Marketplace
            </h1>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
            Discover products and services from vendors across campus. From food to fashion, repairs to tutoring — find everything you need.
          </p>

          {/* Search bar */}
          <div className="relative mt-4 max-w-2xl">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9 h-11 bg-background"
              placeholder="Search for products, services, vendors..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Category chips */}
        <div className="mb-8 space-y-3">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              onClick={() => setActiveCategory(null)}
              aria-pressed={!activeCategory}
              className={`inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full border px-4 text-xs font-semibold transition-colors active:scale-[0.98] ${
                !activeCategory ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:border-primary/30'
              }`}
            >
              All
            </button>
            {ALL_CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
              aria-pressed={activeCategory === cat}
              className={`inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full border px-4 text-xs font-semibold transition-colors active:scale-[0.98] ${
                activeCategory === cat ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:border-primary/30'
              }`}
            >
              {CATEGORY_ICONS[cat]} {cat}
            </button>
          ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">Choose a category, then browse matching items.</p>
            <label className="flex shrink-0 items-center gap-2 text-xs font-semibold text-muted-foreground">Sort
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} className="h-10 rounded-lg border border-input bg-card px-2 text-xs font-medium text-foreground outline-none focus:border-primary">
                <option value="newest">Newest</option><option value="price_low">Price: low to high</option><option value="price_high">Price: high to low</option><option value="rating">Recommended</option>
              </select>
            </label>
          </div>
        </div>

        {/* Search results */}
        {showSearch ? (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">
                {searching ? 'Searching...' : `${searchResults.length} ${searchResults.length === 1 ? 'result' : 'results'}`}
              </h2>
              {(searchQuery || activeCategory || sortBy !== 'newest') && (
                <Button variant="ghost" size="sm" onClick={() => { setSearchQuery(''); setActiveCategory(null); setSortBy('newest'); }}>
                  Clear filters
                </Button>
              )}
            </div>
            {searching ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[1, 2, 3, 4, 5, 6, 7, 8].map(i => <ProductCardSkeleton key={i} />)}
              </div>
            ) : searchError ? (
              <Card><CardContent className="py-10 text-center text-sm text-destructive" role="alert">Unable to load marketplace search results. Please try again.</CardContent></Card>
            ) : searchResults.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {searchResults.map(p => <div key={p.id} onClick={() => trackAnalyticsEvent({ event_type: 'search_result_click', subject_type: 'product', subject_id: p.id })}><ProductCard product={p} /></div>)}
              </div>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <Search className="h-10 w-10 text-muted-foreground/40" />
                  <p className="mt-3 text-sm font-medium text-foreground">No products found</p>
                  <p className="mt-1 text-xs text-muted-foreground">Try a different search term or category</p>
                </CardContent>
              </Card>
            )}
          </div>
        ) : loadError ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-3 py-10 text-center">
              <ShoppingBag className="h-10 w-10 text-muted-foreground/50" />
              <div><p className="font-semibold text-foreground">Marketplace could not load</p><p className="mt-1 text-sm text-muted-foreground">Check your connection and try again.</p></div>
              <Button type="button" variant="outline" onClick={() => void reloadMarketplace()}>Try again</Button>
            </CardContent>
          </Card>
        ) : loading ? (
          <div className="space-y-8">
            <div>
              <SkeletonHeader />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[1, 2, 3, 4].map(i => <ProductCardSkeleton key={i} />)}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-10">
            {/* Trending Products */}
            {trending.length > 0 && (
              <Section
                icon={TrendingUp}
                title="Trending Products"
                subtitle="Popular items students are buying right now"
              >
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {trending.map(p => <ProductCard key={p.id} product={p} />)}
                </div>
              </Section>
            )}

            {/* Deals & Promotions */}
            {deals.length > 0 && (
              <Section
                icon={Tag}
                title="Deals & Promotions"
                subtitle="Save with discounted items from campus vendors"
                accent
              >
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {deals.map(p => <ProductCard key={p.id} product={p} />)}
                </div>
              </Section>
            )}

            {/* Featured Services */}
            {services.length > 0 && (
              <Section
                icon={Wrench}
                title="Recommended Services"
                subtitle="Book services from trusted campus vendors"
              >
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {services.map(s => <ServiceCard key={s.id} service={s} />)}
                </div>
              </Section>
            )}

            {/* Recently Added */}
            {recent.length > 0 && (
              <Section
                icon={Clock}
                title="Recently Added"
                subtitle="The latest products from campus vendors"
              >
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {recent.map(p => <ProductCard key={p.id} product={p} />)}
                </div>
              </Section>
            )}

            {/* Empty state */}
            {trending.length === 0 && services.length === 0 && deals.length === 0 && recent.length === 0 && (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-10 text-center sm:py-16">
                  <ShoppingBag className="h-12 w-12 text-muted-foreground/40" />
                  <p className="mt-4 text-lg font-semibold text-foreground">No products available yet</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Vendors are still setting up their shops. Check back soon!
                  </p>
                  <Button asChild className="mt-4" variant="outline">
                    <Link href="/discover">Browse businesses</Link>
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </main>
      <SiteFooter />
    </>
  );
}

function Section({ icon: Icon, title, subtitle, children, accent }: {
  icon: typeof TrendingUp;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${accent ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-foreground">{title}</h2>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>
      </div>
      {children}
    </section>
  );
}

function SkeletonHeader() {
  return (
    <div className="mb-4 flex items-center gap-2">
      <div className="h-8 w-8 animate-pulse rounded-lg bg-muted" />
      <div className="space-y-1">
        <div className="h-4 w-32 animate-pulse rounded bg-muted" />
        <div className="h-3 w-48 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}
