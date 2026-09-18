'use client';

import { supabase } from '@/lib/supabase/client';
import type { Vendor, Product, Service, Subscription, Review } from '@/lib/types';
import type {
  BusinessGalleryItem,
  BusinessHour,
  BusinessHoliday,
  Invoice,
  AdRequest,
  AdType,
  ReviewResponse,
  ReviewWithResponse,
  VendorAnalytics,
  VendorSettings,
} from '@/lib/types/vendor';

// ============================================================
// Vendor Profile
// ============================================================

export async function getVendorProfile(): Promise<Vendor | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('vendors')
    .select('*')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: true })
    .maybeSingle();

  return data as Vendor | null;
}

export async function updateVendorProfile(
  vendorId: string,
  updates: Partial<Pick<Vendor,
    'business_name' | 'description' | 'business_type' |
    'logo_url' | 'cover_image_url' | 'contact_phone' |
    'contact_email' | 'website_url' | 'whatsapp_number' |
    'social_links' | 'delivery_available' | 'service_radius_km' |
    'gps_latitude' | 'gps_longitude' | 'is_temporarily_closed'
  >>
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('vendors')
    .update(updates)
    .eq('id', vendorId);
  return { error: error?.message || null };
}

export function calculateVendorProfileCompletion(vendor: Partial<Vendor>): number {
  const fields = [
    'business_name', 'business_type', 'description',
    'logo_url', 'cover_image_url', 'contact_phone',
    'contact_email', 'website_url', 'whatsapp_number',
  ] as const;

  let completed = 0;
  for (const field of fields) {
    const val = vendor[field];
    if (val !== null && val !== undefined && val !== '') completed++;
  }

  if (vendor.social_links && Object.keys(vendor.social_links).length > 0) completed++;
  if (vendor.gps_latitude !== null && vendor.gps_latitude !== undefined) completed++;

  return Math.round((completed / 11) * 100);
}

// ============================================================
// Products
// ============================================================

export async function getVendorProducts(vendorId: string, includeArchived = false): Promise<(Product & { business: { id: string; name: string; slug: string } })[]> {
  let query = supabase
    .from('products')
    .select(`
      *,
      business:businesses(id, name, slug)
    `)
    .eq('business.vendor_id', vendorId)
    .order('created_at', { ascending: false });

  if (!includeArchived) {
    query = query.eq('is_archived', false);
  }

  const { data } = await query;
  return (data || []) as unknown as (Product & { business: { id: string; name: string; slug: string } })[];
}

export async function createProduct(product: {
  business_id: string;
  name: string;
  description?: string;
  price: number;
  discount_price?: number | null;
  stock: number;
  sku?: string;
  tags?: string[];
  images?: string[];
  image_url?: string | null;
  is_active?: boolean;
  low_stock_threshold?: number;
}): Promise<{ data: Product | null; error: string | null }> {
  const slug = product.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('products')
    .insert({
      ...product,
      slug: `${slug}-${Date.now().toString(36)}`,
      university_id: null,
      currency: 'GHS',
    })
    .select('*')
    .single();

  return { data: data as Product | null, error: error?.message || null };
}

export async function updateProduct(
  productId: string,
  updates: Partial<Pick<Product,
    'name' | 'description' | 'price' | 'discount_price' |
    'stock' | 'sku' | 'tags' | 'images' | 'image_url' |
    'is_active' | 'low_stock_threshold'
  >>
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('products')
    .update(updates)
    .eq('id', productId);
  return { error: error?.message || null };
}

export async function archiveProduct(productId: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('products')
    .update({ is_archived: true, is_active: false })
    .eq('id', productId);
  return { error: error?.message || null };
}

export async function restoreProduct(productId: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('products')
    .update({ is_archived: false, is_active: true })
    .eq('id', productId);
  return { error: error?.message || null };
}

export async function deleteProduct(productId: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', productId);
  return { error: error?.message || null };
}

export function getStockStatus(product: Pick<Product, 'stock' | 'low_stock_threshold' | 'is_active'>): {
  status: 'in_stock' | 'low_stock' | 'out_of_stock' | 'inactive';
  label: string;
  color: string;
} {
  if (!product.is_active) return { status: 'inactive', label: 'Inactive', color: 'muted' };
  if (product.stock === 0) return { status: 'out_of_stock', label: 'Out of stock', color: 'error' };
  if (product.stock <= product.low_stock_threshold) return { status: 'low_stock', label: 'Low stock', color: 'warning' };
  return { status: 'in_stock', label: 'In stock', color: 'success' };
}

// ============================================================
// Services
// ============================================================

export async function getVendorServices(vendorId: string, includeArchived = false): Promise<(Service & { business: { id: string; name: string; slug: string } })[]> {
  let query = supabase
    .from('services')
    .select(`
      *,
      business:businesses(id, name, slug)
    `)
    .eq('business.vendor_id', vendorId)
    .order('created_at', { ascending: false });

  if (!includeArchived) {
    query = query.eq('is_archived', false);
  }

  const { data } = await query;
  return (data || []) as unknown as (Service & { business: { id: string; name: string; slug: string } })[];
}

export async function createService(service: {
  business_id: string;
  name: string;
  description?: string;
  price: number;
  duration_estimate?: string;
  images?: string[];
  image_url?: string | null;
  is_active?: boolean;
}): Promise<{ data: Service | null; error: string | null }> {
  const slug = service.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const { data, error } = await supabase
    .from('services')
    .insert({
      ...service,
      slug: `${slug}-${Date.now().toString(36)}`,
      university_id: null,
      currency: 'GHS',
    })
    .select('*')
    .single();

  return { data: data as Service | null, error: error?.message || null };
}

export async function updateService(
  serviceId: string,
  updates: Partial<Pick<Service,
    'name' | 'description' | 'price' | 'duration_estimate' |
    'images' | 'image_url' | 'is_active'
  >>
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('services')
    .update(updates)
    .eq('id', serviceId);
  return { error: error?.message || null };
}

export async function archiveService(serviceId: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('services')
    .update({ is_archived: true, is_active: false })
    .eq('id', serviceId);
  return { error: error?.message || null };
}

export async function restoreService(serviceId: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('services')
    .update({ is_archived: false, is_active: true })
    .eq('id', serviceId);
  return { error: error?.message || null };
}

export async function deleteService(serviceId: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('services')
    .delete()
    .eq('id', serviceId);
  return { error: error?.message || null };
}

// ============================================================
// Business Gallery
// ============================================================

export async function getGalleryImages(vendorId: string): Promise<BusinessGalleryItem[]> {
  const { data } = await supabase
    .from('business_gallery')
    .select('*')
    .eq('vendor_id', vendorId)
    .order('sort_order', { ascending: true });
  return (data || []) as BusinessGalleryItem[];
}

export async function addGalleryImage(
  vendorId: string,
  image: { image_url: string; caption?: string; image_type?: string; sort_order?: number }
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('business_gallery')
    .insert({
      vendor_id: vendorId,
      image_url: image.image_url,
      caption: image.caption || null,
      image_type: image.image_type || 'general',
      sort_order: image.sort_order || 0,
    });
  return { error: error?.message || null };
}

export async function updateGalleryImage(
  id: string,
  updates: Partial<Pick<BusinessGalleryItem, 'caption' | 'image_type' | 'sort_order'>>
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('business_gallery')
    .update(updates)
    .eq('id', id);
  return { error: error?.message || null };
}

export async function deleteGalleryImage(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('business_gallery')
    .delete()
    .eq('id', id);
  return { error: error?.message || null };
}

// ============================================================
// Business Hours
// ============================================================

export async function getBusinessHours(vendorId: string): Promise<BusinessHour[]> {
  const { data } = await supabase
    .from('business_hours')
    .select('*')
    .eq('vendor_id', vendorId)
    .order('day_of_week', { ascending: true });
  return (data || []) as BusinessHour[];
}

export async function upsertBusinessHours(vendorId: string, hours: Omit<BusinessHour, 'id' | 'vendor_id'>[]): Promise<{ error: string | null }> {
  const rows = hours.map(h => ({ ...h, vendor_id: vendorId }));

  const { error: deleteError } = await supabase
    .from('business_hours')
    .delete()
    .eq('vendor_id', vendorId);

  if (deleteError) return { error: deleteError.message };

  if (rows.length === 0) return { error: null };

  const { error } = await supabase
    .from('business_hours')
    .insert(rows);
  return { error: error?.message || null };
}

export function getBusinessStatus(hours: BusinessHour[], isTemporarilyClosed: boolean): {
  status: 'open' | 'closing_soon' | 'closed';
  label: string;
  color: string;
} {
  if (isTemporarilyClosed) return { status: 'closed', label: 'Temporarily Closed', color: 'error' };

  const now = new Date();
  const dayOfWeek = now.getDay();
  const currentTime = now.toTimeString().slice(0, 5);

  const todayHours = hours.find(h => h.day_of_week === dayOfWeek);
  if (!todayHours || !todayHours.is_open || !todayHours.open_time || !todayHours.close_time) {
    return { status: 'closed', label: 'Closed', color: 'error' };
  }

  if (currentTime >= todayHours.open_time && currentTime < todayHours.close_time) {
    const closeHour = parseInt(todayHours.close_time.slice(0, 2));
    const currentHour = now.getHours();
    if (closeHour - currentHour <= 1) {
      return { status: 'closing_soon', label: 'Closing Soon', color: 'warning' };
    }
    return { status: 'open', label: 'Open', color: 'success' };
  }

  return { status: 'closed', label: 'Closed', color: 'error' };
}

// ============================================================
// Business Holidays
// ============================================================

export async function getHolidays(vendorId: string): Promise<BusinessHoliday[]> {
  const { data } = await supabase
    .from('business_holidays')
    .select('*')
    .eq('vendor_id', vendorId)
    .order('holiday_date', { ascending: true });
  return (data || []) as BusinessHoliday[];
}

export async function addHoliday(vendorId: string, holiday: { holiday_date: string; description?: string }): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('business_holidays')
    .insert({
      vendor_id: vendorId,
      holiday_date: holiday.holiday_date,
      description: holiday.description || null,
    });
  return { error: error?.message || null };
}

export async function deleteHoliday(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('business_holidays')
    .delete()
    .eq('id', id);
  return { error: error?.message || null };
}

// ============================================================
// Subscriptions
// ============================================================

export async function getVendorSubscription(vendorId: string): Promise<Subscription | null> {
  const { data } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('vendor_id', vendorId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as Subscription | null;
}

export async function getAllSubscriptions(vendorId: string): Promise<Subscription[]> {
  const { data } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('vendor_id', vendorId)
    .order('created_at', { ascending: false });
  return (data || []) as Subscription[];
}

export async function activateSubscription(
  vendorId: string,
  plan: string,
  amount: number,
  paymentMethod: string,
  paymentReference: string
): Promise<{ error: string | null }> {
  void vendorId;
  void plan;
  void amount;
  void paymentMethod;
  void paymentReference;
  return { error: 'Subscriptions activate only after a verified provider payment.' };
}

// ============================================================
// Invoices
// ============================================================

export async function getVendorInvoices(vendorId: string): Promise<Invoice[]> {
  const { data } = await supabase
    .from('invoices')
    .select('*')
    .eq('vendor_id', vendorId)
    .order('created_at', { ascending: false });
  return (data || []) as Invoice[];
}

export async function createInvoice(params: {
  vendor_id: string;
  invoice_type: 'subscription' | 'advertisement';
  reference_id?: string;
  amount: number;
  payment_reference?: string;
  status?: 'paid' | 'pending';
}): Promise<{ data: Invoice | null; error: string | null }> {
  void params;
  return {
    data: null,
    error: 'Invoices are issued only from verified payment workflows.',
  };
}

// ============================================================
// Ad Requests
// ============================================================

export async function getAdRequests(vendorId: string): Promise<AdRequest[]> {
  void vendorId;
  const { data } = await supabase
    .from('ad_campaigns')
    .select('*')
    .order('created_at', { ascending: false });
  return (data || []).map((campaign: Record<string, unknown>) => ({
    ...campaign,
    ad_type: campaign.placement === 'featured_vendor' ? 'featured_business' : campaign.placement === 'campus_banner' ? 'homepage_banner' : 'search_promotion',
    requested_duration_days: Math.max(1, Math.ceil((new Date(String(campaign.ends_at)).getTime() - new Date(String(campaign.starts_at)).getTime()) / 86_400_000)),
    estimated_cost: campaign.requested_budget || 0,
    estimated_reach: null,
    admin_note: campaign.rejection_reason || null,
  })) as unknown as AdRequest[];
}

export async function createAdRequest(params: {
  vendor_id: string;
  ad_type: AdType;
  title: string;
  description?: string;
  image_url?: string;
  target_url?: string;
  requested_duration_days: number;
  estimated_reach?: string;
  estimated_cost: number;
}): Promise<{ error: string | null }> {
  const { data: business } = await supabase.from('businesses').select('id').eq('vendor_id', params.vendor_id).limit(1).maybeSingle();
  if (!business) return { error: 'Create a business profile before requesting a promotion.' };
  const placement = params.ad_type === 'featured_business' ? 'featured_vendor' : params.ad_type === 'homepage_banner' ? 'campus_banner' : 'sponsored_listing';
  const startsAt = new Date().toISOString();
  const endsAt = new Date(Date.now() + params.requested_duration_days * 86_400_000).toISOString();
  const { error } = await supabase.rpc('create_own_ad_campaign', {
    p_listing_type: 'business', p_listing_id: business.id, p_placement: placement,
    p_title: params.title, p_requested_budget: params.estimated_cost,
    p_starts_at: startsAt, p_ends_at: endsAt,
  });
  return { error: error?.message || null };
}

export async function deleteAdRequest(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('cancel_own_ad_campaign', { p_campaign_id: id });
  return { error: error?.message || null };
}

// ============================================================
// Reviews & Responses
// ============================================================

export async function getVendorReviews(vendorId: string): Promise<ReviewWithResponse[]> {
  const { data } = await supabase
    .from('reviews')
    .select(`
      *,
      reviewer:profiles!reviews_reviewer_id_fkey(full_name, avatar_url),
      response:review_responses(*)
    `)
    .eq('vendor_id', vendorId)
    .order('created_at', { ascending: false });

  return (data || []) as unknown as ReviewWithResponse[];
}

export async function respondToReview(
  reviewId: string,
  vendorId: string,
  responseBody: string
): Promise<{ error: string | null }> {
  const { data: existing } = await supabase
    .from('review_responses')
    .select('id')
    .eq('review_id', reviewId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('review_responses')
      .update({ response_body: responseBody })
      .eq('id', existing.id);
    return { error: error?.message || null };
  }

  const { error } = await supabase
    .from('review_responses')
    .insert({
      review_id: reviewId,
      vendor_id: vendorId,
      response_body: responseBody,
    });
  return { error: error?.message || null };
}

export async function reportReview(reviewId: string, reason: string): Promise<{ error: string | null }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase
    .from('reports')
    .insert({
      reporter_id: user.id,
      target_type: 'review',
      target_id: reviewId,
      reason,
      status: 'open',
    });
  return { error: error?.message || null };
}

// ============================================================
// Analytics
// ============================================================

export async function getVendorAnalytics(vendorId: string): Promise<VendorAnalytics | null> {
  void vendorId;
  const { data } = await supabase.rpc('get_vendor_analytics_dashboard', { p_days: 30 });
  if (!data) return null;
  return data as VendorAnalytics;
}

// ============================================================
// Vendor Settings
// ============================================================

export async function getVendorSettings(vendorId: string): Promise<VendorSettings | null> {
  const { data } = await supabase
    .from('vendor_settings')
    .select('*')
    .eq('vendor_id', vendorId)
    .maybeSingle();
  return data as VendorSettings | null;
}

export async function updateVendorSettings(
  vendorId: string,
  updates: Partial<Pick<VendorSettings,
    'email_notifications' | 'push_notifications' |
    'order_alerts' | 'review_alerts' | 'message_alerts' |
    'two_factor_enabled'
  >>
): Promise<{ error: string | null }> {
  const { data: existing } = await supabase
    .from('vendor_settings')
    .select('id')
    .eq('vendor_id', vendorId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('vendor_settings')
      .update(updates)
      .eq('vendor_id', vendorId);
    return { error: error?.message || null };
  }

  const { error } = await supabase
    .from('vendor_settings')
    .insert({ vendor_id: vendorId, ...updates });
  return { error: error?.message || null };
}

// ============================================================
// Image Upload Helper
// ============================================================

export async function uploadVendorImage(
  vendorId: string,
  file: File,
  bucket: string = 'vendor-assets',
  folder: string = 'gallery'
): Promise<{ url: string | null; error: string | null }> {
  const ext = file.name.split('.').pop();
  const path = `${vendorId}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(path, file, { upsert: false });

  if (uploadError) return { url: null, error: uploadError.message };

  const { data: urlData } = supabase.storage
    .from(bucket)
    .getPublicUrl(path);

  return { url: urlData.publicUrl, error: null };
}

// ============================================================
// Dashboard Aggregation
// ============================================================

export async function getVendorDashboardData(vendorId: string) {
  const [products, services, subscription, reviews, analytics, hours, gallery] = await Promise.all([
    getVendorProducts(vendorId),
    getVendorServices(vendorId),
    getVendorSubscription(vendorId),
    getVendorReviews(vendorId),
    getVendorAnalytics(vendorId),
    getBusinessHours(vendorId),
    getGalleryImages(vendorId),
  ]);

  const activeProducts = products.filter(p => !p.is_archived && p.is_active);
  const activeServices = services.filter(s => !s.is_archived && s.is_active);
  const lowStockProducts = activeProducts.filter(p => p.stock <= p.low_stock_threshold);
  const unreadReviews = reviews.filter(r => !r.response);

  return {
    products,
    services,
    activeProducts: activeProducts.length,
    activeServices: activeServices.length,
    lowStockProducts,
    subscription,
    reviews,
    analytics,
    hours,
    gallery,
    unreadReviews: unreadReviews.length,
    totalProducts: products.length,
    totalServices: services.length,
    archivedProducts: products.filter(p => p.is_archived).length,
    archivedServices: services.filter(s => s.is_archived).length,
  };
}
