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
import { RatingStars } from '@/components/shared/rating-stars';
import { VerificationBadge } from '@/components/shared/verification-badge';
import { ServiceCard } from '@/components/marketplace/product-card';
import { useAuth } from '@/lib/auth/auth-context';
import {
  getServiceById, getRelatedServices, addToCart, addToWishlist, removeFromWishlist, isInWishlist,
} from '@/lib/data/marketplace-client';
import { supabase } from '@/lib/supabase/client';
import type { Service, Review } from '@/lib/types';
import { trackAnalyticsEvent } from '@/lib/data/analytics-client';
import {
  Calendar, Clock, Heart, Share2, MessageSquare, Store, Wrench,
  ArrowLeft, Check, Image as ImageIcon, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

export default function ServiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <>
      <SiteHeader />
      <ServiceDetailContent serviceId={id} />
      <SiteFooter />
    </>
  );
}

function ServiceDetailContent({ serviceId }: { serviceId: string }) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const cartPending = useRef(false);
  const [loadError, setLoadError] = useState(false);
  const userId = user?.id;
  const [loading, setLoading] = useState(true);
  const [service, setService] = useState<Service | null>(null);
  const [vendor, setVendor] = useState<{ id: string; owner_id: string; is_temporarily_closed: boolean; business_name: string; business_slug: string; logo_url: string | null; is_verified: boolean } | null>(null);
  const [related, setRelated] = useState<Service[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [inWishlist, setInWishlist] = useState(false);
  const [booking, setBooking] = useState(false);
  const loadRequestId = useRef(0);

  const loadService = useCallback(async () => {
    const requestId = ++loadRequestId.current;
    setLoading(true);
    setLoadError(false);
    try {
      const s = await getServiceById(serviceId);
      if (requestId !== loadRequestId.current) return;
      if (!s) {
        setService(null);
        setVendor(null);
        setRelated([]);
        setReviews([]);
        return;
      }
      setService(s);
      trackAnalyticsEvent({ event_type: 'service_view', subject_type: 'service', subject_id: s.id });

      const { data: business } = await supabase
        .from('businesses')
        .select('vendor:vendors(id, owner_id, is_temporarily_closed, business_name, business_slug, logo_url, is_verified)')
        .eq('id', s.business_id)
        .maybeSingle();
      if (requestId !== loadRequestId.current) return;
      const v = business?.vendor
        ? ((Array.isArray(business.vendor) ? business.vendor[0] : business.vendor) as typeof vendor)
        : null;
      setVendor(v);

      const [rel, reviewResult] = await Promise.all([
        getRelatedServices(s.business_id, s.id, 4),
        v
          ? supabase
              .from('reviews')
              .select('*, reviewer:profiles!reviews_reviewer_id_fkey(public_nickname, avatar_url)')
              .eq('vendor_id', v.id)
              .eq('service_id', s.id)
              .eq('is_approved', true)
              .order('created_at', { ascending: false })
              .limit(5)
          : Promise.resolve({ data: [] as Review[] }),
      ]);
      if (requestId !== loadRequestId.current) return;
      setRelated(rel);
      setReviews(reviewResult.data || []);
    } catch {
      if (requestId === loadRequestId.current) {
        setLoadError(true);
      }
    } finally {
      if (requestId === loadRequestId.current) setLoading(false);
    }
  }, [serviceId]);

  useEffect(() => {
    loadService();
    return () => {
      loadRequestId.current += 1;
    };
  }, [loadService]);

  useEffect(() => {
    let active = true;
    setInWishlist(false);
    if (!userId) return () => { active = false; };
    isInWishlist('service', serviceId)
      .then((saved) => { if (active) setInWishlist(saved); })
      .catch(() => { if (active) setInWishlist(false); });
    return () => { active = false; };
  }, [serviceId, userId]);

  const handleBook = async () => {
    if (!service || authLoading || cartPending.current || vendor?.is_temporarily_closed) return;
    if (!user) {
      router.push(withNext('/signin', `/marketplace/service/${service.id}`));
      return;
    }
    cartPending.current = true;
    setBooking(true);
    try {
      const { error } = await addToCart(undefined, service.id, 1);
      if (error) toast.error(error, { action: { label: 'View cart', onClick: () => router.push('/cart') } });
      else {
        void queryClient.invalidateQueries({ queryKey: shopCartCountKey(user.id) });
        router.push('/checkout');
      }
    } catch {
      toast.error('Could not add this service. Try again.');
    } finally {
      cartPending.current = false;
      setBooking(false);
    }
  };

  const handleWishlist = async () => {
    if (!user) { toast.error('Please sign in to save items'); return; }
    if (inWishlist) {
      await removeFromWishlist('service', service!.id);
      setInWishlist(false);
      toast.success('Removed from wishlist');
    } else {
      await addToWishlist('service', service!.id);
      setInWishlist(true);
      toast.success('Added to wishlist');
    }
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({ title: service?.name, url: window.location.href });
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
          </div>
        </div>
      </main>
    );
  }

  if (loadError || !service) {
    return (
      <main className="container max-w-6xl py-6 sm:py-8 px-4 sm:px-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Wrench className="h-12 w-12 text-muted-foreground/40" />
            <p className="mt-4 text-lg font-semibold text-foreground">{loadError ? 'Service could not load' : 'Service not found'}</p>
            {loadError && <Button type="button" variant="outline" className="mt-3 min-h-[44px]" onClick={() => void loadService()}>Try again</Button>}
            <Button asChild className="mt-4"><Link href="/marketplace">Back to marketplace</Link></Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  const allImages = [service.image_url, ...(service.images ?? [])];

  return (
    <main className="container max-w-6xl py-6 sm:py-8 px-4 sm:px-6">
      <Link href="/marketplace" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to marketplace
      </Link>

      <div className="mt-4 grid gap-8 lg:grid-cols-2">
        <CatalogGallery key={service.id} name={service.name} sources={allImages} fallback={Wrench} />

        {/* Details */}
        <div className="flex flex-col">
          {vendor && (
            <Link href={`/business/${vendor.business_slug}`} className="mb-3 flex items-center gap-2 rounded-lg border border-border p-2 transition-colors hover:bg-muted/50">
              <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-muted">
                <CatalogPhoto sources={[vendor.logo_url]} alt="" sizes="36px" fallback={Store} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">{vendor.business_name}</p>
                <p className="text-xs text-muted-foreground">View provider</p>
              </div>
              {vendor.is_verified && <VerificationBadge isVerified={true} />}
            </Link>
          )}

          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">{service.name}</h1>

          <div className="mt-3 flex items-center gap-3">
            <span className="text-3xl font-bold text-primary">{formatCatalogPrice(Number(service.price), service.currency)}</span>
            {service.duration_estimate && (
              <Badge variant="outline" className="text-xs">
                <Clock className="mr-1 h-3 w-3" /> {service.duration_estimate}
              </Badge>
            )}
          </div>

          {service.description && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-foreground">About this service</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{service.description}</p>
            </div>
          )}

          <p className="mt-5 text-sm text-muted-foreground">
            {vendor?.is_temporarily_closed ? 'Shop temporarily closed.' : 'Choose your preferred time at checkout.'}
          </p>

          {/* Actions */}
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <Button onClick={() => void handleBook()} disabled={booking || authLoading || vendor?.is_temporarily_closed} className="min-h-[44px] flex-1">
              {booking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Calendar className="mr-2 h-4 w-4" />}
              {booking ? 'Adding...' : 'Book service'}
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
                  <MessageSquare className="mr-1.5 h-4 w-4" /> Contact
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Reviews */}
      {reviews.length > 0 && (
        <div className="mt-12">
          <h2 className="font-display text-lg font-bold text-foreground mb-4">Reviews</h2>
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

      {/* Related services */}
      {related.length > 0 && (
        <div className="mt-12">
          <h2 className="font-display text-lg font-bold text-foreground mb-4">Related Services</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {related.map(s => <ServiceCard key={s.id} service={s} />)}
          </div>
        </div>
      )}
    </main>
  );
}
