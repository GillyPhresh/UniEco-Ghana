'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { Product } from '@/lib/types';
import { ShoppingCart, Heart, Image as ImageIcon } from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-context';
import { addToCart } from '@/lib/data/marketplace-client';
import { isOptimizablePublicImage } from '@/lib/utils/optimized-image';
import { toast } from 'sonner';
import { useState } from 'react';

interface ProductCardProps {
  product: Product & {
    vendor?: { business_name: string; business_slug: string; logo_url?: string | null };
  };
}

export function ProductCard({ product }: ProductCardProps) {
  const { user } = useAuth();
  const [adding, setAdding] = useState(false);
  const image = product.image_url || (product.images && product.images[0]) || null;
  const displayPrice = product.discount_price ?? product.price;
  const hasDiscount = product.discount_price !== null && product.discount_price < product.price;
  const canOptimizeImage = image ? isOptimizablePublicImage(image) : false;

  const handleAddToCart = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) { toast.error('Please sign in to add items to your cart'); return; }
    if (adding || product.stock <= 0) return;
    setAdding(true);
    try {
      const { error } = await addToCart(product.id);
      if (error) toast.error(error);
      else toast.success('Added to cart');
    } catch {
      toast.error('Could not add this item. Check your connection and try again.');
    } finally {
      setAdding(false);
    }
  };

  return (
    <Card className="group h-full overflow-hidden transition-colors duration-200 hover:border-primary/30 hover:shadow-md">
      <Link href={`/marketplace/product/${product.id}`} className="block rounded-t-xl outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary" aria-label={`View ${product.name}`}>
        <div className="relative h-40 overflow-hidden bg-muted">
          {image ? (
            <Image src={image} alt={product.name} fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw" quality={75} loading="lazy" unoptimized={!canOptimizeImage} className="object-cover transition-transform group-hover:scale-105" />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground/40">
              <ImageIcon className="h-8 w-8" />
            </div>
          )}
          {hasDiscount && (
            <Badge className="absolute left-2 top-2 bg-destructive text-destructive-foreground text-xs">
              -{Math.round((1 - (product.discount_price! / product.price)) * 100)}%
            </Badge>
          )}
          {product.stock <= product.low_stock_threshold && product.stock > 0 && (
            <Badge className="absolute right-2 top-2 bg-warning/90 text-warning-foreground text-xs">
              Low stock
            </Badge>
          )}
        </div>
        <div className="px-4 pt-4">
          <p className="truncate text-sm font-semibold text-foreground">{product.name}</p>
          {product.vendor && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{product.vendor.business_name}</p>
          )}
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-sm font-bold text-primary">GH₵{displayPrice}</span>
            {hasDiscount && (
              <span className="text-xs text-muted-foreground line-through">GH₵{product.price}</span>
            )}
          </div>
        </div>
      </Link>
      <div className="flex min-h-[60px] items-center justify-between gap-2 px-4 pb-3 pt-1">
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {product.stock > 0 ? `${product.stock} in stock` : 'Out of stock'}
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="min-h-11 min-w-11 touch-manipulation rounded-full px-3 text-primary hover:bg-primary/10"
          onClick={handleAddToCart}
          disabled={adding || product.stock === 0}
          aria-label={adding ? `Adding ${product.name} to cart` : `Add ${product.name} to cart`}
        >
          <ShoppingCart className="h-4 w-4" aria-hidden="true" />
          <span className="ml-2 text-xs font-semibold">{adding ? 'Adding…' : 'Add'}</span>
        </Button>
      </div>
    </Card>
  );
}

interface ServiceCardProps {
  service: Service & {
    vendor?: { business_name: string; business_slug: string; logo_url?: string | null };
  };
}

import type { Service } from '@/lib/types';
import { Clock, Wrench } from 'lucide-react';

export function ServiceCard({ service }: ServiceCardProps) {
  const image = service.image_url || (service.images && service.images[0]) || null;
  const canOptimizeImage = image ? isOptimizablePublicImage(image) : false;

  return (
    <Link href={`/marketplace/service/${service.id}`}>
      <Card className="group h-full overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg">
        <div className="relative h-40 overflow-hidden bg-muted">
          {image ? (
            <Image src={image} alt={service.name} fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw" quality={75} loading="lazy" unoptimized={!canOptimizeImage} className="object-cover transition-transform group-hover:scale-105" />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground/40">
              <Wrench className="h-8 w-8" />
            </div>
          )}
          <Badge className="absolute left-2 top-2 bg-secondary/90 text-secondary-foreground text-xs">
            Service
          </Badge>
        </div>
        <div className="p-4">
          <p className="truncate text-sm font-semibold text-foreground">{service.name}</p>
          {service.vendor && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{service.vendor.business_name}</p>
          )}
          <div className="mt-2 flex items-center justify-between">
            <span className="text-sm font-bold text-primary">GH₵{service.price}</span>
            {service.duration_estimate && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" /> {service.duration_estimate}
              </span>
            )}
          </div>
        </div>
      </Card>
    </Link>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="h-full overflow-hidden rounded-2xl border border-border bg-card">
      <div className="h-40 animate-pulse bg-muted" />
      <div className="p-3 space-y-2">
        <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
        <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}
