'use client';

import { supabase } from '@/lib/supabase/client';
import type { Profile } from '@/lib/types';
import type {
  AdminStats, AdminUser, AdminVendor, SupportTicket, TicketReply,
  CmsPage, CmsFaqEntry, Category, Announcement, AdminAction,
  AdminReport, AdminSubscription, AdminAdvertisement, AdminOrder,
} from '@/lib/types/admin';

// ============================================================
// Platform Overview Stats
// ============================================================
export async function getPlatformStats(): Promise<AdminStats> {
  const [
    usersRes, studentsRes, studentVendorsRes, externalVendorsRes,
    vendorsRes, productsRes, servicesRes, ordersRes,
    universitiesRes, eventsRes, subsRes,
  ] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('student_profiles').select('id', { count: 'exact', head: true }).eq('is_verified_student', true),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role_id', 3),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role_id', 4),
    supabase.from('vendors').select('id', { count: 'exact', head: true }),
    supabase.from('products').select('id', { count: 'exact', head: true }),
    supabase.from('services').select('id', { count: 'exact', head: true }),
    supabase.from('orders').select('id', { count: 'exact', head: true }),
    supabase.from('universities').select('id', { count: 'exact', head: true }),
    supabase.from('events').select('id', { count: 'exact', head: true }),
    supabase.from('subscriptions').select('id', { count: 'exact', head: true }).eq('status', 'active'),
  ]);

  return {
    totalUsers: usersRes.count || 0,
    verifiedStudents: studentsRes.count || 0,
    studentVendors: studentVendorsRes.count || 0,
    externalVendors: externalVendorsRes.count || 0,
    businesses: vendorsRes.count || 0,
    products: productsRes.count || 0,
    services: servicesRes.count || 0,
    orders: ordersRes.count || 0,
    universities: universitiesRes.count || 0,
    events: eventsRes.count || 0,
    activeSubscriptions: subsRes.count || 0,
    totalRevenue: 0,
  };
}

// ============================================================
// User Management
// ============================================================
export async function getAdminUsers(params: {
  search?: string;
  role?: number;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ users: AdminUser[]; total: number }> {
  let query = supabase
    .from('profiles')
    .select(`
      *,
      role:user_roles(name),
      university:universities(name)
    `, { count: 'exact' });

  if (params.search) {
    query = query.or(`full_name.ilike.%${params.search}%,email.ilike.%${params.search}%`);
  }
  if (params.role) {
    query = query.eq('role_id', params.role);
  }
  if (params.status && params.status !== 'all') {
    query = query.eq('status', params.status);
  }

  const limit = params.limit || 20;
  const offset = params.offset || 0;
  query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

  const { data, count } = await query;

  const users = (data || []) as unknown as AdminUser[];
  return { users, total: count || 0 };
}

export async function getAdminUserById(userId: string): Promise<AdminUser | null> {
  const { data } = await supabase
    .from('profiles')
    .select(`
      *,
      role:user_roles(name),
      university:universities(name),
      student_profile:student_profiles(verification_status, is_verified_student, student_id_number, program_of_study),
      vendor_profile:vendor_profiles(vendor_type, verification_status, subscription_status)
    `)
    .eq('id', userId)
    .maybeSingle();
  return data as unknown as AdminUser | null;
}

export async function suspendUser(userId: string, reason: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('set_profile_status', {
    p_target_user_id: userId,
    p_status: 'suspended',
    p_is_active: false,
    p_reason: reason,
  });
  if (error) return { error: error.message };

  return { error: null };
}

export async function reactivateUser(userId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('set_profile_status', {
    p_target_user_id: userId,
    p_status: 'active',
    p_is_active: true,
  });
  if (error) return { error: error.message };

  return { error: null };
}

export async function assignUserRole(userId: string, roleId: number): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('assign_application_role', {
    p_target_user_id: userId,
    p_new_role_id: roleId,
  });
  if (error) return { error: error.message };

  return { error: null };
}

// ============================================================
// Student Verification
// ============================================================
export async function getStudentVerifications(params: {
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ students: Array<Profile & { student_profile: Record<string, unknown> }>; total: number }> {
  let query = supabase
    .from('student_profiles')
    .select(`
      *,
      user:profiles!student_profiles_user_id_fkey(id, email, full_name, avatar_url, university_id, university:universities(name))
    `, { count: 'exact' });

  if (params.status && params.status !== 'all') {
    query = query.eq('verification_status', params.status);
  }

  const limit = params.limit || 20;
  const offset = params.offset || 0;
  query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

  const { data, count } = await query;
  return { students: (data || []) as unknown as Array<Profile & { student_profile: Record<string, unknown> }>, total: count || 0 };
}

export async function approveStudentVerification(studentProfileId: string, note?: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('review_student_verification', {
    p_student_profile_id: studentProfileId,
    p_approved: true,
    p_reason: note || null,
  });
  if (error) return { error: error.message };

  return { error: null };
}

export async function rejectStudentVerification(studentProfileId: string, reason: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('review_student_verification', {
    p_student_profile_id: studentProfileId,
    p_approved: false,
    p_reason: reason,
  });
  if (error) return { error: error.message };

  return { error: null };
}

// ============================================================
// Vendor Verification
// ============================================================
export async function getVendorVerifications(params: {
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ vendors: AdminVendor[]; total: number }> {
  let query = supabase
    .from('vendors')
    .select(`
      *,
      university:universities(name),
      owner:profiles!vendors_owner_id_fkey(full_name, email)
    `, { count: 'exact' });

  if (params.status === 'verified') {
    query = query.eq('is_verified', true);
  } else if (params.status === 'unverified') {
    query = query.eq('is_verified', false);
  }

  const limit = params.limit || 20;
  const offset = params.offset || 0;
  query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

  const { data, count } = await query;
  return { vendors: (data || []) as unknown as AdminVendor[], total: count || 0 };
}

export async function approveVendor(vendorId: string, note?: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('review_vendor_verification', {
    p_vendor_id: vendorId,
    p_approved: true,
    p_reason: note || null,
  });
  if (error) return { error: error.message };

  return { error: null };
}

export async function rejectVendor(vendorId: string, reason: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('review_vendor_verification', {
    p_vendor_id: vendorId,
    p_approved: false,
    p_reason: reason,
  });
  if (error) return { error: error.message };

  return { error: null };
}

export async function suspendVendor(vendorId: string, reason: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('set_vendor_active', {
    p_vendor_id: vendorId,
    p_is_active: false,
    p_reason: reason,
  });
  if (error) return { error: error.message };

  return { error: null };
}

export async function restoreVendor(vendorId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('set_vendor_active', {
    p_vendor_id: vendorId,
    p_is_active: true,
  });
  if (error) return { error: error.message };

  return { error: null };
}

// ============================================================
// Business Management
// ============================================================
export async function getAdminBusinesses(params: {
  search?: string;
  verified?: boolean;
  active?: boolean;
  limit?: number;
  offset?: number;
}): Promise<{ vendors: AdminVendor[]; total: number }> {
  let query = supabase
    .from('vendors')
    .select(`
      *,
      university:universities(name),
      owner:profiles!vendors_owner_id_fkey(full_name, email)
    `, { count: 'exact' });

  if (params.search) {
    query = query.or(`business_name.ilike.%${params.search}%,business_slug.ilike.%${params.search}%`);
  }
  if (params.verified !== undefined) query = query.eq('is_verified', params.verified);
  if (params.active !== undefined) query = query.eq('is_active', params.active);

  const limit = params.limit || 20;
  const offset = params.offset || 0;
  query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

  const { data, count } = await query;
  return { vendors: (data || []) as unknown as AdminVendor[], total: count || 0 };
}

// ============================================================
// University Management
// ============================================================
export async function getAdminUniversities(): Promise<Array<{ id: string; name: string; short_name: string; slug: string; city: string | null; region: string | null; country: string; logo_url: string | null; hero_image_url: string | null; logo_alt_text: string | null; hero_alt_text: string | null; image_credit: string | null; image_source: string | null; website_url: string | null; description: string | null; is_enabled: boolean; created_at: string }>> {
  const { data } = await supabase
    .from('universities')
    .select('*')
    .order('name', { ascending: true });
  return (data || []) as Array<{ id: string; name: string; short_name: string; slug: string; city: string | null; region: string | null; country: string; logo_url: string | null; hero_image_url: string | null; logo_alt_text: string | null; hero_alt_text: string | null; image_credit: string | null; image_source: string | null; website_url: string | null; description: string | null; is_enabled: boolean; created_at: string }>;
}

export async function getMyUniversityAdminScopes(): Promise<string[]> {
  const { data, error } = await supabase
    .from('university_admin_memberships')
    .select('university_id')
    .eq('is_active', true);

  if (error) return [];
  return (data || []).map(scope => scope.university_id);
}

export async function createUniversity(data: {
  name: string;
  short_name: string;
  slug: string;
  city?: string;
  region?: string;
  country?: string;
  website_url?: string;
  description?: string;
  logo_url?: string;
  hero_image_url?: string;
  logo_alt_text?: string;
  hero_alt_text?: string;
  image_credit?: string;
  image_source?: string;
  is_enabled?: boolean;
}): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('create_admin_university', {
    p_name: data.name, p_short_name: data.short_name, p_slug: data.slug,
    p_city: data.city || null, p_region: data.region || null, p_country: data.country || 'Ghana',
    p_website_url: data.website_url || null, p_description: data.description || null,
    p_is_enabled: data.is_enabled ?? false,
  });
  return { error: error?.message || null };
}

export async function updateUniversity(id: string, data: Record<string, unknown>): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('update_admin_university', {
    p_university_id: id, p_name: data.name, p_short_name: data.short_name, p_slug: data.slug,
    p_city: data.city || null, p_region: data.region || null, p_country: data.country || null,
    p_website_url: data.website_url || null, p_description: data.description || null,
    p_logo_alt_text: data.logo_alt_text || null, p_hero_alt_text: data.hero_alt_text || null,
    p_image_credit: data.image_credit || null, p_image_source: data.image_source || null,
  });
  return { error: error?.message || null };
}

export async function toggleUniversityEnabled(id: string, enabled: boolean): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('set_admin_university_enabled', { p_university_id: id, p_enabled: enabled });
  return { error: error?.message || null };
}

// ============================================================
// University Branding Image Management
// ============================================================

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp'];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB

function validateImageFile(file: File): { error: string | null } {
  if (file.size > MAX_IMAGE_SIZE) {
    return { error: 'Image must be 5 MB or smaller' };
  }
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  if (!ALLOWED_IMAGE_EXTS.includes(ext)) {
    return { error: 'Image must be JPG, PNG, or WebP' };
  }
  if (file.type && !ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return { error: 'Image must be a valid JPG, PNG, or WebP file' };
  }
  return { error: null };
}

export async function uploadUniversityImage(
  universityId: string,
  universitySlug: string,
  file: File,
  imageType: 'logo' | 'hero'
): Promise<{ url: string | null; error: string | null }> {
  const validation = validateImageFile(file);
  if (validation.error) return { url: null, error: validation.error };

  const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
  const path = `${universitySlug}/${imageType}-${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('university-branding')
    .upload(path, file, { contentType: file.type || `image/${ext}` });

  if (uploadError) return { url: null, error: uploadError.message };

  const { error: updateError } = await supabase.rpc('set_admin_university_branding', {
    p_university_id: universityId, p_image_type: imageType, p_object_path: path,
  });
  if (updateError) return { url: null, error: updateError.message };
  return { url: supabase.storage.from('university-branding').getPublicUrl(path).data.publicUrl, error: null };
}

export async function removeUniversityImage(
  universityId: string,
  imageType: 'logo' | 'hero'
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('set_admin_university_branding', {
    p_university_id: universityId, p_image_type: imageType, p_object_path: null,
  });
  return { error: error?.message || null };
}

// ============================================================
// Category Management
// ============================================================
export async function getAdminCategories(): Promise<Category[]> {
  const { data } = await supabase
    .from('categories')
    .select('*')
    .order('sort_order', { ascending: true });
  return (data || []) as Category[];
}

export async function createCategory(data: {
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  parent_id?: string | null;
  sort_order?: number;
  is_visible?: boolean;
}): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('create_admin_category', {
    p_name: data.name, p_slug: data.slug, p_description: data.description || null,
    p_icon: data.icon || null, p_parent_id: data.parent_id || null,
    p_sort_order: data.sort_order ?? 0, p_is_visible: data.is_visible ?? true,
  });
  return { error: error?.message || null };
}

export async function updateCategory(id: string, data: Record<string, unknown>): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('update_admin_category', {
    p_category_id: id, p_name: data.name, p_slug: data.slug, p_description: data.description || null,
    p_icon: data.icon || null, p_parent_id: data.parent_id || null,
    p_sort_order: data.sort_order ?? 0, p_is_visible: data.is_visible ?? true,
  });
  return { error: error?.message || null };
}

export async function deleteCategory(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('delete_admin_category', { p_category_id: id });
  return { error: error?.message || null };
}

// ============================================================
// Subscriptions
// ============================================================
export async function getAdminSubscriptions(params: {
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ subscriptions: AdminSubscription[]; total: number }> {
  let query = supabase
    .from('subscriptions')
    .select(`
      *,
      vendor:vendors(business_name, business_slug, owner_id),
      extended_by_profile:profiles!subscriptions_extended_by_fkey(full_name)
    `, { count: 'exact' });

  if (params.status && params.status !== 'all') {
    query = query.eq('status', params.status);
  }

  const limit = params.limit || 20;
  const offset = params.offset || 0;
  query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

  const { data, count } = await query;
  return { subscriptions: (data || []) as unknown as AdminSubscription[], total: count || 0 };
}

export async function extendSubscription(subId: string, days: number, note: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('admin_extend_subscription', {
    p_subscription_id: subId,
    p_days: days,
    p_note: note || null,
  });
  return { error: error?.message || null };
}

// ============================================================
// Advertisements
// ============================================================
export async function getAdminAdvertisements(params: {
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ ads: AdminAdvertisement[]; total: number }> {
  let query = supabase
    .from('advertisements')
    .select(`
      *,
      vendor:vendors(business_name),
      university:universities(name),
      reviewer:profiles!advertisements_reviewed_by_fkey(full_name)
    `, { count: 'exact' });

  if (params.status && params.status !== 'all') {
    query = query.eq('status', params.status);
  }

  const limit = params.limit || 20;
  const offset = params.offset || 0;
  query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

  const { data, count } = await query;
  return { ads: (data || []) as unknown as AdminAdvertisement[], total: count || 0 };
}

export async function approveAdvertisement(adId: string, priority: number, featured: boolean, sponsored: boolean): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('review_admin_advertisement', {
    p_advertisement_id: adId, p_decision: 'approved', p_priority: priority,
    p_featured: featured, p_sponsored: sponsored, p_rejection_reason: null,
  });
  return { error: error?.message || null };
}

export async function rejectAdvertisement(adId: string, reason: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('review_admin_advertisement', {
    p_advertisement_id: adId, p_decision: 'rejected', p_priority: 0,
    p_featured: false, p_sponsored: false, p_rejection_reason: reason,
  });
  return { error: error?.message || null };
}

// ============================================================
// Order Monitoring (read-only)
// ============================================================
export async function getAdminOrders(params: {
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ orders: AdminOrder[]; total: number }> {
  let query = supabase
    .from('orders')
    .select(`
      id, order_number, buyer_id, vendor_id, status, total_amount,
      order_type, delivery_method, created_at, completed_at,
      buyer:profiles!orders_buyer_id_fkey(full_name, email),
      vendor:vendors(business_name)
    `, { count: 'exact' });

  if (params.status && params.status !== 'all') {
    query = query.eq('status', params.status);
  }

  const limit = params.limit || 20;
  const offset = params.offset || 0;
  query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

  const { data, count } = await query;
  return { orders: (data || []) as unknown as AdminOrder[], total: count || 0 };
}

export async function getOrderStats(): Promise<{ total: number; completed: number; cancelled: number; pending: number }> {
  const [total, completed, cancelled, pending] = await Promise.all([
    supabase.from('orders').select('id', { count: 'exact', head: true }),
    supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
    supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'cancelled'),
    supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ]);
  return {
    total: total.count || 0,
    completed: completed.count || 0,
    cancelled: cancelled.count || 0,
    pending: pending.count || 0,
  };
}

// ============================================================
// Moderation / Reports
// ============================================================
export async function getAdminReports(params: {
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ reports: AdminReport[]; total: number }> {
  let query = supabase
    .from('reports')
    .select(`
      *,
      reporter:profiles!reports_reporter_id_fkey(full_name, email),
      moderator:profiles!reports_moderator_id_fkey(full_name)
    `, { count: 'exact' });

  if (params.status && params.status !== 'all') {
    query = query.eq('status', params.status);
  }

  const limit = params.limit || 20;
  const offset = params.offset || 0;
  query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

  const { data, count } = await query;
  return { reports: (data || []) as unknown as AdminReport[], total: count || 0 };
}

export async function resolveReport(reportId: string, note: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('resolve_admin_report', { p_report_id: reportId, p_resolution_note: note });
  return { error: error?.message || null };
}

// ============================================================
// Support Tickets
// ============================================================
export async function getAdminTickets(params: {
  status?: string;
  category?: string;
  limit?: number;
  offset?: number;
}): Promise<{ tickets: SupportTicket[]; total: number }> {
  let query = supabase
    .from('support_tickets')
    .select(`
      *,
      user:profiles!support_tickets_user_id_fkey(full_name, email, avatar_url),
      assignee:profiles!support_tickets_assigned_to_fkey(full_name)
    `, { count: 'exact' });

  if (params.status && params.status !== 'all') query = query.eq('status', params.status);
  if (params.category && params.category !== 'all') query = query.eq('category', params.category);

  const limit = params.limit || 20;
  const offset = params.offset || 0;
  query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

  const { data, count } = await query;
  return { tickets: (data || []) as unknown as SupportTicket[], total: count || 0 };
}

export async function getTicketById(ticketId: string): Promise<SupportTicket | null> {
  const { data } = await supabase
    .from('support_tickets')
    .select(`
      *,
      user:profiles!support_tickets_user_id_fkey(full_name, email, avatar_url),
      assignee:profiles!support_tickets_assigned_to_fkey(full_name)
    `)
    .eq('id', ticketId)
    .maybeSingle();
  return data as unknown as SupportTicket | null;
}

export async function getTicketReplies(ticketId: string): Promise<TicketReply[]> {
  const { data } = await supabase
    .from('ticket_replies')
    .select(`
      *,
      author:profiles!ticket_replies_author_id_fkey(full_name, avatar_url, email)
    `)
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });
  return (data || []) as unknown as TicketReply[];
}

export async function replyToTicket(ticketId: string, body: string, isInternal: boolean): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('add_admin_ticket_reply', {
    p_ticket_id: ticketId, p_body: body, p_is_internal: isInternal,
  });
  return { error: error?.message || null };
}

export async function assignTicket(ticketId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('assign_admin_support_ticket', { p_ticket_id: ticketId });
  return { error: error?.message || null };
}

export async function closeTicket(ticketId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('close_admin_support_ticket', { p_ticket_id: ticketId });
  return { error: error?.message || null };
}

export async function createTicket(data: {
  subject: string;
  description: string;
  category: string;
  priority?: string;
}): Promise<{ data: SupportTicket | null; error: string | null }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  const { data: ticketNumberData } = await supabase.rpc('generate_ticket_number');

  const { data: ticket, error } = await supabase
    .from('support_tickets')
    .insert({
      ticket_number: ticketNumberData,
      user_id: user.id,
      subject: data.subject,
      description: data.description,
      category: data.category,
      priority: data.priority || 'medium',
    })
    .select('*')
    .single();

  if (error) return { data: null, error: error.message };
  return { data: ticket as unknown as SupportTicket, error: null };
}

// ============================================================
// CMS
// ============================================================
export async function getAdminCmsPages(pageType?: string): Promise<CmsPage[]> {
  let query = supabase
    .from('cms_pages')
    .select(`*, author:profiles!cms_pages_author_id_fkey(full_name)`)
    .order('sort_order', { ascending: true });

  if (pageType && pageType !== 'all') query = query.eq('page_type', pageType);

  const { data } = await query;
  return (data || []) as unknown as CmsPage[];
}

export async function createCmsPage(data: {
  slug: string;
  title: string;
  content: string;
  page_type: string;
  meta_description?: string;
  is_published?: boolean;
}): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('create_admin_cms_page', {
    p_slug: data.slug, p_title: data.title, p_content: data.content, p_page_type: data.page_type,
    p_meta_description: data.meta_description || null, p_is_published: data.is_published ?? false, p_sort_order: 0,
  });
  return { error: error?.message || null };
}

export async function updateCmsPage(id: string, data: Record<string, unknown>): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('update_admin_cms_page', {
    p_page_id: id, p_slug: data.slug, p_title: data.title, p_content: data.content,
    p_page_type: data.page_type, p_meta_description: data.meta_description || null,
    p_is_published: data.is_published ?? false, p_sort_order: data.sort_order ?? 0,
  });
  return { error: error?.message || null };
}

export async function deleteCmsPage(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('delete_admin_cms_page', { p_page_id: id });
  return { error: error?.message || null };
}

export async function getAdminFaq(): Promise<CmsFaqEntry[]> {
  const { data } = await supabase
    .from('cms_faq_entries')
    .select('*')
    .order('sort_order', { ascending: true });
  return (data || []) as CmsFaqEntry[];
}

export async function createFaqEntry(data: { question: string; answer: string; category?: string }): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('create_admin_faq', { p_question: data.question, p_answer: data.answer, p_category: data.category || 'General', p_sort_order: 0, p_is_published: true });
  return { error: error?.message || null };
}

export async function updateFaqEntry(id: string, data: Record<string, unknown>): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('update_admin_faq', { p_faq_id: id, p_question: data.question, p_answer: data.answer, p_category: data.category || 'General', p_sort_order: data.sort_order ?? 0, p_is_published: data.is_published ?? true });
  return { error: error?.message || null };
}

export async function deleteFaqEntry(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('delete_admin_faq', { p_faq_id: id });
  return { error: error?.message || null };
}

// ============================================================
// Announcements
// ============================================================
export async function getAdminAnnouncements(): Promise<Announcement[]> {
  const { data } = await supabase
    .from('announcements')
    .select(`*, university:universities(name, short_name)`)
    .order('created_at', { ascending: false });
  return (data || []) as unknown as Announcement[];
}

export async function createAnnouncement(data: {
  title: string;
  body: string;
  type: string;
  target_audience: string;
  university_id?: string | null;
  starts_at?: string;
  ends_at?: string;
}): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('create_admin_announcement', { p_title: data.title, p_body: data.body, p_type: data.type, p_target_audience: data.target_audience, p_university_id: data.university_id || null, p_starts_at: data.starts_at || null, p_ends_at: data.ends_at || null });
  return { error: error?.message || null };
}

export async function updateAnnouncement(id: string, data: Record<string, unknown>): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('update_admin_announcement', { p_announcement_id: id, p_title: data.title, p_body: data.body, p_type: data.type, p_target_audience: data.target_audience, p_university_id: data.university_id || null, p_is_active: data.is_active ?? true, p_starts_at: data.starts_at, p_ends_at: data.ends_at });
  return { error: error?.message || null };
}

export async function deleteAnnouncement(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('delete_admin_announcement', { p_announcement_id: id });
  return { error: error?.message || null };
}

// ============================================================
// Audit Logs / Admin Actions
// ============================================================
export async function getAdminActions(params: {
  module?: string;
  limit?: number;
  offset?: number;
}): Promise<{ actions: AdminAction[]; total: number }> {
  let query = supabase
    .from('admin_actions')
    .select(`
      *,
      admin:profiles!admin_actions_admin_id_fkey(full_name, email, avatar_url)
    `, { count: 'exact' });

  if (params.module && params.module !== 'all') query = query.eq('module', params.module);

  const limit = params.limit || 50;
  const offset = params.offset || 0;
  query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

  const { data, count } = await query;
  return { actions: (data || []) as unknown as AdminAction[], total: count || 0 };
}

    // Silent fail — logging is best-effort
// ============================================================
// Role & Permission Management
// ============================================================
export async function getRolePermissions(): Promise<Array<{ id: string; role: string; permission: string }>> {
  const { data } = await supabase
    .from('role_permissions')
    .select('*')
    .order('role', { ascending: true });
  return (data || []) as Array<{ id: string; role: string; permission: string }>;
}

// ============================================================
// Analytics
// ============================================================
export async function getDailyActiveUsers(days = 30): Promise<Array<{ date: string; count: number }>> {
  const { data } = await supabase.rpc('get_platform_analytics_dashboard', { p_days: days });
  return [{ date: 'Current period', count: Number(data?.users || 0) }];
}

export async function getOrderTrends(days = 30): Promise<Array<{ date: string; count: number }>> {
  const { data } = await supabase.rpc('get_platform_analytics_dashboard', { p_days: days });
  return [{ date: 'Current period', count: Number(data?.orders || 0) }];
}

export async function getUniversityGrowth(): Promise<Array<{ name: string; students: number; vendors: number; businesses: number }>> {
  return [];
}

export async function getCategoryPopularity(): Promise<Array<{ category: string; count: number }>> {
  return [];
}

// ============================================================
// Export Helper
// ============================================================
export function exportToCsv(data: Record<string, unknown>[], filename: string): void {
  if (data.length === 0) return;

  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(','),
    ...data.map(row =>
      headers.map(header => {
        const val = row[header];
        if (val === null || val === undefined) return '';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      }).join(',')
    ),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
