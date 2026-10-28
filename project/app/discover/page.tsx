'use client';

import { Suspense, useState, useEffect, useMemo } from 'react';
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
import { Filter, X, Search, SlidersHorizontal, LocateFixed, Loader2 } from 'lucide-react';
import { ALL_CATEGORIES, CATEGORY_ICONS } from '@/lib/constants/categories';
import type { VendorWithRelations } from '@/lib/types/extended';
import { cn } from '@/lib/utils';
import { normalizeSearchTerm } from '@/lib/utils/search';

const SORT_OPTIONS = [
  { value: 'rating', label: 'Top rated' },
  { value: 'name', label: 'Name (A-Z)' },
  { value: 'newest', label: 'Newest first' },
  { value: 'nearby', label: 'Nearest to me' },
];

const REGIONS = [
  'Greater Accra', 'Ashanti', 'Bono', 'Central', 'Eastern', 'Western',
  'Volta', 'Northern', 'Upper East', 'Upper West',
];

// Radix Select reserves the empty string for clearing a selection. Use an
// explicit UI value for the "all" option, then map it back to an empty filter.
const ALL_FILTER_VALUE = '__all__';

export default function DiscoverPage() {
  return <Suspense fallback={<main className="container py-8">Loading businesses…</main>}><DiscoverContent /></Suspense>;
}

function DiscoverContent() {
  const searchParams = useSearchParams();
  const initialCategory = searchParams.get('category') || '';
  const initialQuery = searchParams.get('q') || '';

  const [vendors, setVendors] = useState<VendorWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState(initialCategory);
  const [universityFilter, setUniversityFilter] = useState('');
  const [region, setRegion] = useState('');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [deliveryOnly, setDeliveryOnly] = useState(false);
  const [studentOnly, setStudentOnly] = useState(false);
  const [minRating, setMinRating] = useState(0);
  const [sortBy, setSortBy] = useState('rating');
  const [nearbyLocation, setNearbyLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState('');
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
    let cancelled = false;
    async function loadVendors() {
      setLoading(true);
      let query = supabase
        .from('vendors')
        .select(`*, university:universities(id, name, short_name, slug, region)`)
        .eq('is_active', true);

      if (category) query = query.eq('business_type', category);
      if (universityFilter) query = query.eq('university_id', universityFilter);
      if (verifiedOnly) query = query.eq('is_verified', true);
      if (deliveryOnly) query = query.eq('delivery_available', true);
      if (studentOnly) query = query.eq('is_student_business', true);
      const safeSearchQuery = normalizeSearchTerm(searchQuery);
      if (safeSearchQuery) {
        query = query.or(`business_name.ilike.%${safeSearchQuery}%,description.ilike.%${safeSearchQuery}%`);
      }

      if (sortBy === 'rating' || sortBy === 'nearby') query = query.order('rating_avg', { ascending: false });
      else if (sortBy === 'name') query = query.order('business_name', { ascending: true });
      else query = query.order('created_at', { ascending: false });

      const { data } = await query;
      let result = (data || []) as unknown as VendorWithRelations[];

      if (region) {
        result = result.filter((vendor) => (vendor.university as { region?: string } | null)?.region === region);
      }

      if (minRating > 0) {
        result = result.filter((v) => (v.rating_avg || 0) >= minRating);
      }

      if (sortBy === 'nearby' && nearbyLocation) {
        const distance = (vendor: VendorWithRelations) => {
          if (vendor.gps_latitude == null || vendor.gps_longitude == null) return Number.POSITIVE_INFINITY;
          const latDelta = (vendor.gps_latitude - nearbyLocation.latitude) * Math.PI / 180;
          const lonDelta = (vendor.gps_longitude - nearbyLocation.longitude) * Math.PI / 180;
          const latOne = nearbyLocation.latitude * Math.PI / 180;
          const latTwo = vendor.gps_latitude * Math.PI / 180;
          const value = Math.sin(latDelta / 2) ** 2 + Math.sin(lonDelta / 2) ** 2 * Math.cos(latOne) * Math.cos(latTwo);
          return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
        };
        result.sort((left, right) => distance(left) - distance(right));
      }

      if (!cancelled) {
        setVendors(result);
        setLoading(false);
      }
    }
    const timer = window.setTimeout(() => { void loadVendors(); }, searchQuery.trim() ? 220 : 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [category, universityFilter, region, verifiedOnly, deliveryOnly, studentOnly, minRating, sortBy, searchQuery, nearbyLocation]);

  const activeFilters = useMemo(() => {
    let count = 0;
    if (category) count++;
    if (universityFilter) count++;
    if (region) count++;
    if (verifiedOnly) count++;
    if (deliveryOnly) count++;
    if (studentOnly) count++;
    if (minRating > 0) count++;
    return count;
  }, [category, universityFilter, region, verifiedOnly, deliveryOnly, studentOnly, minRating]);

  const clearFilters = () => {
    setCategory('');
    setUniversityFilter('');
    setRegion('');
    setVerifiedOnly(false);
    setDeliveryOnly(false);
    setStudentOnly(false);
    setMinRating(0);
    setSortBy('rating');
  };

  const requestNearby = () => {
    if (!navigator.geolocation) {
      setLocationMessage('Location is not available on this device.');
      return;
    }
    setLocating(true);
    setLocationMessage('Finding businesses near you…');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setNearbyLocation({ latitude: coords.latitude, longitude: coords.longitude });
        setSortBy('nearby');
        setLocationMessage('Nearest businesses are now shown first.');
        setLocating(false);
      },
      () => {
        setLocationMessage('Location permission was not granted. You can still browse by campus and region.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
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
                <Select
                  value={category}
                  onValueChange={(value) => setCategory(value === ALL_FILTER_VALUE ? '' : value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="All categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_FILTER_VALUE}>All categories</SelectItem>
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
                <Select
                  value={universityFilter}
                  onValueChange={(value) => setUniversityFilter(value === ALL_FILTER_VALUE ? '' : value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="All universities" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_FILTER_VALUE}>All universities</SelectItem>
                    {universities.map((uni) => (
                      <SelectItem key={uni.id} value={uni.id}>
                        {uni.short_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:block">
                <button type="button" onClick={requestNearby} disabled={locating} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-primary/30 bg-primary/5 px-3 text-xs font-bold text-primary transition hover:bg-primary/10 disabled:cursor-wait disabled:opacity-70">
                  {locating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LocateFixed className="mr-2 h-4 w-4" />}
                  {locating ? 'Finding you…' : 'Near me'}
                </button>
                {locationMessage && <p className="mt-2 text-xs leading-5 text-muted-foreground" role="status">{locationMessage}</p>}
              </div>

              {/* Minimum rating */}
              {/* Region filter */}
              <div className="mb-4">
                <label className="mb-2 block text-xs font-medium text-muted-foreground">Region</label>
                <Select
                  value={region || ALL_FILTER_VALUE}
                  onValueChange={(value) => setRegion(value === ALL_FILTER_VALUE ? '' : value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="All regions" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_FILTER_VALUE}>All regions</SelectItem>
                    {REGIONS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="mb-4 space-y-3 border-t border-border pt-4">
                <label className="flex cursor-pointer items-center justify-between gap-3">
                  <span className="text-sm text-foreground">Delivery available</span>
                  <input type="checkbox" checked={deliveryOnly} onChange={(event) => setDeliveryOnly(event.target.checked)} className="h-4 w-4 accent-primary" />
                </label>
                <label className="flex cursor-pointer items-center justify-between gap-3">
                  <span className="text-sm text-foreground">Student businesses</span>
                  <input type="checkbox" checked={studentOnly} onChange={(event) => setStudentOnly(event.target.checked)} className="h-4 w-4 accent-primary" />
                </label>
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
                {region && <FilterChip label={region} onRemove={() => setRegion('')} />}
                {verifiedOnly && (
                  <FilterChip label="Verified only" onRemove={() => setVerifiedOnly(false)} />
                )}
                {deliveryOnly && <FilterChip label="Delivery available" onRemove={() => setDeliveryOnly(false)} />}
                {studentOnly && <FilterChip label="Student businesses" onRemove={() => setStudentOnly(false)} />}
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
