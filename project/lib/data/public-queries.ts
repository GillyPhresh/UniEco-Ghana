import { createClient } from '@/lib/supabase/server';
import type {
  Vendor,
  Business,
  Product,
  Service,
  EventItem,
  Review,
  University,
  Location,
} from '@/lib/types';
import { CATEGORY_ICONS, ALL_CATEGORIES } from '@/lib/constants/categories';
import type { VendorWithRelations } from '@/lib/types/extended';

export { CATEGORY_ICONS, ALL_CATEGORIES };
export type { VendorWithRelations };

export interface BusinessWithRelations extends Business {
  vendor?: Pick<Vendor, 'id' | 'business_name' | 'business_slug' | 'is_verified' | 'is_student_business' | 'rating_avg' | 'rating_count' | 'contact_phone' | 'contact_email' | 'opening_hours'>;
  university?: Pick<University, 'id' | 'name' | 'short_name' | 'slug'>;
  location?: Location | null;
}

export async function getUniversities() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('universities')
    .select('id, name, short_name, slug, city, region, logo_url, hero_image_url, logo_alt_text, hero_alt_text, description, is_enabled')
    .eq('is_enabled', true)
    .order('name');
  return data as Pick<University, 'id' | 'name' | 'short_name' | 'slug' | 'city' | 'region' | 'logo_url' | 'hero_image_url' | 'logo_alt_text' | 'hero_alt_text' | 'description' | 'is_enabled'>[];
}

export async function getUniversityBySlug(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('universities')
    .select('*')
    .eq('slug', slug)
    .eq('is_enabled', true)
    .maybeSingle();
  return data as University | null;
}

export async function getFeaturedVendors(limit = 8) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('vendors')
    .select(`
      *,
      university:universities(id, name, short_name, slug),
      location:locations!locations_owner_id_fkey(label, address_line, city, latitude, longitude)
    `)
    .eq('is_active', true)
    .order('rating_avg', { ascending: false })
    .limit(limit);
  return (data || []) as unknown as VendorWithRelations[];
}

export async function getVendorsByUniversity(universityId: string, limit = 20) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('vendors')
    .select(`
      *,
      university:universities(id, name, short_name, slug),
      location:locations!locations_owner_id_fkey(label, address_line, city, latitude, longitude)
    `)
    .eq('is_active', true)
    .eq('university_id', universityId)
    .order('rating_avg', { ascending: false })
    .limit(limit);
  return (data || []) as unknown as VendorWithRelations[];
}

export async function getVendorBySlug(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('vendors')
    .select(`
      *,
      university:universities(*)
    `)
    .eq('business_slug', slug)
    .eq('is_active', true)
    .maybeSingle();
  return data as unknown as VendorWithRelations | null;
}

export async function getVendorLocation(vendorId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('locations')
    .select('*')
    .eq('owner_id', vendorId)
    .maybeSingle();
  return data as Location | null;
}

export async function getVendorProducts(vendorId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('products')
    .select(`
      *,
      business:businesses(id, name, slug, vendor_id)
    `)
    .eq('is_active', true)
    .eq('business.vendor_id', vendorId)
    .order('name');
  return (data || []) as unknown as (Product & { business: Pick<Business, 'id' | 'name' | 'slug' | 'vendor_id'> })[];
}

export async function getVendorServices(vendorId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('services')
    .select(`
      *,
      business:businesses(id, name, slug, vendor_id)
    `)
    .eq('is_active', true)
    .eq('business.vendor_id', vendorId)
    .order('name');
  return (data || []) as unknown as (Service & { business: Pick<Business, 'id' | 'name' | 'slug' | 'vendor_id'> })[];
}

export async function getVendorReviews(vendorId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('reviews')
    .select(`
      *,
      reviewer:profiles!reviews_reviewer_id_fkey(full_name, avatar_url)
    `)
    .eq('vendor_id', vendorId)
    .eq('is_approved', true)
    .order('created_at', { ascending: false });
  return (data || []) as unknown as (Review & { reviewer: { full_name: string | null; avatar_url: string | null } | null })[];
}

export async function getRelatedVendors(vendor: Vendor, limit = 4) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('vendors')
    .select(`
      *,
      university:universities(id, name, short_name, slug)
    `)
    .eq('is_active', true)
    .eq('business_type', vendor.business_type)
    .neq('id', vendor.id)
    .order('rating_avg', { ascending: false })
    .limit(limit);
  return (data || []) as unknown as VendorWithRelations[];
}

export async function getPublishedEvents(limit = 6) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('events')
    .select(`
      *,
      university:universities(id, name, short_name, slug)
    `)
    .eq('is_published', true)
    .order('start_time', { ascending: true })
    .limit(limit);
  return (data || []) as unknown as (EventItem & { university: Pick<University, 'id' | 'name' | 'short_name' | 'slug'> | null })[];
}

export async function getEventsByUniversity(universityId: string, limit = 6) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('events')
    .select(`
      *,
      university:universities(id, name, short_name, slug)
    `)
    .eq('is_published', true)
    .eq('university_id', universityId)
    .order('start_time', { ascending: true })
    .limit(limit);
  return (data || []) as unknown as (EventItem & { university: Pick<University, 'id' | 'name' | 'short_name' | 'slug'> | null })[];
}

export async function getEventBySlug(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('events')
    .select(`
      *,
      university:universities(*)
    `)
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle();
  return data as unknown as (EventItem & { university: University | null }) | null;
}

export async function getVendorCountByUniversity(universityId: string) {
  const supabase = await createClient();
  const { count } = await supabase
    .from('vendors')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)
    .eq('university_id', universityId);
  return count || 0;
}

export async function getTotalVendorCount() {
  const supabase = await createClient();
  const { count } = await supabase
    .from('vendors')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true);
  return count || 0;
}

export async function getTotalReviewCount() {
  const supabase = await createClient();
  const { count } = await supabase
    .from('reviews')
    .select('*', { count: 'exact', head: true })
    .eq('is_approved', true);
  return count || 0;
}

export async function getTotalProductCount() {
  const supabase = await createClient();
  const { count } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true);
  return count || 0;
}

export async function getCategoryCounts() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('vendors')
    .select('business_type')
    .eq('is_active', true)
    .not('business_type', 'is', null);
  const counts: Record<string, number> = {};
  (data || []).forEach((v) => {
    const cat = v.business_type as string;
    if (cat) counts[cat] = (counts[cat] || 0) + 1;
  });
  return counts;
}

export async function searchAll(query: string, limit = 20) {
  const supabase = await createClient();
  const [vendorsResult, productsResult, eventsResult] = await Promise.all([
    supabase
      .from('vendors')
      .select(`id, business_name, business_slug, business_type, description, rating_avg, rating_count, is_verified, is_student_business, university:universities(id, name, short_name, slug)`)
      .eq('is_active', true)
      .or(`business_name.ilike.%${query}%,description.ilike.%${query}%,business_type.ilike.%${query}%`)
      .limit(limit),
    supabase
      .from('products')
      .select(`id, name, slug, description, price, currency, image_url, business:businesses(id, name, slug, vendor_id)`)
      .eq('is_active', true)
      .or(`name.ilike.%${query}%,description.ilike.%${query}%`)
      .limit(limit),
    supabase
      .from('events')
      .select(`id, title, slug, description, start_time, location, university:universities(id, name, short_name, slug)`)
      .eq('is_published', true)
      .or(`title.ilike.%${query}%,description.ilike.%${query}%`)
      .limit(limit),
  ]);
  return {
    vendors: vendorsResult.data || [],
    products: productsResult.data || [],
    events: eventsResult.data || [],
  };
}
