'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { SearchBar } from '@/components/shared/search-bar';
import { EmptyState } from '@/components/shared/empty-state';
import { RatingStars } from '@/components/shared/rating-stars';
import { VerificationBadge } from '@/components/shared/verification-badge';
import { CATEGORY_ICONS } from '@/lib/constants/categories';
import { Search, Store, Package, Calendar, MapPin, ArrowRight } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';

interface SearchResults {
  vendors: any[];
  products: any[];
  events: any[];
}

export default function SearchPage() {
  const searchParams = useSearchParams();
  const query = searchParams.get('q') || '';
  const [results, setResults] = useState<SearchResults>({ vendors: [], products: [], events: [] });
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('all');

  useEffect(() => {
    if (!query.trim()) return;
    setLoading(true);
    Promise.all([
      supabase
        .from('vendors')
        .select(`id, business_name, business_slug, business_type, description, rating_avg, rating_count, is_verified, is_student_business, university:universities(id, name, short_name, slug)`)
        .eq('is_active', true)
        .or(`business_name.ilike.%${query}%,description.ilike.%${query}%,business_type.ilike.%${query}%`)
        .limit(20),
      supabase
        .from('products')
        .select(`id, name, slug, description, price, currency, image_url, business:businesses(id, name, slug, vendor_id)`)
        .eq('is_active', true)
        .or(`name.ilike.%${query}%,description.ilike.%${query}%`)
        .limit(20),
      supabase
        .from('events')
        .select(`id, title, slug, description, start_time, location, university:universities(id, name, short_name, slug)`)
        .eq('is_published', true)
        .or(`title.ilike.%${query}%,description.ilike.%${query}%`)
        .limit(20),
    ]).then(([v, p, e]) => {
      setResults({
        vendors: v.data || [],
        products: p.data || [],
        events: e.data || [],
      });
      setLoading(false);
    });
  }, [query]);

  const totalCount = results.vendors.length + results.products.length + results.events.length;

  return (
    <>
      <SiteHeader />
      <main className="container py-8 sm:py-10">
        <div className="mb-6">
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Search
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {query ? `Results for "${query}"` : 'Search for businesses, products, and events.'}
          </p>
        </div>

        <div className="mb-6">
          <SearchBar size="md" autoFocus />
        </div>

        {!query ? (
          <EmptyState
            icon={Search}
            title="Start searching"
            description="Type in the search bar above to find businesses, products, services, and events across all campuses."
          />
        ) : loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : totalCount === 0 ? (
          <EmptyState
            icon={Search}
            title={`No results for "${query}"`}
            description="Try different keywords, or browse all businesses and events instead."
            action={
              <div className="flex gap-3">
                <Link href="/discover" className="inline-flex items-center text-sm font-medium text-primary hover:underline">
                  Browse businesses
                </Link>
                <Link href="/events" className="inline-flex items-center text-sm font-medium text-primary hover:underline">
                  Browse events
                </Link>
              </div>
            }
          />
        ) : (
          <div className="space-y-6">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="all">All ({totalCount})</TabsTrigger>
                <TabsTrigger value="businesses">Businesses ({results.vendors.length})</TabsTrigger>
                <TabsTrigger value="products">Products ({results.products.length})</TabsTrigger>
                <TabsTrigger value="events">Events ({results.events.length})</TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Businesses */}
            {(activeTab === 'all' || activeTab === 'businesses') && results.vendors.length > 0 && (
              <section>
                <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold text-foreground">
                  <Store className="h-5 w-5 text-primary" />
                  Businesses
                </h2>
                <div className="space-y-3">
                  {results.vendors.map((vendor: any) => (
                    <Link
                      key={vendor.id}
                      href={`/business/${vendor.business_slug}`}
                      className="group flex items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
                    >
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/5 text-2xl">
                        {CATEGORY_ICONS[vendor.business_type] || '🏪'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-foreground group-hover:text-primary transition-colors truncate">
                            {vendor.business_name}
                          </h3>
                          {vendor.is_verified && (
                            <VerificationBadge isVerified={vendor.is_verified} isStudentBusiness={vendor.is_student_business} />
                          )}
                        </div>
                        <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">
                          {vendor.description || vendor.business_type}
                        </p>
                        <RatingStars rating={vendor.rating_avg || 0} count={vendor.rating_count || 0} size={14} className="mt-1" />
                      </div>
                      <ArrowRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Products */}
            {(activeTab === 'all' || activeTab === 'products') && results.products.length > 0 && (
              <section>
                <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold text-foreground">
                  <Package className="h-5 w-5 text-primary" />
                  Products
                </h2>
                <div className="space-y-3">
                  {results.products.map((product: any) => (
                    <Link
                      key={product.id}
                      href={product.business ? `/business/${product.business.slug}` : '/discover'}
                      className="group flex items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
                    >
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/5 text-2xl">
                        📦
                      </span>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-foreground group-hover:text-primary transition-colors truncate">
                          {product.name}
                        </h3>
                        <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">
                          {product.description || 'No description'}
                        </p>
                        {product.business && (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            from {product.business.name}
                          </p>
                        )}
                      </div>
                      <span className="font-semibold text-primary">
                        GH₵{(product.price || 0).toFixed(2)}
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Events */}
            {(activeTab === 'all' || activeTab === 'events') && results.events.length > 0 && (
              <section>
                <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold text-foreground">
                  <Calendar className="h-5 w-5 text-primary" />
                  Events
                </h2>
                <div className="space-y-3">
                  {results.events.map((event: any) => (
                    <Link
                      key={event.id}
                      href={`/events/${event.slug}`}
                      className="group flex items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
                    >
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                        <Calendar className="h-6 w-6" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-foreground group-hover:text-primary transition-colors truncate">
                          {event.title}
                        </h3>
                        <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">
                          {event.description || 'No description'}
                        </p>
                        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                          {event.start_time && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {new Date(event.start_time).toLocaleDateString('en-GH', { month: 'short', day: 'numeric' })}
                            </span>
                          )}
                          {event.location && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              <span className="truncate">{event.location}</span>
                            </span>
                          )}
                        </div>
                      </div>
                      <ArrowRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
