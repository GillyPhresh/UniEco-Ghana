'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
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
import {
  ShoppingCart, Heart, Share2, MessageSquare, Store, Package,
  ArrowLeft, Check, AlertCircle, Image as ImageIcon, Truck,
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
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [product, setProduct] = useState<Product | null>(null);
  const [vendor, setVendor] = useState<{ id: string; business_name: string; business_slug: string; logo_url: string | null; is_verified: boolean; delivery_available: boolean } | null>(null);
  const [similar, setSimilar] = useState<Product[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [selectedImage, setSelectedImage] = useState(0);
  const [inWishlist, setInWishlist] = useState(false);
  const [addingToCart, setAddingToCart] = useState(false);
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    loadProduct();
  }, [productId]);

  async function loadProduct() {
    setLoading(true);
    const p = await getProductById(productId);
    if (!p) { setLoading(false); return; }
    setProduct(p);

    // Load vendor
    const { data: business } = await supabase
      .from('businesses')
      .select('vendor:vendors(id, business_name, business_slug, logo_url, is_verified, delivery_available)')
      .eq('id', p.business_id)
      .maybeSingle();

    if (business?.vendor) {
      const v = (Array.isArray(business.vendor) ? business.vendor[0] : business.vendor) as typeof vendor;
      if (v) setVendor(v);
    }

    // Load similar products
    const sim = await getSimilarProducts(p.id, p.business_id, 4);
    setSimilar(sim);

    // Load reviews
    const { data: revs } = await supabase
      .from('reviews')
      .select('*, reviewer:profiles!reviews_reviewer_id_fkey(full_name, avatar_url)')
      .eq('product_id', p.id)
      .eq('is_approved', true)
      .order('created_at', { ascending: false })
      .limit(5);

    setReviews(revs || []);

    // Check wishlist
    if (user) {
      const inWish = await isInWishlist('product', p.id);
      setInWishlist(inWish);
    }

    setLoading(false);
  }

  const handleAddToCart = async () => {
    if (!user) { toast.error('Please sign in to add items to your cart'); return; }
    setAddingToCart(true);
    const { error } = await addToCart(product!.id, undefined, quantity);
    if (error) { toast.error(error); }
    else { toast.success(`${quantity} ${quantity === 1 ? 'item' : 'items'} added to cart`); }
    setAddingToCart(false);
  };

  const handleBuyNow = async () => {
    if (!user) { toast.error('Please sign in to purchase'); return; }
    setAddingToCart(true);
    const { error } = await addToCart(product!.id, undefined, quantity);
    if (error) { toast.error(error); }
    else {
      window.location.href = '/cart';
    }
    setAddingToCart(false);
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

  if (!product) {
    return (
      <main className="container max-w-6xl py-6 sm:py-8 px-4 sm:px-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Package className="h-12 w-12 text-muted-foreground/40" />
            <p className="mt-4 text-lg font-semibold text-foreground">Product not found</p>
            <Button asChild className="mt-4">
              <Link href="/marketplace">Back to marketplace</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  const allImages = product.images && product.images.length > 0
    ? product.images
    : (product.image_url ? [product.image_url] : []);

  const displayPrice = product.discount_price ?? product.price;
  const hasDiscount = product.discount_price !== null && product.discount_price < product.price;

  return (
    <main className="container max-w-6xl py-6 sm:py-8 px-4 sm:px-6">
      {/* Breadcrumb */}
      <Link href="/marketplace" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to marketplace
      </Link>

      <div className="mt-4 grid gap-8 lg:grid-cols-2">
        {/* Images */}
        <div>
          <div className="relative h-80 overflow-hidden rounded-xl border border-border bg-muted sm:h-96">
            {allImages[selectedImage] ? (
              <img src={allImages[selectedImage]} alt={product.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground/40">
                <ImageIcon className="h-12 w-12" />
              </div>
            )}
            {hasDiscount && (
              <Badge className="absolute left-3 top-3 bg-destructive text-destructive-foreground">
                -{Math.round((1 - (product.discount_price! / product.price)) * 100)}% OFF
              </Badge>
            )}
          </div>
          {allImages.length > 1 && (
            <div className="mt-3 flex gap-2 overflow-x-auto">
              {allImages.map((img, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedImage(i)}
                  className={`h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 transition-colors ${
                    selectedImage === i ? 'border-primary' : 'border-border'
                  }`}
                >
                  <img src={img} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Details */}
        <div className="flex flex-col">
          {/* Vendor info */}
          {vendor && (
            <Link href={`/business/${vendor.business_slug}`} className="mb-3 flex items-center gap-2 rounded-lg border border-border p-2 transition-colors hover:bg-muted/50">
              {vendor.logo_url ? (
                <img src={vendor.logo_url} alt={vendor.business_name} className="h-8 w-8 rounded-full object-cover" />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                  <Store className="h-4 w-4 text-primary" />
                </div>
              )}
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
            <span className="text-3xl font-bold text-primary">GH₵{displayPrice}</span>
            {hasDiscount && (
              <span className="text-lg text-muted-foreground line-through">GH₵{product.price}</span>
            )}
          </div>

          {/* Stock status */}
          <div className="mt-3">
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
          {vendor?.delivery_available && (
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
              <span className="text-sm font-medium text-foreground">Quantity:</span>
              <div className="flex items-center rounded-lg border border-border">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setQuantity(q => Math.max(1, q - 1))} disabled={quantity <= 1}>−</Button>
                <span className="w-10 text-center text-sm font-medium">{quantity}</span>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setQuantity(q => Math.min(product.stock, q + 1))} disabled={quantity >= product.stock}>+</Button>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Button onClick={handleAddToCart} disabled={product.stock === 0 || addingToCart} variant="outline" className="flex-1">
              <ShoppingCart className="mr-2 h-4 w-4" /> Add to Cart
            </Button>
            <Button onClick={handleBuyNow} disabled={product.stock === 0 || addingToCart} className="flex-1">
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
                <Link href={`/dashboard/messages?to=${vendor.id}`}>
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
