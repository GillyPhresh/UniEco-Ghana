'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RouteGuard } from '@/lib/auth/route-guard';
import { getWishlist, removeFromWishlist, addToCart } from '@/lib/data/marketplace-client';
import { ProductCard } from '@/components/marketplace/product-card';
import type { Product, Service } from '@/lib/types';
import {
  Heart, Trash2, ShoppingCart, Wrench, Image as ImageIcon,
} from 'lucide-react';
import { toast } from 'sonner';

type WishlistEntry = {
  id: string;
  item_type: 'product' | 'service';
  item_id: string;
  collection: string;
  created_at: string;
  product?: Product;
  service?: Service;
};

export default function WishlistPage() {
  return (
    <RouteGuard requireAuth>
      <SiteHeader />
      <WishlistContent />
      <SiteFooter />
    </RouteGuard>
  );
}

function WishlistContent() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<WishlistEntry[]>([]);
  const [filter, setFilter] = useState<'all' | 'product' | 'service'>('all');

  useEffect(() => { loadWishlist(); }, []);

  async function loadWishlist() {
    setLoading(true);
    const data = await getWishlist();
    setItems(data as WishlistEntry[]);
    setLoading(false);
  }

  const handleRemove = async (itemType: 'product' | 'service', itemId: string) => {
    const { error } = await removeFromWishlist(itemType, itemId);
    if (error) { toast.error(error); }
    else { toast.success('Removed from wishlist'); loadWishlist(); }
  };

  const handleAddToCart = async (productId: string) => {
    const { error } = await addToCart(productId);
    if (error) { toast.error(error); }
    else { toast.success('Added to cart'); }
  };

  const filtered = filter === 'all' ? items : items.filter(i => i.item_type === filter);
  const products = filtered.filter(i => i.item_type === 'product' && i.product);
  const services = filtered.filter(i => i.item_type === 'service' && i.service);

  return (
    <main className="container max-w-5xl py-6 sm:py-8 px-4 sm:px-6">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
          <Heart className="h-6 w-6 text-destructive" /> Wishlist
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Your saved products and services.</p>
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
        <TabsList className="mb-6">
          <TabsTrigger value="all">All ({items.length})</TabsTrigger>
          <TabsTrigger value="product">Products ({items.filter(i => i.item_type === 'product').length})</TabsTrigger>
          <TabsTrigger value="service">Services ({items.filter(i => i.item_type === 'service').length})</TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-52 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Heart className="h-12 w-12 text-muted-foreground/40" />
            <p className="mt-4 text-lg font-semibold text-foreground">Your wishlist is empty</p>
            <p className="mt-1 text-sm text-muted-foreground">Save products and services you&apos;re interested in.</p>
            <Button asChild className="mt-4"><Link href="/marketplace">Browse marketplace</Link></Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {/* Products */}
          {products.length > 0 && (
            <div>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Products</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {products.map(item => (
                  <div key={item.id} className="relative group">
                    <ProductCard product={item.product!} />
                    <button
                      onClick={() => handleRemove('product', item.item_id)}
                      className="absolute right-2 top-2 z-10 rounded-full bg-background/90 p-1.5 shadow-sm transition-colors hover:bg-destructive hover:text-destructive-foreground"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Services */}
          {services.length > 0 && (
            <div>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Services</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {services.map(item => (
                  <Card key={item.id} className="group overflow-hidden">
                    <div className="relative h-32 overflow-hidden bg-muted">
                      {item.service!.image_url ? (
                        <img src={item.service!.image_url} alt={item.service!.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-muted-foreground/40">
                          <Wrench className="h-8 w-8" />
                        </div>
                      )}
                      <Badge className="absolute left-2 top-2 bg-secondary text-secondary-foreground text-xs">Service</Badge>
                      <button
                        onClick={() => handleRemove('service', item.item_id)}
                        className="absolute right-2 top-2 rounded-full bg-background/90 p-1.5 shadow-sm transition-colors hover:bg-destructive hover:text-destructive-foreground"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <CardContent className="p-3">
                      <Link href={`/marketplace/service/${item.service!.id}`}>
                        <p className="truncate text-sm font-semibold text-foreground hover:text-primary">{item.service!.name}</p>
                      </Link>
                      <p className="mt-1 text-sm font-bold text-primary">GH₵{item.service!.price}</p>
                      {item.service!.duration_estimate && (
                        <p className="text-xs text-muted-foreground">{item.service!.duration_estimate}</p>
                      )}
                      <Button asChild size="sm" className="mt-2 w-full">
                        <Link href={`/marketplace/service/${item.service!.id}`}>
                          Book now
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
