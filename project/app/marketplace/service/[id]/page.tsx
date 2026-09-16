'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RatingStars } from '@/components/shared/rating-stars';
import { VerificationBadge } from '@/components/shared/verification-badge';
import { ServiceCard } from '@/components/marketplace/product-card';
import { useAuth } from '@/lib/auth/auth-context';
import {
  getServiceById, getRelatedServices, addToCart, addToWishlist, removeFromWishlist, isInWishlist,
} from '@/lib/data/marketplace-client';
import { supabase } from '@/lib/supabase/client';
import type { Service, Review } from '@/lib/types';
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
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [service, setService] = useState<Service | null>(null);
  const [vendor, setVendor] = useState<{ id: string; business_name: string; business_slug: string; logo_url: string | null; is_verified: boolean } | null>(null);
  const [related, setRelated] = useState<Service[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [inWishlist, setInWishlist] = useState(false);
  const [booking, setBooking] = useState(false);
  const [bookingForm, setBookingForm] = useState({ date: '', time: '', notes: '' });

  useEffect(() => {
    loadService();
  }, [serviceId]);

  async function loadService() {
    setLoading(true);
    const s = await getServiceById(serviceId);
    if (!s) { setLoading(false); return; }
    setService(s);

    const { data: business } = await supabase
      .from('businesses')
      .select('vendor:vendors(id, business_name, business_slug, logo_url, is_verified)')
      .eq('id', s.business_id)
      .maybeSingle();

    if (business?.vendor) {
      const v = (Array.isArray(business.vendor) ? business.vendor[0] : business.vendor) as typeof vendor;
      if (v) setVendor(v);
    }

    const rel = await getRelatedServices(s.business_id, s.id, 4);
    setRelated(rel);

    const { data: revs } = await supabase
      .from('reviews')
      .select('*, reviewer:profiles!reviews_reviewer_id_fkey(full_name, avatar_url)')
      .eq('vendor_id', vendor?.id || '')
      .eq('is_approved', true)
      .order('created_at', { ascending: false })
      .limit(5);

    setReviews(revs || []);

    if (user) {
      const inWish = await isInWishlist('service', s.id);
      setInWishlist(inWish);
    }

    setLoading(false);
  }

  const handleBook = async () => {
    if (!user) { toast.error('Please sign in to book a service'); return; }
    if (!bookingForm.date || !bookingForm.time) { toast.error('Please select a preferred date and time'); return; }
    setBooking(true);
    const { error } = await addToCart(undefined, service!.id, 1);
    if (error) { toast.error(error); }
    else {
      toast.success('Service added to cart. Complete your booking at checkout.');
      window.location.href = '/cart';
    }
    setBooking(false);
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

  if (!service) {
    return (
      <main className="container max-w-6xl py-6 sm:py-8 px-4 sm:px-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Wrench className="h-12 w-12 text-muted-foreground/40" />
            <p className="mt-4 text-lg font-semibold text-foreground">Service not found</p>
            <Button asChild className="mt-4"><Link href="/marketplace">Back to marketplace</Link></Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  const allImages = service.images && service.images.length > 0
    ? service.images
    : (service.image_url ? [service.image_url] : []);

  return (
    <main className="container max-w-6xl py-6 sm:py-8 px-4 sm:px-6">
      <Link href="/marketplace" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to marketplace
      </Link>

      <div className="mt-4 grid gap-8 lg:grid-cols-2">
        {/* Image */}
        <div>
          <div className="relative h-80 overflow-hidden rounded-xl border border-border bg-muted sm:h-96">
            {allImages[0] ? (
              <img src={allImages[0]} alt={service.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground/40">
                <Wrench className="h-12 w-12" />
              </div>
            )}
            <Badge className="absolute left-3 top-3 bg-secondary text-secondary-foreground">Service</Badge>
          </div>
        </div>

        {/* Details */}
        <div className="flex flex-col">
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
                <p className="text-xs text-muted-foreground">View provider</p>
              </div>
              {vendor.is_verified && <VerificationBadge isVerified={true} />}
            </Link>
          )}

          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">{service.name}</h1>

          <div className="mt-3 flex items-center gap-3">
            <span className="text-3xl font-bold text-primary">GH₵{service.price}</span>
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

          {/* Booking form */}
          <div className="mt-6 rounded-xl border border-primary/20 bg-primary/5 p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Calendar className="h-4 w-4 text-primary" /> Book this service
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">Choose your preferred date and time. The vendor will confirm your booking.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="booking_date" className="text-xs">Preferred date</Label>
                <Input id="booking_date" type="date" value={bookingForm.date} onChange={e => setBookingForm(p => ({ ...p, date: e.target.value }))} min={new Date().toISOString().split('T')[0]} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="booking_time" className="text-xs">Preferred time</Label>
                <Input id="booking_time" type="time" value={bookingForm.time} onChange={e => setBookingForm(p => ({ ...p, time: e.target.value }))} />
              </div>
            </div>
            <div className="mt-3 space-y-1.5">
              <Label htmlFor="booking_notes" className="text-xs">Additional notes (optional)</Label>
              <Textarea id="booking_notes" rows={2} value={bookingForm.notes} onChange={e => setBookingForm(p => ({ ...p, notes: e.target.value }))} placeholder="Any specific requirements or details..." />
            </div>
          </div>

          {/* Actions */}
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <Button onClick={handleBook} disabled={booking} className="flex-1">
              {booking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Calendar className="mr-2 h-4 w-4" />}
              {booking ? 'Adding...' : 'Book Now'}
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
