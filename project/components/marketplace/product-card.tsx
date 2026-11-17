'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Clock, Plus, Star, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CatalogPhoto } from './catalog-photo';
import { useAuth } from '@/lib/auth/auth-context';
import { withNext } from '@/lib/auth/redirects';
import { addToCart } from '@/lib/data/marketplace-client';
import { shopCartCountKey } from '@/lib/data/shop-catalog-client';
import { catalogPrice, formatCatalogPrice, type CatalogProduct, type CatalogService, type CatalogVendor } from '@/lib/marketplace/catalog';

type VendorLabel = Pick<CatalogVendor, 'business_name'> & Partial<CatalogVendor>;
type ProductCardItem = Omit<CatalogProduct, 'vendor'> & { vendor?: VendorLabel };
type ServiceCardItem = Omit<CatalogService, 'vendor'> & { vendor?: VendorLabel };

const sizes = '(min-width: 1280px) 300px, (min-width: 1024px) 25vw, 50vw';

function SellerLine({ vendor }: { vendor: VendorLabel }) {
  const rating = Number(vendor.rating_avg);
  return (
    <div className="flex min-w-0 items-center justify-between gap-1 text-xs text-muted-foreground">
      <span className="min-w-0 truncate">{vendor.business_name}</span>
      {Boolean(vendor.rating_count) && Number.isFinite(rating) && rating > 0 && (
        <span aria-label={`Shop rating ${rating.toFixed(1)} out of 5`} className="inline-flex shrink-0 items-center gap-0.5">
          <Star className="h-3 w-3 fill-amber-400 text-amber-500" aria-hidden="true" /> {rating.toFixed(1)}
        </span>
      )}
    </div>
  );
}

export function ProductCard({ product, onView }: { product: ProductCardItem; onView?: () => void }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const pending = useRef(false);
  const displayPrice = catalogPrice(product);
  const discounted = product.price > 0 && displayPrice < product.price;
  const unavailable = product.stock <= 0 || product.vendor?.is_temporarily_closed === true;

  const handleAddToCart = async () => {
    if (loading || pending.current || unavailable) return;
    if (!user) {
      router.push(withNext('/signin', `/marketplace/product/${product.id}`));
      return;
    }
    pending.current = true;
    setAdding(true);
    try {
      const { error } = await addToCart(product.id);
      if (error) toast.error(error, { action: { label: 'View cart', onClick: () => router.push('/cart') } });
      else {
        void queryClient.invalidateQueries({ queryKey: shopCartCountKey(user.id) });
        toast.success('Added to cart', { action: { label: 'View cart', onClick: () => router.push('/cart') } });
      }
    } catch {
      toast.error('Could not add this item. Try again.');
    } finally {
      setAdding(false);
      pending.current = false;
    }
  };

  return (
    <Card className="group flex h-full min-w-0 flex-col overflow-hidden rounded-2xl transition-shadow hover:shadow-md">
      <Link href={`/marketplace/product/${product.id}`} onClick={onView}
        className="block flex-1 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
        aria-label={`View ${product.name}`}>
        <div className="relative aspect-square overflow-hidden bg-muted">
          <CatalogPhoto sources={[product.image_url, ...(product.images ?? [])]} alt="" sizes={sizes} />
          {discounted && <span className="absolute left-2 top-2 rounded-full bg-emerald-900 px-2 py-1 text-xs font-semibold text-white">−{Math.round((1 - displayPrice / product.price) * 100)}%</span>}
          {unavailable && <span className="absolute bottom-2 left-2 max-w-[calc(100%-1rem)] rounded-full bg-background px-2 py-1 text-xs font-semibold">
            {product.stock <= 0 ? 'Sold out' : 'Shop closed'}
          </span>}
        </div>
        <div className="space-y-1.5 px-2.5 pt-2.5 sm:px-3.5 sm:pt-3">
          <p className="line-clamp-2 min-h-[2.35em] text-sm font-semibold leading-snug">{product.name}</p>
          {product.vendor && <SellerLine vendor={product.vendor} />}
        </div>
      </Link>
      <div className="flex min-w-0 items-end justify-between gap-1 px-2.5 pb-2.5 pt-2 sm:px-3.5 sm:pb-3">
        <div className="min-w-0 self-center">
          <span className="block break-words text-sm font-extrabold text-primary sm:text-base">{formatCatalogPrice(displayPrice, product.currency)}</span>
          {discounted && <s className="block text-[10px] text-muted-foreground sm:text-xs">{formatCatalogPrice(product.price, product.currency)}</s>}
        </div>
        <Button type="button" size="icon" className="min-h-[44px] min-w-[44px] touch-manipulation shrink-0 rounded-full"
          onClick={handleAddToCart} disabled={adding || unavailable || loading}
          aria-label={adding ? `Adding ${product.name} to cart` : `Add ${product.name} to cart`}
          aria-busy={adding}>
          <Plus className={adding ? 'h-5 w-5 motion-safe:animate-pulse' : 'h-5 w-5'} aria-hidden="true" />
        </Button>
      </div>
    </Card>
  );
}

export function ServiceCard({ service }: { service: ServiceCardItem }) {
  return (
    <Link href={`/marketplace/service/${service.id}`} className="group block h-full min-w-0 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-primary">
      <Card className="flex h-full min-w-0 flex-col overflow-hidden rounded-2xl transition-shadow group-hover:shadow-md">
        <div className="relative aspect-square overflow-hidden bg-muted">
          <CatalogPhoto sources={[service.image_url, ...(service.images ?? [])]} alt="" sizes={sizes} fallback={Wrench} />
          <span className="absolute left-2 top-2 rounded-full bg-background px-2 py-1 text-xs font-semibold">Service</span>
        </div>
        <div className="flex flex-1 flex-col gap-1.5 px-2.5 py-3 sm:px-3.5">
          <p className="line-clamp-2 min-h-[2.35em] text-sm font-semibold leading-snug">{service.name}</p>
          {service.vendor && <SellerLine vendor={service.vendor} />}
          <p className="mt-auto break-words pt-1 text-sm font-extrabold text-primary sm:text-base">{formatCatalogPrice(Number(service.price), service.currency)}</p>
          {service.duration_estimate && <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3 shrink-0" aria-hidden="true" /> {service.duration_estimate}
          </p>}
        </div>
      </Card>
    </Link>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="h-full overflow-hidden rounded-2xl border border-border bg-card" aria-hidden="true">
      <div className="aspect-square bg-muted motion-safe:animate-pulse" />
      <div className="space-y-2 p-3">
        <div className="h-4 w-3/4 rounded bg-muted motion-safe:animate-pulse" />
        <div className="h-3 w-1/2 rounded bg-muted motion-safe:animate-pulse" />
        <div className="h-4 w-1/3 rounded bg-muted motion-safe:animate-pulse" />
      </div>
    </div>
  );
}
