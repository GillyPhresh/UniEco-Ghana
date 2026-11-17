import { isValidCoordinate } from '../maps';
import { isOptimizablePublicImage } from '../utils/optimized-image';
import type { Product, Service, Vendor } from '../types';

export type CatalogTab = 'products' | 'shops' | 'services';
export type CatalogSort = 'newest' | 'rating' | 'price_low' | 'price_high';
export type Coordinates = { latitude: number; longitude: number };

export interface ShopFilters {
  query?: string;
  category?: string;
  universityId?: string;
  deliveryOnly?: boolean;
  sort?: string;
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
}

export type CatalogVendor = Pick<Vendor, 'id' | 'business_name' | 'business_slug' | 'logo_url'
  | 'rating_avg' | 'rating_count' | 'delivery_available' | 'is_temporarily_closed'>;
export type CatalogProduct = Pick<Product, 'id' | 'name' | 'price' | 'currency' | 'stock' | 'image_url' | 'images'
  | 'discount_price' | 'low_stock_threshold' | 'business_id'> & { vendor?: CatalogVendor };
export type CatalogService = Pick<Service, 'id' | 'name' | 'price' | 'currency' | 'duration_estimate'
  | 'image_url' | 'images'> & { vendor?: CatalogVendor };
export type ShopCampus = { id: string; name: string; short_name: string | null };
export type ShopLocation = { address_line: string | null; city: string | null; region: string | null };

export type MarketplaceShop = CatalogVendor & Pick<Vendor, 'cover_image_url' | 'location_place_id'
  | 'location_public_visibility' | 'location_verification_status' | 'gps_latitude' | 'gps_longitude'>
  & { university: ShopCampus | null; category: string | null; location: ShopLocation | null; photos: string[] };

export const SHOP_PAGE_SIZE = 16;
export const NEARBY_SHOP_LIMIT = 200;
export const NEARBY_SHOP_RADIUS_KM = 50;
// PostgREST caps a single response; this also bounds discounted-price merging.
export const SHOP_BROWSE_LIMIT = 480;

export function catalogRange(offset = 0, limit = SHOP_PAGE_SIZE) {
  const start = Math.max(0, Math.min(SHOP_BROWSE_LIMIT - 1, Math.trunc(offset) || 0));
  const size = Math.max(1, Math.min(32, Math.trunc(limit) || SHOP_PAGE_SIZE, SHOP_BROWSE_LIMIT - start));
  return { start, size, end: start + size - 1 };
}

export function firstRelation<T>(value?: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

/** Return only safe public image URLs. Never proxy arbitrary seller-provided URLs. */
export function catalogPhotos(...candidates: unknown[]): string[] {
  const unique = new Set<string>();
  for (const candidate of candidates.flat()) {
    if (typeof candidate !== 'string' || candidate.length > 2048) continue;
    const value = candidate.trim();
    const local = /^\/assets\/[^\s\\?#]+\.(?:webp|avif|png|jpe?g)$/i.test(value)
      && !/(?:^|\/)\.\.(?:\/|$)|%|\\/.test(value);
    if (local || isOptimizablePublicImage(value)) unique.add(value);
    if (unique.size === 12) break;
  }
  return Array.from(unique);
}

export function catalogPrice(item: { price: number; discount_price?: number | null }) {
  return Number(item.discount_price ?? item.price);
}

export function formatCatalogPrice(price: number, currency = 'GHS') {
  const value = new Intl.NumberFormat('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
  return currency === 'GHS' ? `GH₵${value}` : `${currency} ${value}`;
}

/** Stream order and merge order must use the same deterministic tie-breaker. */
export function compareCatalogPrice(
  a: { id: string; price: number; discount_price?: number | null },
  b: { id: string; price: number; discount_price?: number | null },
  descending = false,
) {
  return (catalogPrice(a) - catalogPrice(b)) * (descending ? -1 : 1)
    || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export function publicShopDestination(shop: Pick<MarketplaceShop, 'business_name' | 'location_public_visibility'
  | 'location_verification_status' | 'gps_latitude' | 'gps_longitude' | 'location_place_id' | 'location'>) {
  if (shop.location_public_visibility !== 'business_location' || shop.location_verification_status !== 'verified') {
    return null;
  }
  const latitude = shop.gps_latitude;
  const longitude = shop.gps_longitude;
  const pin = isValidCoordinate(latitude, longitude) && !(latitude === 0 && longitude === 0)
    ? { latitude: latitude as number, longitude: longitude as number } : null;
  const street = shop.location?.address_line?.trim();
  const address = street ? [street, shop.location?.city, shop.location?.region, 'Ghana'].filter(Boolean).join(', ') : null;
  const placeId = shop.location_place_id ?? null;
  if (!pin && !address && !placeId) return null;
  return { ...pin, address: address ?? (placeId ? `${shop.business_name}, Ghana` : null), placeId };
}

export function shopDistanceKm(origin: Coordinates, destination: Coordinates) {
  const radians = (value: number) => value * Math.PI / 180;
  const latitudeDelta = radians(destination.latitude - origin.latitude);
  const longitudeDelta = radians(destination.longitude - origin.longitude);
  const value = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(origin.latitude)) * Math.cos(radians(destination.latitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, value))));
}

export function findNearbyShops(shops: MarketplaceShop[], origin: Coordinates) {
  if (!isValidCoordinate(origin.latitude, origin.longitude)) return [];
  return shops.flatMap(shop => {
    const destination = publicShopDestination(shop);
    const { latitude, longitude } = destination ?? {};
    if (latitude == null || longitude == null) return [];
    const distance = shopDistanceKm(origin, { latitude, longitude });
    return distance <= NEARBY_SHOP_RADIUS_KM ? [{ shop, distance }] : [];
  }).sort((a, b) => a.distance - b.distance || a.shop.business_name.localeCompare(b.shop.business_name));
}
