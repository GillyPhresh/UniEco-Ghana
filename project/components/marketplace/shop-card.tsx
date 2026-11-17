import Link from 'next/link';
import { MapPin, Navigation, Star, Store, Truck } from 'lucide-react';
import { CatalogPhoto } from './catalog-photo';
import { catalogPhotos, publicShopDestination, type MarketplaceShop } from '@/lib/marketplace/catalog';
import { getGoogleMapsDirectionsUrl } from '@/lib/maps';

export function ShopCard({ shop, distance }: { shop: MarketplaceShop; distance?: number }) {
  const href = `/business/${encodeURIComponent(shop.business_slug)}`;
  const destination = publicShopDestination(shop);
  const directions = destination ? getGoogleMapsDirectionsUrl(destination) : null;
  const hasPhotos = shop.photos.length > 0;
  const photos = hasPhotos ? shop.photos : catalogPhotos(shop.logo_url);
  const rating = Number(shop.rating_avg);
  const rated = shop.rating_count > 0 && Number.isFinite(rating) && rating > 0;
  const area = shop.university?.short_name || shop.university?.name || (destination ? shop.location?.city : null);

  return (
    <article className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md">
      <Link href={href} className="group relative block aspect-[16/9] overflow-hidden bg-muted outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary" aria-label={`Open ${shop.business_name}`}>
        <CatalogPhoto sources={photos} alt="" sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" contain={!hasPhotos} fallback={Store} />
        {shop.is_temporarily_closed && <span className="absolute left-3 top-3 rounded-full bg-background px-2.5 py-1 text-xs font-semibold">Temporarily closed</span>}
        {distance !== undefined && <span className="absolute bottom-3 left-3 rounded-full bg-background px-2.5 py-1 text-xs font-semibold">~{distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1)} km`}</span>}
      </Link>
      <div className="space-y-2.5 p-3.5 sm:p-4">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <Link href={href} className="min-w-0 text-pretty text-base font-bold leading-snug hover:text-primary">{shop.business_name}</Link>
          <Link href={`${href}?tab=reviews#shop-sections`} className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full bg-muted px-2.5 text-xs font-semibold hover:bg-muted/80"
            aria-label={rated ? `${rating.toFixed(1)} out of 5, ${shop.rating_count} reviews for ${shop.business_name}` : `Reviews for ${shop.business_name}: no ratings yet`}>
            <Star className={rated ? 'h-4 w-4 fill-amber-400 text-amber-500' : 'h-4 w-4 text-muted-foreground'} aria-hidden="true" />
            {rated ? <>{rating.toFixed(1)} <span className="font-normal text-muted-foreground">({shop.rating_count})</span></> : 'No ratings'}
          </Link>
        </div>
        {(area || shop.category) && <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span className="truncate">{[area, shop.category].filter(Boolean).join(' · ')}</span>
        </p>}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {directions && <a href={directions} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg text-sm font-semibold text-primary hover:underline">
            <Navigation className="h-4 w-4" aria-hidden="true" /> Directions
          </a>}
          {shop.delivery_available && !shop.is_temporarily_closed && <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Truck className="h-4 w-4" aria-hidden="true" /> Delivery
          </span>}
        </div>
      </div>
    </article>
  );
}
