'use client';

import { useEffect, useRef, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  ArrowDown, ArrowRight, Boxes, Heart, LocateFixed, MapPin, Package, Search,
  ShoppingBag, SlidersHorizontal, Store, Truck, Wrench, X,
} from 'lucide-react';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { CatalogPhoto } from '@/components/marketplace/catalog-photo';
import { ProductCard, ProductCardSkeleton, ServiceCard } from '@/components/marketplace/product-card';
import { ShopCard } from '@/components/marketplace/shop-card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth/auth-context';
import { ALL_CATEGORIES } from '@/lib/constants/categories';
import { searchProducts } from '@/lib/data/marketplace-client';
import {
  getShopCampuses, getShopCartCount, searchMarketplaceServices, searchMarketplaceShops, shopCartCountKey,
} from '@/lib/data/shop-catalog-client';
import { trackAnalyticsEvent } from '@/lib/data/analytics-client';
import { getGoogleMapsSearchUrl, isValidCoordinate } from '@/lib/maps';
import {
  findNearbyShops, NEARBY_SHOP_LIMIT, NEARBY_SHOP_RADIUS_KM, SHOP_BROWSE_LIMIT, SHOP_PAGE_SIZE,
  type CatalogProduct, type CatalogService, type CatalogSort, type CatalogTab, type Coordinates, type MarketplaceShop, type ShopCampus,
} from '@/lib/marketplace/catalog';
import { normalizeSearchTerm } from '@/lib/utils/search';
import { cn } from '@/lib/utils';

const TABS = [
  { id: 'products', label: 'Products', icon: Boxes },
  { id: 'shops', label: 'Shops', icon: Store },
  { id: 'services', label: 'Services', icon: Wrench },
] as const;
const CATEGORY_PHOTOS = [
  { category: 'Food & Drinks', label: 'Food & drinks', image: '/assets/marketplace/waakye.webp' },
  { category: 'Fashion', label: 'Fashion', image: '/assets/marketplace/fashion.webp' },
  { category: 'Electronics', label: 'Tech', image: '/assets/marketplace/tech.webp' },
  { category: 'Hair & Beauty', label: 'Beauty', image: '/assets/marketplace/beauty.webp' },
  { category: 'Printing & Photocopy', label: 'Printing', image: '/assets/marketplace/stationery.webp' },
] as const;

type PageResults = { total: number; offset: number } & (
  | { tab: 'products'; items: CatalogProduct[] }
  | { tab: 'services'; items: CatalogService[] }
  | { tab: 'shops'; items: MarketplaceShop[] }
);

const productGrid = 'grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4';
const shopGrid = 'grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3';
const filterStyle = 'min-h-[44px] w-full min-w-0 rounded-xl border border-border bg-card px-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary';

function uniqueItems<T extends { id: string }>(items: T[]) {
  return Array.from(new Map(items.map(item => [item.id, item])).values());
}

export default function MarketplacePage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<CatalogTab>('products');
  const [input, setInput] = useState('');
  const [category, setCategory] = useState('');
  const [campus, setCampus] = useState('');
  const [sort, setSort] = useState<CatalogSort>('newest');
  const [deliveryOnly, setDeliveryOnly] = useState(false);
  const [origin, setOrigin] = useState<Coordinates | null>(null);
  const [locationPending, setLocationPending] = useState(false);
  const [locationMessage, setLocationMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const locationRequest = useRef(0);
  const lastTracked = useRef('');
  const normalized = normalizeSearchTerm(input);
  const nearby = tab === 'shops' && origin !== null;
  const label = TABS.find(item => item.id === tab)!.label;

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchTerm(normalized), normalized ? 220 : 0);
    return () => window.clearTimeout(timer);
  }, [normalized]);
  useEffect(() => () => { locationRequest.current += 1; }, []);

  const campuses = useQuery<ShopCampus[]>({
    queryKey: ['marketplace-campus-options'],
    queryFn: ({ signal }) => getShopCampuses(signal),
    staleTime: 30 * 60_000,
  });
  const cart = useQuery({
    queryKey: shopCartCountKey(user?.id),
    queryFn: ({ signal }) => getShopCartCount(user!.id, signal),
    enabled: Boolean(user?.id),
    staleTime: 25_000,
  });
  const results = useInfiniteQuery({
    queryKey: ['marketplace-v2', tab, searchTerm, category, campus, sort, deliveryOnly, nearby],
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }): Promise<PageResults> => {
      const options = {
        query: searchTerm, category: category || undefined, universityId: campus || undefined,
        sort, deliveryOnly, limit: SHOP_PAGE_SIZE, offset: pageParam, signal,
      };
      if (tab === 'shops') return { tab, offset: pageParam, ...await searchMarketplaceShops({ ...options, nearby }) };
      if (tab === 'services') return { tab, offset: pageParam, ...await searchMarketplaceServices(options) };
      const page = await searchProducts(options);
      if (page.error) throw new Error('Products could not load.');
      return { tab, items: page.products, total: page.total, offset: pageParam };
    },
    getNextPageParam: last => {
      const next = last.offset + SHOP_PAGE_SIZE;
      return !nearby && last.items.length > 0 && next < Math.min(SHOP_BROWSE_LIMIT, last.total) ? next : undefined;
    },
    retry: 1,
    staleTime: 45_000,
  });

  const pages = results.data?.pages ?? [];
  const total = pages[0]?.total ?? 0;
  const products = uniqueItems(pages.flatMap(page => page.tab === 'products' ? page.items : []));
  const services = uniqueItems(pages.flatMap(page => page.tab === 'services' ? page.items : []));
  const shops = uniqueItems(pages.flatMap(page => page.tab === 'shops' ? page.items : []));
  const tooManyPins = nearby && total > NEARBY_SHOP_LIMIT;
  const visibleShops = nearby && origin
    ? (tooManyPins ? [] : findNearbyShops(shops, origin))
    : shops.map(shop => ({ shop, distance: undefined }));
  const visibleCount = nearby ? visibleShops.length : total;
  const searching = normalized !== searchTerm;
  const hasFilters = Boolean(input || category || campus || deliveryOnly || nearby);
  const campusOptions: ShopCampus[] = campuses.data ?? [];
  const activeCampus = campusOptions.find(option => option.id === campus);
  const externalMap = tab === 'shops' ? getGoogleMapsSearchUrl(
    [category || 'Shops', activeCampus?.name ? `near ${activeCampus.name}` : 'nearby', activeCampus ? 'Ghana' : ''].filter(Boolean).join(' ')
  ) : null;
  const cartCount = cart.data ?? 0;

  useEffect(() => {
    if (!searchTerm || searching || results.isPending || results.isError || !results.data) return;
    const key = JSON.stringify([tab, searchTerm, category, campus, deliveryOnly, nearby]);
    if (lastTracked.current === key) return;
    lastTracked.current = key;
    trackAnalyticsEvent({ event_type: 'search', result_count: Math.min(visibleCount, 1000) });
  }, [tab, searchTerm, searching, results.isPending, results.isError, results.data, category, campus, deliveryOnly, nearby, visibleCount]);

  function changeTab(next: CatalogTab) {
    if (next === tab) return;
    if (next !== 'shops') {
      locationRequest.current += 1;
      setOrigin(null);
      setLocationPending(false);
      setLocationMessage('');
    }
    setTab(next);
    setSort(next === 'shops' ? 'rating' : 'newest');
    if (next === 'services') setDeliveryOnly(false);
  }

  function clearFilters() {
    locationRequest.current += 1;
    setInput('');
    setSearchTerm('');
    setCategory('');
    setCampus('');
    setOrigin(null);
    setLocationPending(false);
    setLocationMessage('');
    setDeliveryOnly(false);
    setSort(tab === 'shops' ? 'rating' : 'newest');
  }

  function toggleLocation() {
    if (nearby || locationPending) {
      locationRequest.current += 1;
      setOrigin(null);
      setLocationPending(false);
      setLocationMessage('');
      return;
    }
    changeTab('shops');
    if (!navigator.geolocation) {
      setLocationMessage('Location unavailable. Choose a campus instead.');
      return;
    }
    const request = ++locationRequest.current;
    setLocationPending(true);
    setLocationMessage('');
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      if (request !== locationRequest.current) return;
      setLocationPending(false);
      if (isValidCoordinate(coords.latitude, coords.longitude)) {
        setOrigin({ latitude: coords.latitude, longitude: coords.longitude });
      } else setLocationMessage('Location unavailable. Choose a campus instead.');
    }, () => {
      if (request !== locationRequest.current) return;
      setLocationPending(false);
      setLocationMessage('Location unavailable. Choose a campus instead.');
    }, { enableHighAccuracy: false, maximumAge: 120_000, timeout: 8_000 });
  }

  return (
    <>
      <SiteHeader />
      <main className="container max-w-7xl px-3 pb-7 pt-3 sm:px-6 sm:pb-12 sm:pt-6">
        <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1.5 sm:mb-4">
          <h1 className="text-xl font-extrabold tracking-tight sm:text-3xl">Marketplace</h1>
          <div className="flex shrink-0 items-center gap-0.5 sm:gap-2">
            <Button asChild variant="ghost" size="sm" className="h-11 w-11 gap-2 px-0 sm:w-auto sm:px-3">
              <Link href="/wishlist" aria-label="Saved items"><Heart className="h-5 w-5" aria-hidden="true" /><span className="hidden sm:inline">Saved</span></Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="h-11 w-11 gap-2 px-0 sm:w-auto sm:px-3">
              <Link href="/orders"><Package className="h-5 w-5" aria-hidden="true" /><span className="sr-only sm:not-sr-only">My orders</span></Link>
            </Button>
            <Button asChild size="sm" className="relative h-11 w-11 gap-2 rounded-xl px-0 sm:w-auto sm:px-3">
              <Link href="/cart" aria-label={cartCount ? `Cart, ${cartCount} items` : 'Cart'}>
                <ShoppingBag className="h-5 w-5" aria-hidden="true" /><span className="hidden sm:inline">Cart</span>
                {cartCount > 0 && <span aria-hidden="true" className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-amber-400 text-[10px] font-bold text-slate-950 sm:static">{cartCount > 99 ? '99+' : cartCount}</span>}
              </Link>
            </Button>
          </div>
        </div>

        <section aria-label="Shop campus" className="relative isolate mb-4 min-h-[9.5rem] overflow-hidden rounded-[1.5rem] bg-[#0b342d] text-white sm:mb-5 sm:min-h-[13.75rem]">
          <div className="absolute inset-y-0 right-0 w-[60%] sm:w-[64%]">
            <CatalogPhoto sources={[CATEGORY_PHOTOS[0].image]} alt="" sizes="(min-width: 1024px) 780px, 65vw" priority fallback={ShoppingBag} />
            <div className="absolute inset-0 bg-gradient-to-r from-[#0b342d] via-[#0b342d]/25 to-transparent" />
          </div>
          <div className="relative flex min-h-[inherit] max-w-[72%] flex-col items-start justify-center px-4 py-4 sm:px-10 sm:py-7">
            <span className="mb-1 text-[10px] font-semibold uppercase tracking-[.22em] text-emerald-200 sm:text-xs">UniEco Ghana</span>
            <h2 className="text-3xl font-black leading-[1.02] tracking-[-.045em] sm:text-5xl">Shop campus.</h2>
            <a href="#shop-results" onClick={() => changeTab('shops')}
              className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[#f5fff8] px-3.5 text-sm font-bold text-[#102c22] hover:bg-[#bff0d3] focus-visible:ring-2 focus-visible:ring-white sm:mt-4">
              Explore shops <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
        </section>

        <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(290px,0.52fr)]">
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input type="search" aria-label={`Search ${label.toLowerCase()}`} value={input} maxLength={100} onChange={event => setInput(event.target.value)}
              placeholder={`Search ${label.toLowerCase()}`} className="min-h-[44px] w-full rounded-xl border border-border bg-card pl-10 pr-12 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-search-cancel-button]:hidden sm:min-h-[48px]" />
            {input && <button type="button" aria-label="Clear search" onClick={() => setInput('')} className="absolute right-0 top-0 grid h-full w-11 place-items-center rounded-xl text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>}
          </div>
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2">
            <div className="relative min-w-0">
              <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" aria-hidden="true" />
              <select aria-label="Campus" className={`${filterStyle} pl-9 sm:min-h-[48px]`} value={campus} onChange={event => setCampus(event.target.value)}>
                <option value="">All campuses</option>
                {campusOptions.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
              </select>
            </div>
            <Button type="button" variant={nearby ? 'default' : 'outline'} aria-pressed={nearby} onClick={toggleLocation}
              className="min-h-[44px] gap-2 rounded-xl px-3 sm:min-h-[48px]">
              <LocateFixed className={cn('h-4 w-4', locationPending && 'motion-safe:animate-pulse')} aria-hidden="true" />
              {nearby ? 'Nearby on' : locationPending ? 'Locating…' : 'Near me'}
            </Button>
          </div>
          {campuses.isError && <button type="button" onClick={() => void campuses.refetch()} className="text-left text-xs font-medium text-primary underline">Reload campus options</button>}
          {locationMessage && <p className="text-xs text-muted-foreground sm:col-span-2" role="status">{locationMessage}</p>}
        </div>

        <section aria-label="Shop by category" className="mb-4 sm:mb-5">
          <h2 className="sr-only">Shop by category</h2>
          <div className="-mx-3 grid snap-x grid-flow-col auto-cols-[minmax(92px,28%)] gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:grid-flow-row sm:grid-cols-5 sm:gap-3 sm:px-0">
            {CATEGORY_PHOTOS.map(item => (
              <button type="button" key={item.category} onClick={() => setCategory(current => current === item.category ? '' : item.category)}
                aria-pressed={category === item.category}
                className={cn('group relative isolate aspect-[4/3] min-w-0 snap-start overflow-hidden rounded-xl border bg-muted text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:aspect-[2/1] sm:rounded-2xl',
                  category === item.category ? 'border-primary ring-2 ring-inset ring-primary' : 'border-border')}>
                <CatalogPhoto sources={[item.image]} alt="" sizes="(min-width: 900px) 235px, (min-width: 640px) 19vw, 30vw" />
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent px-2.5 pb-2 pt-6 text-xs font-semibold leading-tight text-white sm:text-sm">{item.label}</span>
                {category === item.category && <span className="absolute inset-0 rounded-[inherit] border-2 border-emerald-400" aria-hidden="true" />}
              </button>
            ))}
          </div>
        </section>

        <section id="shop-results" className="scroll-mt-28" aria-label="Marketplace results">
          <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
            <div className="grid w-full grid-cols-3 gap-1 rounded-xl bg-muted p-1 sm:w-auto sm:min-w-[330px]" role="group" aria-label="Browse type">
              {TABS.map(({ id, icon: Icon, label: tabLabel }) => (
                <button type="button" key={id} onClick={() => changeTab(id)} aria-pressed={tab === id}
                  className={cn('flex min-h-[44px] min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:text-sm',
                    tab === id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" /> {tabLabel}
                </button>
              ))}
            </div>
            {tab !== 'services' && <button type="button" aria-pressed={deliveryOnly} onClick={() => setDeliveryOnly(value => !value)}
              className={cn('inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                deliveryOnly ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground')}>
              <Truck className="h-4 w-4" aria-hidden="true" /> Delivery
            </button>}
          </div>

          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-lg font-bold tracking-tight sm:text-xl">{nearby ? 'Shops near you' : label}</h2>
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {!results.isPending && !results.isError && !searching && !tooManyPins
                  ? `${visibleCount} ${visibleCount === 1 ? 'result' : 'results'}${activeCampus ? ` · ${activeCampus.short_name || activeCampus.name}` : ''}`
                  : activeCampus?.short_name || ''}
              </p>
            </div>
            <div className="grid w-full grid-cols-2 items-center gap-2 sm:w-auto sm:min-w-[300px]">
              <div className="relative min-w-0"><SlidersHorizontal className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <select className={`${filterStyle} pl-7`} aria-label="Category" value={category} onChange={event => setCategory(event.target.value)}>
                  <option value="">All categories</option>
                  {ALL_CATEGORIES.map(item => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>
              <select aria-label="Sort results" className={filterStyle} disabled={nearby} value={nearby ? 'distance' : sort}
                onChange={event => setSort(event.target.value as CatalogSort)}>
                {nearby && <option value="distance">Nearest</option>}
                {tab === 'shops' && <option value="rating">Top rated</option>}
                <option value="newest">Newest</option>
                {tab !== 'shops' && <><option value="price_low">Lowest price</option><option value="price_high">Highest price</option></>}
              </select>
            </div>
          </div>

          {nearby && <p className="mb-3 text-xs text-muted-foreground">Within {NEARBY_SHOP_RADIUS_KM} km · Approximate distances · Your location stays on this device.</p>}

          {searching || results.isPending ? (
            <div className={tab === 'shops' ? shopGrid : productGrid} aria-busy="true" aria-label={`Loading ${label.toLowerCase()}`}>
              {Array.from({ length: tab === 'shops' ? 3 : 4 }, (_, index) => <ProductCardSkeleton key={index} />)}
            </div>
          ) : results.isError && !results.data ? (
            <div className="rounded-2xl border border-border bg-card p-6 text-center" role="alert">
              <p className="font-semibold">Marketplace search is temporarily unavailable</p>
              <Button type="button" variant="outline" className="mt-3 min-h-[44px]" onClick={() => void results.refetch()}>Try again</Button>
            </div>
          ) : tooManyPins || visibleCount === 0 ? (
            <div className="grid justify-items-center gap-3 rounded-2xl border border-dashed border-border bg-card py-7 text-center sm:py-10">
              <ShoppingBag className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <p className="font-semibold">{tooManyPins ? 'Choose a campus to narrow nearby results' : nearby ? 'No verified shop locations nearby' : `No ${label.toLowerCase()}${hasFilters ? ' match these filters' : ' yet'}`}</p>
              <div className="flex flex-wrap justify-center gap-2 px-2">
                {hasFilters && <Button type="button" variant="outline" className="min-h-[44px]" onClick={clearFilters}>Clear filters</Button>}
                {tab !== 'shops'
                  ? <Button type="button" className="min-h-[44px] gap-2" onClick={() => changeTab('shops')}><Store className="h-4 w-4" aria-hidden="true" />Browse shops</Button>
                  : externalMap && <Button asChild variant="outline" className="min-h-[44px] gap-2">
                    <a href={externalMap} target="_blank" rel="noopener noreferrer"><MapPin className="h-4 w-4" aria-hidden="true" />Search Google Maps</a>
                  </Button>}
                {!hasFilters && <Button asChild variant="ghost" className="min-h-[44px]"><Link href="/start-business">Start selling <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" /></Link></Button>}
              </div>
            </div>
          ) : tab === 'shops' ? (
            <div className={shopGrid}>{visibleShops.map(({ shop, distance }) => <ShopCard key={shop.id} shop={shop} distance={distance} />)}</div>
          ) : tab === 'services' ? (
            <div className={productGrid}>{services.map(service => <ServiceCard key={service.id} service={service} />)}</div>
          ) : (
            <div className={productGrid}>{products.map(product => <ProductCard key={product.id} product={product}
              onView={searchTerm ? () => trackAnalyticsEvent({ event_type: 'search_result_click', subject_type: 'product', subject_id: product.id }) : undefined} />)}</div>
          )}

          {results.hasNextPage && !searching && <div className="mt-5 text-center">
            <Button type="button" variant="outline" disabled={results.isFetchingNextPage} className="min-h-[44px] gap-2"
              onClick={() => void results.fetchNextPage()}>
              {results.isFetchingNextPage ? 'Loading…' : results.isFetchNextPageError ? 'Retry loading more' : 'Show more'} <ArrowDown className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>}
          {!nearby && !results.hasNextPage && total > SHOP_BROWSE_LIMIT && <p className="mt-4 text-center text-xs text-muted-foreground">Choose a campus or category to narrow your results.</p>}
        </section>
        <Link href="/marketplace/photo-credits" className="mt-5 inline-flex min-h-[40px] items-center text-xs text-muted-foreground hover:underline">Photo credits</Link>
      </main>
      <SiteFooter />
    </>
  );
}
