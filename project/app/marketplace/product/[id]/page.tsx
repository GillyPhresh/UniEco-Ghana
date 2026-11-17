'use client';

import { useState, useEffect, use, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { CatalogGallery } from '@/components/marketplace/catalog-gallery';
import { CatalogPhoto } from '@/components/marketplace/catalog-photo';
import { withNext } from '@/lib/auth/redirects';
import { shopCartCountKey } from '@/lib/data/shop-catalog-client';
import { formatCatalogPrice } from '@/lib/marketplace/catalog';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { RatingStars } from '@/components/shared/rating-stars';
import { VerificationBadge } from '@/components/shared/verification-badge';
import { ProductCard } from '@/components/marketplace/product-card';
import { useAuth } from '@/lib/auth/auth-context';
import {
  getProductById, getSimilarProducts, addToCart, addToWishlist, removeFromWishlist, isInWishlist,
} from '@/lib/data/marketplace-client';
import { supabase } from '@/lib/supabase/client';
import type { Product, Review } from '@/lib/types';
import { trackAnalyticsEvent } from '@/lib/data/analytics-client';
import {
  ShoppingCart, Heart, Share2, MessageSquare, Store, Package,
  ArrowLeft, Check, AlertCircle, Truck,
} from 'lucide-react';
import { toast } from 'sonner';

export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <>
      <SiteHeader />
      <ProductDetailContent productId={id} />
      <SiteFooter />
    </>
  );
}

function ProductDetailContent({ productId }: { productId: string }) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const cartPending = useRef(false);
  const [loadError, setLoadError] = useState(false);
  const userId = user?.id;
  const [loading, setLoading] = useState(true);
  const [product, setProduct] = useState<Product | null>(null);
  const [vendor, setVendor] = useState<{ id: string; owner_id: string; is_temporarily_closed: boolean; business_name: string; business_slug: string; logo_url: string | null; is_verified: boolean; delivery_available: boolean } | null>(null);
  const [similar, setSimilar] = useState<Product[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [inWishlist, setInWishlist] = useState(false);
  const [addingToCart, setAddingToCart] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const loadRequestId = useRef(0);

  const loadProduct = useCallback(async () => {
    const requestId = ++loadRequestId.current;
    setLoading(true);
    setLoadError(false);
    try {
      const p = await getProductById(productId);
      if (requestId !== loadRequestId.current) return;
      if (!p) {
        setProduct(null);
        setVendor(null);
        setSimilar([]);
        setReviews([]);
        return;
      }
      setProduct(p);
      trackAnalyticsEvent({ event_type: 'product_view', subject_type: 'product', subject_id: p.id });

      const { data: business } = await supabase
        .from('businesses')
        .select('vendor:vendors(id, owner_id, is_temporarily_closed, business_name, business_slug, logo_url, is_verified, delivery_available)')
        .eq('id', p.business_id)
        .maybeSingle();
      if (requestId !== loadRequestId.current) return;
      const v = business?.vendor
        ? ((Array.isArray(business.vendor) ? business.vendor[0] : business.vendor) as typeof vendor)
        : null;
      setVendor(v);

      const [sim, reviewResult] = await Promise.all([
        getSimilarProducts(p.id, p.business_id, 4),
        supabase
          .from('reviews')
          .select('*, reviewer:profiles!reviews_reviewer_id_fkey(full_name, avatar_url)')
          .eq('product_id', p.id)
          .eq('is_approved', true)
          .order('created_at', { ascending: false })
          .limit(5),
      ]);
      if (requestId !== loadRequestId.current) return;
      setSimilar(sim);
      setReviews(reviewResult.data || []);
    } catch {
      if (requestId === loadRequestId.current) {
        setLoadError(true);
      }
    } finally {
      if (requestId === loadRequestId.current) setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    loadProduct();
    return () => {
      loadRequestId.current += 1;
    };
  }, [loadProduct]);

  useEffect(() => {
    let active = true;
    setInWishlist(false);
    if (!userId) return () => { active = false; };
    isInWishlist('product', productId)
      .then((saved) => { if (active) setInWishlist(saved); })
      .catch(() => { if (active) setInWishlist(false); });
    return () => { active = false; };
  }, [productId, userId]);

  const handleAddToCart = async (checkout = false) => {
    if (!product || authLoading || cartPending.current || product.stock <= 0 || vendor?.is_temporarily_closed) return;
    if (!user) {
      router.push(withNext('/signin', `/marketplace/product/${product.id}`));
      return;
    }
    cartPending.current = true;
    setAddingToCart(true);
    try {
      const { error } = await addToCart(product.id, undefined, quantity);
      if (error) toast.error(error, { action: { label: 'View cart', onClick: () => router.push('/cart') } });
      else {
        void queryClient.invalidateQueries({ queryKey: shopCartCountKey(user.id) });
        if (checkout) router.push('/checkout');
        else toast.success('Added to cart', { action: { label: 'View cart', onClick: () => router.push('/cart') } });
      }
    } catch {
      toast.error('Could not add this item. Try again.');
    } finally {
      cartPending.current = false;
      setAddingToCart(false);
    }
  };

  const handleWishlist = async () => {
    if (!user) { toast.error('Please sign in to save items'); return; }
    if (inWishlist) {
      await removeFromWishlist('product', product!.id);
      setInWishlist(false);
      toast.success('Removed from wishlist');
    } else {
      await addToWishlist('product', product!.id);
      setInWishlist(true);
      toast.success('Added to wishlist');
    }
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({ title: product?.name, url: window.location.href });
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast.success('Link copied to clipboard');
    }
  };

  if (loading) {
    return (
      <main className="container max-w-6xl py-6 sm:py-8 px-4 sm:px-6">
        <Skeleton className="h-6 w-24" />
        <div className="mt-4 grid gap-8 lg:grid-cols-2">
          <Skeleton className="h-96 rounded-xl" />
          <div className="space-y-4">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-6 w-1/4" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </div>
      </main>
    );
  }

  if (loadError || !product) {
    return (
      <main className="container max-w-6xl py-6 sm:py-8 px-4 sm:px-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Package className="h-12 w-12 text-muted-foreground/40" />
            <p className="mt-4 text-lg font-semibold text-foreground">{loadError ? 'Product could not load' : 'Product not found'}</p>
            {loadError && <Button type="button" variant="outline" className="mt-3 min-h-[44px]" onClick={() => void loadProduct()}>Try again</Button>}
            <Button asChild className="mt-4">
              <Link href="/marketplace">Back to marketplace</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  const allImages = [product.image_url, ...(product.images ?? [])];

  const displayPrice = product.discount_price ?? product.price;
  const hasDiscount = product.discount_price !== null && product.discount_price < product.price;

  return (
    <main className="container max-w-6xl py-6 sm:py-8 px-4 sm:px-6">
      {/* Breadcrumb */}
      <Link href="/marketplace" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to marketplace
      </Link>

      <div className="mt-4 grid gap-8 lg:grid-cols-2">
        <CatalogGallery key={product.id} name={product.name} sources={allImages} />

        {/* Details */}
        <div className="flex flex-col">
          {/* Vendor info */}
          {vendor && (
            <Link href={`/business/${vendor.business_slug}`} className="mb-3 flex items-center gap-2 rounded-lg border border-border p-2 transition-colors hover:bg-muted/50">
              <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-muted">
                <CatalogPhoto sources={[vendor.logo_url]} alt="" sizes="36px" fallback={Store} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">{vendor.business_name}</p>
                <p className="text-xs text-muted-foreground">View store</p>
              </div>
              {vendor.is_verified && <VerificationBadge isVerified={true} />}
            </Link>
          )}

          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">{product.name}</h1>

          {/* Tags */}
          {product.tags && product.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {product.tags.slice(0, 5).map(tag => (
                <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
              ))}
            </div>
          )}

          {/* Price */}
          <div className="mt-4 flex items-baseline gap-3">
            <span className="text-3xl font-bold text-primary">{formatCatalogPrice(Number(displayPrice), product.currency)}</span>
            {hasDiscount && (
              <span className="text-lg text-muted-foreground line-through">{formatCatalogPrice(Number(product.price), product.currency)}</span>
            )}
          </div>

          {/* Stock status */}
          <div className="mt-3">
            {vendor?.is_temporarily_closed && <Badge variant="secondary" className="mr-2">Shop closed</Badge>}
            {product.stock > 0 ? (
              <Badge className="bg-success/10 text-success border-success/20">
                <Check className="mr-1 h-3 w-3" /> In stock ({product.stock} available)
              </Badge>
            ) : (
              <Badge className="bg-destructive/10 text-destructive border-destructive/20">
                <AlertCircle className="mr-1 h-3 w-3" /> Out of stock
              </Badge>
            )}
          </div>

          {/* Delivery */}
          {vendor?.delivery_available && !vendor.is_temporarily_closed && (
            <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Truck className="h-4 w-4" /> Delivery available
            </div>
          )}

          {/* Description */}
          {product.description && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-foreground">Description</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{product.description}</p>
            </div>
          )}

          {/* SKU */}
          {product.sku && (
            <p className="mt-4 text-xs text-muted-foreground">SKU: {product.sku}</p>
          )}

          {/* Quantity selector */}
          {product.stock > 0 && (
            <div className="mt-6 flex items-center gap-3">
              <span className="text-sm font-medium text-foreground">Quantity</span>
              <div className="flex items-center rounded-lg border border-border">
                <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Decrease quantity" onClick={() => setQuantity(q => Math.max(1, q - 1))} disabled={quantity <= 1}>−</Button>
                <span className="w-10 text-center text-sm font-medium">{quantity}</span>
                <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Increase quantity" onClick={() => setQuantity(q => Math.min(product.stock, q + 1))} disabled={quantity >= product.stock}>+</Button>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Button onClick={() => void handleAddToCart()} disabled={product.stock <= 0 || vendor?.is_temporarily_closed || authLoading || addingToCart} variant="outline" className="min-h-[44px] flex-1">
              <ShoppingCart className="mr-2 h-4 w-4" /> Add to Cart
            </Button>
            <Button onClick={() => void handleAddToCart(true)} disabled={product.stock <= 0 || vendor?.is_temporarily_closed || authLoading || addingToCart} className="min-h-[44px] flex-1">
              {addingToCart ? 'Adding...' : 'Buy Now'}
            </Button>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleWishlist}>
              <Heart className={`mr-1.5 h-4 w-4 ${inWishlist ? 'fill-destructive text-destructive' : ''}`} />
              {inWishlist ? 'Saved' : 'Save'}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleShare}>
              <Share2 className="mr-1.5 h-4 w-4" /> Share
            </Button>
            {vendor && (
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/dashboard/messages?to=${vendor.owner_id}`}>
                  <MessageSquare className="mr-1.5 h-4 w-4" /> Contact vendor
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Reviews */}
      {reviews.length > 0 && (
        <div className="mt-12">
          <h2 className="font-display text-lg font-bold text-foreground mb-4">Customer Reviews</h2>
          <div className="space-y-4">
            {reviews.map(review => (
              <Card key={review.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <RatingStars rating={review.rating} size={14} showValue={false} />
                    <span className="text-xs text-muted-foreground">
                      {new Date(review.created_at).toLocaleDateString('en-GH')}
                    </span>
                  </div>
                  {review.comment && <p className="mt-2 text-sm text-foreground">{review.comment}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Similar products */}
      {similar.length > 0 && (
        <div className="mt-12">
          <h2 className="font-display text-lg font-bold text-foreground mb-4">Similar Products</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {similar.map(p => <ProductCard key={p.id} product={p} />)}
          </div>
        </div>
      )}
    </main>
  );
}
