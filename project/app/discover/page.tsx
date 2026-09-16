'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { BusinessCard } from '@/components/shared/business-card';
import { BusinessCardSkeleton } from '@/components/shared/skeletons';
import { EmptyState } from '@/components/shared/empty-state';
import { SearchBar } from '@/components/shared/search-bar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Filter, X, Search, SlidersHorizontal } from 'lucide-react';
import { ALL_CATEGORIES, CATEGORY_ICONS } from '@/lib/constants/categories';
import type { VendorWithRelations } from '@/lib/types/extended';
import { cn } from '@/lib/utils';

const SORT_OPTIONS = [
  { value: 'rating', label: 'Top rated' },
  { value: 'name', label: 'Name (A-Z)' },
  { value: 'newest', label: 'Newest first' },
];

const REGIONS = [
  'Greater Accra', 'Ashanti', 'Bono', 'Central', 'Eastern', 'Western',
  'Volta', 'Northern', 'Upper East', 'Upper West',
];

export default function DiscoverPage() {
  const searchParams = useSearchParams();
  const initialCategory = searchParams.get('category') || '';
  const initialQuery = searchParams.get('q') || '';

  const [vendors, setVendors] = useState<VendorWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState(initialCategory);
  const [universityFilter, setUniversityFilter] = useState('');
  const [region, setRegion] = useState('');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [minRating, setMinRating] = useState(0);
  const [sortBy, setSortBy] = useState('rating');
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [universities, setUniversities] = useState<{ id: string; name: string; short_name: string }[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    supabase
      .from('universities')
      .select('id, name, short_name')
      .eq('is_enabled', true)
      .order('name')
      .then(({ data }) => setUniversities(data || []));
  }, []);

  useEffect(() => {
    async function loadVendors() {
      setLoading(true);
      let query = supabase
        .from('vendors')
        .select(`*, university:universities(id, name, short_name, slug)`)
        .eq('is_active', true);

      if (category) query = query.eq('business_type', category);
      if (universityFilter) query = query.eq('university_id', universityFilter);
      if (verifiedOnly) query = query.eq('is_verified', true);
      if (searchQuery) {
        query = query.or(`business_name.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`);
      }

      if (sortBy === 'rating') query = query.order('rating_avg', { ascending: false });
      else if (sortBy === 'name') query = query.order('business_name', { ascending: true });
      else query = query.order('created_at', { ascending: false });

      const { data } = await query;
      let result = (data || []) as unknown as VendorWithRelations[];

      if (minRating > 0) {
        result = result.filter((v) => (v.rating_avg || 0) >= minRating);
      }

      setVendors(result);
      setLoading(false);
    }
    loadVendors();
  }, [category, universityFilter, region, verifiedOnly, minRating, sortBy, searchQuery]);

  const activeFilters = useMemo(() => {
    let count = 0;
    if (category) count++;
    if (universityFilter) count++;
    if (verifiedOnly) count++;
    if (minRating > 0) count++;
    return count;
  }, [category, universityFilter, verifiedOnly, minRating]);

  const clearFilters = () => {
    setCategory('');
    setUniversityFilter('');
    setRegion('');
    setVerifiedOnly(false);
    setMinRating(0);
  };

  return (
    <>
      <SiteHeader />
      <main className="container py-8 sm:py-10">
        {/* Page header */}
        <div className="mb-6">
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Discover businesses
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Browse all businesses on UniEco Ghana across every campus.
          </p>
        </div>

        {/* Search and filter bar */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <SearchBar size="md" className="flex-1" />
          <Button
            variant="outline"
            onClick={() => setShowFilters(!showFilters)}
            className="shrink-0"
          >
            <SlidersHorizontal className="mr-2 h-4 w-4" />
            Filters
            {activeFilters > 0 && (
              <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-xs font-bold text-primary-foreground">
                {activeFilters}
              </span>
            )}
          </Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
          {/* Sidebar filters */}
          <aside className={cn('space-y-5', showFilters ? 'block' : 'hidden lg:block')}>
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Filters</h3>
                {activeFilters > 0 && (
                  <button
                    onClick={clearFilters}
                    className="text-xs text-primary hover:underline"
                  >
                    Clear all
                  </button>
                )}
              </div>

              {/* Category filter */}
              <div className="mb-4">
                <label className="mb-2 block text-xs font-medium text-muted-foreground">Category</label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="All categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All categories</SelectItem>
                    {ALL_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {CATEGORY_ICONS[cat]} {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* University filter */}
              <div className="mb-4">
                <label className="mb-2 block text-xs font-medium text-muted-foreground">University</label>
                <Select value={universityFilter} onValueChange={setUniversityFilter}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="All universities" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All universities</SelectItem>
                    {universities.map((uni) => (
                      <SelectItem key={uni.id} value={uni.id}>
                        {uni.short_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Minimum rating */}
              <div className="mb-4">
                <label className="mb-2 block text-xs font-medium text-muted-foreground">Minimum rating</label>
                <div className="flex gap-1.5">
                  {[0, 3, 4, 4.5].map((r) => (
                    <button
                      key={r}
                      onClick={() => setMinRating(r)}
                      className={cn(
                        'flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors',
                        minRating === r
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border text-muted-foreground hover:border-primary/40'
                      )}
                    >
                      {r === 0 ? 'Any' : `${r}+`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Verified only */}
              <label className="flex cursor-pointer items-center justify-between">
                <span className="text-sm text-foreground">Verified only</span>
                <button
                  onClick={() => setVerifiedOnly(!verifiedOnly)}
                  className={cn(
                    'relative h-6 w-11 rounded-full transition-colors',
                    verifiedOnly ? 'bg-primary' : 'bg-muted'
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                      verifiedOnly ? 'translate-x-5' : 'translate-x-0.5'
                    )}
                  />
                </button>
              </label>
            </div>
          </aside>

          {/* Results */}
          <div>
            {/* Sort bar */}
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {loading ? 'Loading...' : `${vendors.length} ${vendors.length === 1 ? 'business' : 'businesses'} found`}
              </p>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Active filter chips */}
            {activeFilters > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {category && (
                  <FilterChip label={category} onRemove={() => setCategory('')} />
                )}
                {universityFilter && (
                  <FilterChip
                    label={universities.find((u) => u.id === universityFilter)?.short_name || ''}
                    onRemove={() => setUniversityFilter('')}
                  />
                )}
                {verifiedOnly && (
                  <FilterChip label="Verified only" onRemove={() => setVerifiedOnly(false)} />
                )}
                {minRating > 0 && (
                  <FilterChip label={`${minRating}+ rating`} onRemove={() => setMinRating(0)} />
                )}
              </div>
            )}

            {/* Grid */}
            {loading ? (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <BusinessCardSkeleton key={i} />
                ))}
              </div>
            ) : vendors.length === 0 ? (
              <EmptyState
                icon={Search}
                title="No businesses found"
                description="Try adjusting your filters or search for something else. New businesses are added all the time."
                action={
                  activeFilters > 0 ? (
                    <Button variant="outline" onClick={clearFilters}>
                      Clear all filters
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {vendors.map((vendor) => (
                  <BusinessCard key={vendor.id} vendor={vendor} />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
      {label}
      <button onClick={onRemove} className="hover:text-primary/70">
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}
