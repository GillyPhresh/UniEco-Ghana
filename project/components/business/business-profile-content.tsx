'use client';

import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RatingStars } from '@/components/shared/rating-stars';
import { VerificationBadge } from '@/components/shared/verification-badge';
import { OpenStatus } from '@/components/shared/open-status';
import { MapPreview } from '@/components/shared/map-preview';
import { EmptyState } from '@/components/shared/empty-state';
import { BusinessCard } from '@/components/shared/business-card';
import { CatalogPhoto } from '@/components/marketplace/catalog-photo';
import { ProductCard, ServiceCard } from '@/components/marketplace/product-card';
import { catalogPhotos, publicShopDestination } from '@/lib/marketplace/catalog';
import { getGoogleMapsDirectionsUrl, isSupportedGoogleMapsUrl } from '@/lib/maps';
import { Phone, MessageCircle, Mail, MapPin, Navigation, Package, Store, Wrench, Image as ImageIcon, Star, Info, Heart, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/lib/auth/auth-context';
import { toggleSaveItem, isItemSaved, trackRecentlyViewed, checkExistingReview, createReview } from '@/lib/data/student-client';
import Link from 'next/link';
import type { VendorWithRelations } from '@/lib/types/extended';
import type { Product, Service, Review, Location } from '@/lib/types';
import type { BusinessGalleryItem } from '@/lib/types/vendor';

interface BusinessProfileContentProps {
  vendor: VendorWithRelations;
  initialTab: string;
  location: Location | null;
  gallery: BusinessGalleryItem[];
  products: (Product & { business: { id: string; name: string; slug: string } })[];
  services: (Service & { business: { id: string; name: string; slug: string } })[];
  reviews: (Review & { reviewer: { full_name: string | null; avatar_url: string | null } | null })[];
  relatedVendors: VendorWithRelations[];
}

export function BusinessProfileContent({
  vendor,
  initialTab,
  location,
  gallery,
  products,
  services,
  reviews,
  relatedVendors,
}: BusinessProfileContentProps) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const { user } = useAuth();
  const [isSaved, setIsSaved] = useState(false);
  const [savingItem, setSavingItem] = useState(false);
  const [hasReviewed, setHasReviewed] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewSuccess, setReviewSuccess] = useState(false);

  useEffect(() => {
    if (user && vendor.id) {
      isItemSaved('business', vendor.id).then(setIsSaved);
      checkExistingReview(vendor.id).then(setHasReviewed);
      trackRecentlyViewed('business', vendor.id);
    }
  }, [user, vendor.id]);

  const handleSave = async () => {
    if (!user) return;
    setSavingItem(true);
    const { saved } = await toggleSaveItem('business', vendor.id);
    setIsSaved(saved);
    setSavingItem(false);
  };

  const handleSubmitReview = async () => {
    if (!user) { setReviewError('Please sign in to leave a review.'); return; }
    setSubmittingReview(true);
    setReviewError(null);
    const { error } = await createReview({
      vendorId: vendor.id,
      rating: reviewRating,
      comment: reviewComment,
    });
    if (error) {
      setReviewError(error);
    } else {
      setReviewSuccess(true);
      setHasReviewed(true);
      setReviewComment('');
      setTimeout(() => setReviewSuccess(false), 4000);
    }
    setSubmittingReview(false);
  };

  const galleryPhotos = gallery.filter(item => catalogPhotos(item.image_url).length > 0);
  const heroPhotos = catalogPhotos(vendor.cover_image_url, galleryPhotos.map(item => item.image_url));
  const destination = publicShopDestination({ ...vendor, location });
  const hasPublicMap = vendor.location_public_visibility === 'business_location' && vendor.location_verification_status === 'verified';
  const directions = destination ? getGoogleMapsDirectionsUrl(destination) : null;
  const mapHref = hasPublicMap && isSupportedGoogleMapsUrl(vendor.location_maps_url) ? vendor.location_maps_url : null;
  const hasReviews = reviews.length > 0;
  const openingHours = vendor.opening_hours as Record<string, { open: string; close: string }> | null;

  const whatsappUrl = vendor.contact_phone
    ? `https://wa.me/233${vendor.contact_phone.replace(/^0/, '')}`
    : null;
  const callUrl = vendor.contact_phone ? `tel:${vendor.contact_phone}` : null;
  const emailUrl = vendor.contact_email ? `mailto:${vendor.contact_email}` : null;

  const reviewerInitials = (name: string | null) =>
    (name || 'A')
      .split(' ')
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();

  return (
    <div className="container py-6 sm:py-8">
      {/* Breadcrumb */}
      <nav className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/marketplace" className="hover:text-foreground">Marketplace</Link>
        <span>/</span>
        <span className="text-foreground">{vendor.business_name}</span>
      </nav>

      {/* Header card */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="relative aspect-[2.55/1] max-h-64 min-h-24 overflow-hidden bg-muted">
          <CatalogPhoto sources={heroPhotos} alt="" sizes="(min-width: 1280px) 1150px, 100vw" fallback={Store} priority />
        </div>
        <div className="px-4 pb-4 sm:px-6 sm:pb-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="relative -mt-9 grid h-20 w-20 shrink-0 overflow-hidden rounded-2xl border-4 border-card bg-card shadow-md sm:-mt-12 sm:h-24 sm:w-24">
              <CatalogPhoto sources={[vendor.logo_url]} alt="" sizes="96px" fallback={Store} />
            </div>

            {/* Info */}
            <div className="flex-1">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h1 className="font-display text-xl font-bold text-foreground sm:text-2xl">
                    {vendor.business_name}
                  </h1>
                  <p className="mt-0.5 text-sm text-muted-foreground">{vendor.business_type}</p>
                </div>
                <div className="flex items-center gap-2">
                  {vendor.is_verified && (
                    <VerificationBadge
                      isVerified={vendor.is_verified}
                      isStudentBusiness={vendor.is_student_business}
                      size="md"
                    />
                  )}
                </div>
              </div>

              {vendor.description && (
                <p className="mt-3 text-sm text-muted-foreground text-pretty">
                  {vendor.description}
                </p>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                <a href="#shop-sections" onClick={() => setActiveTab('reviews')} className="inline-flex min-h-[40px] items-center gap-1.5 font-semibold hover:text-primary">
                  {vendor.rating_count > 0
                    ? <RatingStars rating={Number(vendor.rating_avg)} count={vendor.rating_count} size={16} />
                    : <><Star className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> No ratings yet</>}
                  <span className="sr-only">Reviews</span>
                </a>
                {vendor.is_temporarily_closed
                  ? <Badge variant="secondary">Temporarily closed</Badge>
                  : <OpenStatus openingHours={openingHours} />}
                {vendor.university && (
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <MapPin className="h-4 w-4 text-primary" />
                    {vendor.university.short_name}
                  </span>
                )}
              </div>

              {/* Contact actions */}
              <div className="mt-4 flex flex-wrap gap-2">
                {(directions || mapHref) && <Button asChild className="min-h-[44px] gap-2 rounded-full">
                  <a href={directions || mapHref!} target="_blank" rel="noopener noreferrer">
                    <Navigation className="h-4 w-4" aria-hidden="true" /> {directions ? 'Directions' : 'Open map'}
                  </a>
                </Button>}
                {whatsappUrl && (
                  <Button asChild size="sm" className="bg-success hover:bg-success/90">
                    <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                      <MessageCircle className="mr-1.5 h-4 w-4" />
                      WhatsApp
                    </a>
                  </Button>
                )}
                {callUrl && (
                  <Button asChild size="sm" variant="outline">
                    <a href={callUrl}>
                      <Phone className="mr-1.5 h-4 w-4" />
                      Call
                    </a>
                  </Button>
                )}
                {emailUrl && (
                  <Button asChild size="sm" variant="outline">
                    <a href={emailUrl}>
                      <Mail className="mr-1.5 h-4 w-4" />
                      Email
                    </a>
                  </Button>
                )}
                {user && (
                  <Button
                    size="sm"
                    variant={isSaved ? 'default' : 'outline'}
                    onClick={handleSave}
                    disabled={savingItem}
                  >
                    {savingItem ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : (
                      <Heart className={`mr-1.5 h-4 w-4 ${isSaved ? 'fill-current' : ''}`} />
                    )}
                    {isSaved ? 'Saved' : 'Save'}
                  </Button>
                )}
                {user && vendor.owner_id && user.id !== vendor.owner_id && (
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/dashboard/messages?to=${vendor.owner_id}`}>
                      <Send className="mr-1.5 h-4 w-4" />
                      Message
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Main content with tabs */}
        <div id="shop-sections" className="min-w-0 scroll-mt-28">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid h-auto w-full grid-cols-5">
              <TabsTrigger value="products" className="min-h-[44px] gap-1 text-xs sm:text-sm">
                <Package className="h-3.5 w-3.5" />
                <span className="sr-only sm:not-sr-only">Products</span>
              </TabsTrigger>
              <TabsTrigger value="services" className="min-h-[44px] gap-1 text-xs sm:text-sm">
                <Wrench className="h-3.5 w-3.5" />
                <span className="sr-only sm:not-sr-only">Services</span>
              </TabsTrigger>
              <TabsTrigger value="gallery" className="min-h-[44px] gap-1 text-xs sm:text-sm">
                <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="sr-only sm:not-sr-only">Gallery</span>
              </TabsTrigger>
              <TabsTrigger value="reviews" className="min-h-[44px] gap-1 text-xs sm:text-sm">
                <Star className="h-3.5 w-3.5" />
                <span className="sr-only sm:not-sr-only">Reviews</span>
              </TabsTrigger>
              <TabsTrigger value="about" className="min-h-[44px] gap-1 text-xs sm:text-sm">
                <Info className="h-3.5 w-3.5" />
                <span className="sr-only sm:not-sr-only">About</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="products" className="mt-4">
              {products.length > 0 ? (
                <div className="grid grid-cols-2 gap-2.5 sm:gap-4 xl:grid-cols-3">
                  {products.map(product => <ProductCard key={product.id} product={{ ...product, vendor }} />)}
                </div>
              ) : <EmptyState icon={Package} title="No products listed yet" description="Check back for this shop’s catalogue." />}
            </TabsContent>
            <TabsContent value="services" className="mt-4">
              {services.length > 0 ? (
                <div className="grid grid-cols-2 gap-2.5 sm:gap-4 xl:grid-cols-3">
                  {services.map(service => <ServiceCard key={service.id} service={{ ...service, vendor }} />)}
                </div>
              ) : <EmptyState icon={Wrench} title="No services listed yet" description="Check back for available services." />}
            </TabsContent>

            {/* Gallery tab */}
            <TabsContent value="gallery" className="mt-4">
              {galleryPhotos.length > 0 ? (
                <div className="space-y-3">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">Shop photos</h3>
                    <p className="text-sm text-muted-foreground">
                      See the storefront, interior, products, and current offers before you visit.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {galleryPhotos.map((item) => (
                      <a
                        key={item.id}
                        href={item.image_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group overflow-hidden rounded-xl border border-border bg-card shadow-sm"
                      >
                        <div className="relative aspect-square overflow-hidden bg-muted">
                          <CatalogPhoto sources={[item.image_url]} alt={item.caption || `${vendor.business_name} shop photo`} sizes="(min-width: 1024px) 25vw, 50vw" />
                        </div>
                        {item.caption && (
                          <p className="truncate px-3 py-2 text-xs text-muted-foreground">{item.caption}</p>
                        )}
                      </a>
                    ))}
                  </div>
                </div>
              ) : (
                <EmptyState
                  icon={ImageIcon}
                  title="Gallery is empty"
                  description={`${vendor.business_name} has not uploaded any photos yet.`}
                />
              )}
            </TabsContent>

            {/* Reviews tab */}
            <TabsContent value="reviews" className="mt-4">
              {/* Review form */}
              {user ? (
                hasReviewed ? (
                  <div className="mb-4 rounded-xl border border-success/30 bg-success/5 p-4">
                    <p className="text-sm text-foreground">
                      You have already reviewed this business. Thank you for sharing your experience!
                    </p>
                  </div>
                ) : (
                  <div className="mb-4 rounded-xl border border-border bg-card p-4 shadow-sm">
                    <h3 className="text-sm font-semibold text-foreground">Write a review</h3>
                    {reviewError && (
                      <p className="mt-2 text-sm text-destructive">{reviewError}</p>
                    )}
                    {reviewSuccess && (
                      <p className="mt-2 text-sm text-success">Your review has been posted!</p>
                    )}
                    <div className="mt-3 flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          onClick={() => setReviewRating(star)}
                          className="p-0.5"
                        >
                          <Star
                            className={`h-6 w-6 ${star <= reviewRating ? 'fill-secondary text-secondary' : 'text-muted-foreground/30'}`}
                          />
                        </button>
                      ))}
                    </div>
                    <Textarea
                      className="mt-3"
                      placeholder="Share your experience with this business..."
                      value={reviewComment}
                      onChange={(e) => setReviewComment(e.target.value)}
                      rows={3}
                    />
                    <Button
                      className="mt-3"
                      size="sm"
                      onClick={handleSubmitReview}
                      disabled={submittingReview || !reviewComment.trim()}
                    >
                      {submittingReview && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                      Post review
                    </Button>
                  </div>
                )
              ) : (
                <div className="mb-4 rounded-xl border border-border bg-muted/20 p-4 text-center">
                  <p className="text-sm text-muted-foreground">
                    <Link href="/signin" className="text-primary hover:underline">Sign in</Link> to write a review
                  </p>
                </div>
              )}
              {hasReviews ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4">
                    <div className="text-center">
                      <p className="font-display text-3xl font-bold text-foreground">
                        {(vendor.rating_avg || 0).toFixed(1)}
                      </p>
                      <RatingStars rating={vendor.rating_avg || 0} showValue={false} size={14} />
                      <p className="mt-1 text-xs text-muted-foreground">
                        {vendor.rating_count} reviews
                      </p>
                    </div>
                  </div>
                  {reviews.map((review) => (
                    <div
                      key={review.id}
                      className="rounded-xl border border-border bg-card p-4 shadow-sm"
                    >
                      <div className="flex items-start gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                            {reviewerInitials(review.reviewer?.full_name || null)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-foreground">
                              {review.reviewer?.full_name || 'Anonymous'}
                            </p>
                            <span className="text-xs text-muted-foreground">
                              {new Date(review.created_at).toLocaleDateString('en-GH', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })}
                            </span>
                          </div>
                          <RatingStars rating={review.rating} showValue={false} size={14} className="mt-1" />
                          {review.comment && (
                            <p className="mt-2 text-sm text-muted-foreground">
                              {review.comment}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={Star}
                  title="No reviews yet"
                  description={`Be the first to review ${vendor.business_name}. Sign in to share your experience.`}
                />
              )}
            </TabsContent>

            {/* About tab */}
            <TabsContent value="about" className="mt-4">
              <div className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-6">
                <div>
                  <h3 className="font-display font-semibold text-foreground">About {vendor.business_name}</h3>
                  <p className="mt-2 text-sm text-muted-foreground text-pretty">
                    {vendor.description || 'No description available.'}
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <h4 className="text-xs font-semibold uppercase text-muted-foreground">Category</h4>
                    <p className="mt-1 text-sm text-foreground">{vendor.business_type}</p>
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold uppercase text-muted-foreground">Business type</h4>
                    <p className="mt-1 text-sm text-foreground">
                      {vendor.is_student_business ? 'Student Business' : 'External Business'}
                    </p>
                  </div>
                  {vendor.contact_phone && (
                    <div>
                      <h4 className="text-xs font-semibold uppercase text-muted-foreground">Phone</h4>
                      <p className="mt-1 text-sm text-foreground">{vendor.contact_phone}</p>
                    </div>
                  )}
                  {vendor.contact_email && (
                    <div>
                      <h4 className="text-xs font-semibold uppercase text-muted-foreground">Email</h4>
                      <p className="mt-1 text-sm text-foreground">{vendor.contact_email}</p>
                    </div>
                  )}
                  {vendor.website_url && (
                    <div>
                      <h4 className="text-xs font-semibold uppercase text-muted-foreground">Website</h4>
                      <a
                        href={vendor.website_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 block text-sm text-primary hover:underline"
                      >
                        {vendor.website_url}
                      </a>
                    </div>
                  )}
                </div>

                {openingHours && Object.keys(openingHours).length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase text-muted-foreground">Opening hours</h4>
                    <div className="mt-2 space-y-1">
                      {['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((day) => {
                        const hours = openingHours[day];
                        return (
                          <div key={day} className="flex justify-between text-sm">
                            <span className="capitalize text-muted-foreground">{day}</span>
                            <span className="text-foreground">
                              {hours ? `${hours.open} – ${hours.close}` : 'Closed'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Sidebar */}
        <aside className="space-y-4">
          {/* Location */}
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <h3 className="mb-3 font-display font-semibold text-foreground">Location</h3>
            {hasPublicMap && (destination || mapHref) ? (
              <MapPreview
                latitude={destination?.latitude ?? null}
                longitude={destination?.longitude ?? null}
                placeId={destination?.placeId}
                label={vendor.business_name}
                address={location?.address_line}
                city={location?.city}
                mapsUrl={mapHref}
              />
            ) : <p className="text-sm text-muted-foreground">No public shop pin.</p>}
          </div>

          {/* Contact */}
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <h3 className="mb-3 font-display font-semibold text-foreground">Contact</h3>
            <div className="space-y-2 text-sm">
              {vendor.contact_phone && (
                <a href={`tel:${vendor.contact_phone}`} className="flex items-center gap-2 text-foreground hover:text-primary">
                  <Phone className="h-4 w-4 text-primary" />
                  {vendor.contact_phone}
                </a>
              )}
              {vendor.contact_email && (
                <a href={`mailto:${vendor.contact_email}`} className="flex items-center gap-2 text-foreground hover:text-primary">
                  <Mail className="h-4 w-4 text-primary" />
                  {vendor.contact_email}
                </a>
              )}
              {location?.address_line && (
                <div className="flex items-start gap-2 text-muted-foreground">
                  <MapPin className="mt-0.5 h-4 w-4 text-primary" />
                  <span>{location.address_line}, {location.city}</span>
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* Related businesses */}
      {relatedVendors.length > 0 && (
        <div className="mt-10">
          <h2 className="mb-4 font-display text-lg font-semibold text-foreground">
            Similar businesses
          </h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {relatedVendors.map((rv) => (
              <BusinessCard key={rv.id} vendor={rv} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
