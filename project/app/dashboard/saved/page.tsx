'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { RouteGuard } from '@/lib/auth/route-guard';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/shared/empty-state';
import { BusinessCard } from '@/components/shared/business-card';
import { Store, ShoppingBag, Briefcase, Calendar, Heart, Trash2, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import type { VendorWithRelations } from '@/lib/types/extended';
import { getSavedItems, deleteSavedItem, getSavedItemCounts } from '@/lib/data/student-client';
import type { SavedItem, ItemType } from '@/lib/types/student';

const TAB_MAP: Record<string, ItemType> = {
  businesses: 'business',
  products: 'product',
  services: 'service',
  events: 'event',
};

export default function SavedItemsPage() {
  return (
    <RouteGuard requireAuth>
      <SavedItemsContent />
    </RouteGuard>
  );
}

function SavedItemsContent() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') || 'businesses';
  const [loading, setLoading] = useState(true);
  const [savedBusinesses, setSavedBusinesses] = useState<VendorWithRelations[]>([]);
  const [savedProducts, setSavedProducts] = useState<{ id: string; name: string; slug: string; price: number; image_url: string | null; business: { business_name: string; business_slug: string } | null }[]>([]);
  const [savedServices, setSavedServices] = useState<{ id: string; name: string; slug: string; price: number; image_url: string | null; business: { business_name: string; business_slug: string } | null }[]>([]);
  const [savedEvents, setSavedEvents] = useState<{ id: string; title: string; slug: string; start_time: string | null; location: string | null }[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);

    const [businessItems, productItems, serviceItems, eventItems] = await Promise.all([
      getSavedItems('business'),
      getSavedItems('product'),
      getSavedItems('service'),
      getSavedItems('event'),
    ]);

    if (businessItems.length > 0) {
      const ids = businessItems.map((s) => s.item_id);
      const { data } = await supabase
        .from('vendors')
        .select(`*, university:universities(id, name, short_name, slug)`)
        .in('id', ids);
      setSavedBusinesses((data || []) as unknown as VendorWithRelations[]);
    } else {
      setSavedBusinesses([]);
    }

    if (productItems.length > 0) {
      const ids = productItems.map((s) => s.item_id);
      const { data } = await supabase
        .from('products')
        .select('id, name, slug, price, image_url, business:vendors!products_business_id_fkey(business_name, business_slug)')
        .in('id', ids);
      setSavedProducts((data || []).map((p: Record<string, unknown>) => ({
        id: p.id as string,
        name: p.name as string,
        slug: p.slug as string,
        price: p.price as number,
        image_url: p.image_url as string | null,
        business: Array.isArray(p.business) ? (p.business[0] as { business_name: string; business_slug: string }) : (p.business as { business_name: string; business_slug: string } | null),
      })));
    } else {
      setSavedProducts([]);
    }

    if (serviceItems.length > 0) {
      const ids = serviceItems.map((s) => s.item_id);
      const { data } = await supabase
        .from('services')
        .select('id, name, slug, price, image_url, business:vendors!services_business_id_fkey(business_name, business_slug)')
        .in('id', ids);
      setSavedServices((data || []).map((s: Record<string, unknown>) => ({
        id: s.id as string,
        name: s.name as string,
        slug: s.slug as string,
        price: s.price as number,
        image_url: s.image_url as string | null,
        business: Array.isArray(s.business) ? (s.business[0] as { business_name: string; business_slug: string }) : (s.business as { business_name: string; business_slug: string } | null),
      })));
    } else {
      setSavedServices([]);
    }

    if (eventItems.length > 0) {
      const ids = eventItems.map((s) => s.item_id);
      const { data } = await supabase
        .from('events')
        .select('id, title, slug, start_time, location')
        .in('id', ids);
      setSavedEvents(data || []);
    } else {
      setSavedEvents([]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRemove = async (itemType: ItemType, itemId: string) => {
    await supabase.from('saved_items').delete().eq('item_type', itemType).eq('item_id', itemId);
    loadData();
  };

  return (
    <>
      <SiteHeader />
      <main className="container py-6 sm:py-8">
        <div className="mb-6">
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Saved items
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Businesses, products, services, and events you have saved for later.
          </p>
        </div>

        <Tabs defaultValue={initialTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
            <TabsTrigger value="businesses">
              <Store className="mr-1.5 h-4 w-4" />
              Businesses
              {savedBusinesses.length > 0 && (
                <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 text-xs text-primary">{savedBusinesses.length}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="products">
              <ShoppingBag className="mr-1.5 h-4 w-4" />
              Products
              {savedProducts.length > 0 && (
                <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 text-xs text-primary">{savedProducts.length}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="services">
              <Briefcase className="mr-1.5 h-4 w-4" />
              Services
              {savedServices.length > 0 && (
                <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 text-xs text-primary">{savedServices.length}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="events">
              <Calendar className="mr-1.5 h-4 w-4" />
              Events
              {savedEvents.length > 0 && (
                <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 text-xs text-primary">{savedEvents.length}</span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Businesses */}
          <TabsContent value="businesses" className="mt-6">
            {loading ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map((i) => <div key={i} className="h-56 animate-pulse rounded-2xl bg-muted" />)}
              </div>
            ) : savedBusinesses.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {savedBusinesses.map((vendor) => (
                  <div key={vendor.id} className="relative">
                    <BusinessCard vendor={vendor} />
                    <button
                      onClick={() => handleRemove('business', vendor.id)}
                      className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-background/90 text-muted-foreground shadow-sm transition-colors hover:bg-destructive hover:text-destructive-foreground"
                      title="Remove from saved"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Heart}
                title="No saved businesses yet"
                description="Tap the heart icon on any business to save it here for quick access."
                action={<Button asChild><Link href="/discover">Discover businesses</Link></Button>}
              />
            )}
          </TabsContent>

          {/* Products */}
          <TabsContent value="products" className="mt-6">
            {loading ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map((i) => <div key={i} className="h-40 animate-pulse rounded-xl bg-muted" />)}
              </div>
            ) : savedProducts.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {savedProducts.map((product) => (
                  <Card key={product.id} className="group overflow-hidden">
                    <div className="flex gap-3 p-3">
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
                        {product.image_url ? (
                          <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center"><ShoppingBag className="h-6 w-6 text-muted-foreground/40" /></div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <Link href={`/business/${product.business?.business_slug}`} className="text-sm font-semibold text-foreground hover:text-primary line-clamp-1">
                          {product.name}
                        </Link>
                        <p className="mt-0.5 text-xs text-muted-foreground">{product.business?.business_name}</p>
                        <p className="mt-1 text-sm font-semibold text-primary">GH₵{product.price}</p>
                      </div>
                      <button
                        onClick={() => handleRemove('product', product.id)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Heart}
                title="No saved products yet"
                description="Save products you are interested in to find them quickly later."
                action={<Button asChild><Link href="/discover">Browse products</Link></Button>}
              />
            )}
          </TabsContent>

          {/* Services */}
          <TabsContent value="services" className="mt-6">
            {loading ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map((i) => <div key={i} className="h-40 animate-pulse rounded-xl bg-muted" />)}
              </div>
            ) : savedServices.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {savedServices.map((service) => (
                  <Card key={service.id} className="group overflow-hidden">
                    <div className="flex gap-3 p-3">
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
                        {service.image_url ? (
                          <img src={service.image_url} alt={service.name} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center"><Briefcase className="h-6 w-6 text-muted-foreground/40" /></div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <Link href={`/business/${service.business?.business_slug}`} className="text-sm font-semibold text-foreground hover:text-primary line-clamp-1">
                          {service.name}
                        </Link>
                        <p className="mt-0.5 text-xs text-muted-foreground">{service.business?.business_name}</p>
                        <p className="mt-1 text-sm font-semibold text-primary">{service.price ? `GH₵${service.price}` : 'Price on request'}</p>
                      </div>
                      <button
                        onClick={() => handleRemove('service', service.id)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Heart}
                title="No saved services yet"
                description="Save services you might need — from printing to repairs to tutoring."
                action={<Button asChild><Link href="/discover">Browse services</Link></Button>}
              />
            )}
          </TabsContent>

          {/* Events */}
          <TabsContent value="events" className="mt-6">
            {loading ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map((i) => <div key={i} className="h-32 animate-pulse rounded-xl bg-muted" />)}
              </div>
            ) : savedEvents.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {savedEvents.map((event) => (
                  <Card key={event.id} className="group">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <Link href={`/events/${event.slug}`} className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground group-hover:text-primary line-clamp-2">{event.title}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {event.start_time ? new Date(event.start_time).toLocaleDateString('en-GH', { weekday: 'short', month: 'short', day: 'numeric' }) : 'TBA'}
                          </p>
                          {event.location && <p className="mt-0.5 text-xs text-muted-foreground truncate">{event.location}</p>}
                        </Link>
                        <button
                          onClick={() => handleRemove('event', event.id)}
                          className="ml-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Heart}
                title="No saved events yet"
                description="Save events you do not want to miss — we will remind you when they are coming up."
                action={<Button asChild><Link href="/events">Browse events</Link></Button>}
              />
            )}
          </TabsContent>
        </Tabs>
      </main>
      <SiteFooter />
    </>
  );
}
