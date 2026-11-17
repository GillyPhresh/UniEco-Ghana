'use client';

import { supabase } from '@/lib/supabase/client';
import { normalizeSearchTerm } from '@/lib/utils/search';
import {
  catalogPhotos, catalogRange, firstRelation, NEARBY_SHOP_LIMIT,
  type CatalogService, type CatalogVendor, type MarketplaceShop, type ShopCampus, type ShopFilters,
} from '@/lib/marketplace/catalog';

const VENDOR_SUMMARY_FIELDS = 'id,business_name,business_slug,logo_url,rating_avg,rating_count,delivery_available,is_temporarily_closed';

export async function getShopCampuses(signal?: AbortSignal): Promise<ShopCampus[]> {
  let query = supabase.from('universities').select('id,name,short_name').order('name').limit(500);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw new Error('Campuses could not load.');
  return (data ?? []) as ShopCampus[];
}

export async function searchMarketplaceServices(params: ShopFilters) {
  const { start, end } = catalogRange(params.offset, params.limit);
  const term = normalizeSearchTerm(params.query || '');
  let query = supabase.from('services').select(`
    id,name,price,currency,duration_estimate,image_url,images,
    business:businesses!inner(category,vendor:vendors!inner(${VENDOR_SUMMARY_FIELDS}))
  `, { count: 'exact' })
    .eq('is_active', true).eq('is_archived', false).eq('business.is_active', true)
    .eq('business.vendor.is_active', true).eq('business.vendor.is_verified', true);
  if (term) query = query.or(`name.ilike.%${term}%,description.ilike.%${term}%`);
  if (params.category) query = query.eq('business.category', params.category);
  if (params.universityId) query = query.eq('business.vendor.university_id', params.universityId);
  if (params.deliveryOnly) query = query.eq('business.vendor.delivery_available', true).eq('business.vendor.is_temporarily_closed', false);
  query = params.sort === 'price_low' || params.sort === 'price_high'
    ? query.order('price', { ascending: params.sort === 'price_low' })
    : query.order('created_at', { ascending: false });
  if (params.signal) query = query.abortSignal(params.signal);
  const { data, count, error } = await query.order('id').range(start, end);
  if (error) throw new Error('Services could not load.');
  type RelatedBusiness = { vendor: CatalogVendor | CatalogVendor[] };
  type Row = CatalogService & { business: RelatedBusiness | RelatedBusiness[] };
  const items: CatalogService[] = (data as unknown as Row[] ?? []).map(({ business, ...item }) => ({
    ...item, vendor: firstRelation(firstRelation(business)?.vendor) ?? undefined,
  }));
  return { items, total: count ?? items.length };
}

type PinRow = Pick<MarketplaceShop, 'id' | 'gps_latitude' | 'gps_longitude' | 'location_place_id'>;

export async function searchMarketplaceShops(params: ShopFilters & { nearby?: boolean }) {
  const { start, end } = catalogRange(params.offset, params.limit);
  const term = normalizeSearchTerm(params.query || '');
  let query = supabase.from('vendors').select(`
    ${VENDOR_SUMMARY_FIELDS}, cover_image_url, location_public_visibility, location_verification_status,
    university:universities(id,name,short_name),
    businesses${params.category ? '!inner' : ''}(category),
    gallery:business_gallery(image_url)
  `, { count: 'exact' }).eq('is_active', true).eq('is_verified', true)
    .eq('businesses.is_active', true).limit(3, { referencedTable: 'businesses' })
    .order('sort_order', { referencedTable: 'gallery' }).limit(3, { referencedTable: 'gallery' });
  if (term) query = query.or(`business_name.ilike.%${term}%,description.ilike.%${term}%`);
  if (params.category) query = query.eq('businesses.category', params.category);
  if (params.universityId) query = query.eq('university_id', params.universityId);
  if (params.deliveryOnly) query = query.eq('delivery_available', true).eq('is_temporarily_closed', false);
  if (params.nearby) {
    query = query.eq('location_public_visibility', 'business_location').eq('location_verification_status', 'verified')
      .not('gps_latitude', 'is', null).not('gps_longitude', 'is', null);
  }
  query = params.sort === 'rating'
    ? query.order('rating_avg', { ascending: false }).order('rating_count', { ascending: false })
    : query.order('created_at', { ascending: false });
  if (params.signal) query = query.abortSignal(params.signal);
  const { data, count, error } = await query.order('id').range(params.nearby ? 0 : start, params.nearby ? NEARBY_SHOP_LIMIT - 1 : end);
  if (error) throw new Error('Shops could not load.');

  type Row = Omit<MarketplaceShop, 'university' | 'category' | 'location' | 'photos' | 'gps_latitude' | 'gps_longitude' | 'location_place_id'> & {
    university: ShopCampus | ShopCampus[] | null;
    businesses: { category: string | null }[] | null;
    gallery: { image_url: string }[] | null;
  };
  const shops = data as unknown as Row[] ?? [];
  const publicPinIds = shops.filter(shop => shop.location_public_visibility === 'business_location'
    && shop.location_verification_status === 'verified').map(shop => shop.id);
  // Never request exact addresses or pins for non-public shops. Shopper coordinates are local.
  const pins: PinRow[] = [];
  for (let index = 0; index < publicPinIds.length; index += 40) {
    let pinQuery = supabase.from('vendors').select('id,gps_latitude,gps_longitude,location_place_id')
      .in('id', publicPinIds.slice(index, index + 40)).eq('is_active', true).eq('is_verified', true)
      .eq('location_public_visibility', 'business_location').eq('location_verification_status', 'verified');
    if (params.signal) pinQuery = pinQuery.abortSignal(params.signal);
    const { data: pinData, error: pinError } = await pinQuery;
    if (pinError && params.nearby) throw new Error('Shop locations could not load.');
    pins.push(...((pinData ?? []) as unknown as PinRow[]));
  }
  const pinById = new Map(pins.map(pin => [pin.id, pin]));
  const items: MarketplaceShop[] = shops.map(({ university, businesses, gallery, ...shop }) => {
    const pin = pinById.get(shop.id);
    return {
      ...shop, university: firstRelation(university), category: businesses?.find(row => row.category)?.category ?? null,
      photos: catalogPhotos(shop.cover_image_url, gallery?.map(row => row.image_url)),
      gps_latitude: pin?.gps_latitude ?? null, gps_longitude: pin?.gps_longitude ?? null,
      location_place_id: pin?.location_place_id ?? null, location: null,
    };
  });
  return { items, total: count ?? items.length };
}

export const shopCartCountKey = (userId?: string) => ['marketplace-cart-count', userId] as const;

export async function getShopCartCount(userId: string, signal?: AbortSignal): Promise<number> {
  let query = supabase.from('carts').select('items:cart_items(quantity,save_for_later)').eq('user_id', userId);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error('Cart could not load.');
  return (data?.items ?? []).reduce((total, item) => total + (item.save_for_later ? 0 : Number(item.quantity) || 0), 0);
}
