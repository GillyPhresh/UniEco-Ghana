'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { Product } from '@/lib/types';
import { ShoppingCart, Heart, Image as ImageIcon } from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-context';
import { addToCart } from '@/lib/data/marketplace-client';
import { toast } from 'sonner';

interface ProductCardProps {
  product: Product & {
    vendor?: { business_name: string; business_slug: string; logo_url?: string | null };
  };
}

export function ProductCard({ product }: ProductCardProps) {
  const { user } = useAuth();
  const image = product.image_url || (product.images && product.images[0]) || null;
  const displayPrice = product.discount_price ?? product.price;
  const hasDiscount = product.discount_price !== null && product.discount_price < product.price;

  const handleAddToCart = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) { toast.error('Please sign in to add items to your cart'); return; }
    const { error } = await addToCart(product.id);
    if (error) { toast.error(error); } else { toast.success('Added to cart'); }
  };

  return (
    <Link href={`/marketplace/product/${product.id}`}>
      <Card className="group h-full overflow-hidden transition-all hover:border-primary/30 hover:shadow-md">
        <div className="relative h-40 overflow-hidden bg-muted">
          {image ? (
            <img src={image} alt={product.name} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
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
        <div className="p-3">
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
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {product.stock > 0 ? `${product.stock} in stock` : 'Out of stock'}
            </span>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-primary"
              onClick={handleAddToCart}
              disabled={product.stock === 0}
            >
              <ShoppingCart className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </Card>
    </Link>
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

  return (
    <Link href={`/marketplace/service/${service.id}`}>
      <Card className="group h-full overflow-hidden transition-all hover:border-primary/30 hover:shadow-md">
        <div className="relative h-40 overflow-hidden bg-muted">
          {image ? (
            <img src={image} alt={service.name} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground/40">
              <Wrench className="h-8 w-8" />
            </div>
          )}
          <Badge className="absolute left-2 top-2 bg-secondary/90 text-secondary-foreground text-xs">
            Service
          </Badge>
        </div>
        <div className="p-3">
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
