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

  await logAdminAction('user.suspend', 'users', 'profile', userId, { reason });
  return { error: null };
}

export async function reactivateUser(userId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('set_profile_status', {
    p_target_user_id: userId,
    p_status: 'active',
    p_is_active: true,
  });
  if (error) return { error: error.message };

  await logAdminAction('user.reactivate', 'users', 'profile', userId, {});
  return { error: null };
}

export async function assignUserRole(userId: string, roleId: number): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('assign_application_role', {
    p_target_user_id: userId,
    p_new_role_id: roleId,
  });
  if (error) return { error: error.message };

  await logAdminAction('user.assign_role', 'users', 'profile', userId, { role_id: roleId });
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

  await logAdminAction('student.verify', 'verification', 'student_profile', studentProfileId, { note });
  return { error: null };
}

export async function rejectStudentVerification(studentProfileId: string, reason: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('review_student_verification', {
    p_student_profile_id: studentProfileId,
    p_approved: false,
    p_reason: reason,
  });
  if (error) return { error: error.message };

  await logAdminAction('student.reject', 'verification', 'student_profile', studentProfileId, { reason });
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

  await logAdminAction('vendor.approve', 'verification', 'vendor', vendorId, { note });
  return { error: null };
}

export async function rejectVendor(vendorId: string, reason: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('review_vendor_verification', {
    p_vendor_id: vendorId,
    p_approved: false,
    p_reason: reason,
  });
  if (error) return { error: error.message };

  await logAdminAction('vendor.reject', 'verification', 'vendor', vendorId, { reason });
  return { error: null };
}

export async function suspendVendor(vendorId: string, reason: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('set_vendor_active', {
    p_vendor_id: vendorId,
    p_is_active: false,
    p_reason: reason,
  });
  if (error) return { error: error.message };

  await logAdminAction('vendor.suspend', 'businesses', 'vendor', vendorId, { reason });
  return { error: null };
}

export async function restoreVendor(vendorId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('set_vendor_active', {
    p_vendor_id: vendorId,
    p_is_active: true,
  });
  if (error) return { error: error.message };

  await logAdminAction('vendor.restore', 'businesses', 'vendor', vendorId, {});
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
  const { error } = await supabase.from('universities').insert({
    ...data,
    country: data.country || 'Ghana',
    is_enabled: data.is_enabled ?? false,
  });
  if (error) return { error: error.message };

  await logAdminAction('university.create', 'university', null, null, { name: data.name });
  return { error: null };
}

export async function updateUniversity(id: string, data: Record<string, unknown>): Promise<{ error: string | null }> {
  const { error } = await supabase.from('universities').update(data).eq('id', id);
  if (error) return { error: error.message };

  await logAdminAction('university.update', 'university', 'university', id, data);
  return { error: null };
}

export async function toggleUniversityEnabled(id: string, enabled: boolean): Promise<{ error: string | null }> {
  const { error } = await supabase.from('universities').update({ is_enabled: enabled }).eq('id', id);
  if (error) return { error: error.message };

  await logAdminAction('university.toggle', 'university', 'university', id, { enabled });
  return { error: null };
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

  const { data } = supabase.storage.from('university-branding').getPublicUrl(path);

  const column = imageType === 'logo' ? 'logo_url' : 'hero_image_url';
  const { error: updateError } = await supabase
    .from('universities')
    .update({ [column]: data.publicUrl, updated_at: new Date().toISOString() })
    .eq('id', universityId);

  if (updateError) return { url: null, error: updateError.message };

  await logAdminAction('university.image_upload', 'university', 'university', universityId, { image_type: imageType, path });
  return { url: data.publicUrl, error: null };
}

export async function removeUniversityImage(
  universityId: string,
  imageType: 'logo' | 'hero'
): Promise<{ error: string | null }> {
  const column = imageType === 'logo' ? 'logo_url' : 'hero_image_url';
  const { error } = await supabase
    .from('universities')
    .update({ [column]: null, updated_at: new Date().toISOString() })
    .eq('id', universityId);

  if (error) return { error: error.message };

  await logAdminAction('university.image_remove', 'university', 'university', universityId, { image_type: imageType });
  return { error: null };
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
  const { error } = await supabase.from('categories').insert({
    ...data,
    parent_id: data.parent_id || null,
    sort_order: data.sort_order ?? 0,
    is_visible: data.is_visible ?? true,
  });
  if (error) return { error: error.message };

  await logAdminAction('category.create', 'categories', null, null, { name: data.name });
  return { error: null };
}

export async function updateCategory(id: string, data: Record<string, unknown>): Promise<{ error: string | null }> {
  const { error } = await supabase.from('categories').update(data).eq('id', id);
  if (error) return { error: error.message };

  await logAdminAction('category.update', 'categories', 'category', id, data);
  return { error: null };
}

export async function deleteCategory(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) return { error: error.message };

  await logAdminAction('category.delete', 'categories', 'category', id, {});
  return { error: null };
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
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('advertisements')
    .update({
      status: 'approved',
      reviewed_by: user?.id || null,
      reviewed_at: new Date().toISOString(),
      rejection_reason: null,
      priority,
      is_featured: featured,
      is_sponsored: sponsored,
    })
    .eq('id', adId);
  if (error) return { error: error.message };

  await logAdminAction('ad.approve', 'advertisements', 'advertisement', adId, { priority, featured, sponsored });
  return { error: null };
}

export async function rejectAdvertisement(adId: string, reason: string): Promise<{ error: string | null }> {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('advertisements')
    .update({
      status: 'rejected',
      reviewed_by: user?.id || null,
      reviewed_at: new Date().toISOString(),
      rejection_reason: reason,
    })
    .eq('id', adId);
  if (error) return { error: error.message };

  await logAdminAction('ad.reject', 'advertisements', 'advertisement', adId, { reason });
  return { error: null };
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
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('reports')
    .update({
      status: 'resolved',
      moderator_id: user?.id || null,
      resolved_at: new Date().toISOString(),
      resolution_note: note,
    })
    .eq('id', reportId);
  if (error) return { error: error.message };

  await logAdminAction('report.resolve', 'moderation', 'report', reportId, { note });
  return { error: null };
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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase
    .from('ticket_replies')
    .insert({
      ticket_id: ticketId,
      author_id: user.id,
      body,
      is_internal: isInternal,
    });
  if (error) return { error: error.message };

  // Update ticket status
  if (!isInternal) {
    await supabase
      .from('support_tickets')
      .update({ status: 'in_progress' })
      .eq('id', ticketId);
  }

  return { error: null };
}

export async function assignTicket(ticketId: string, adminId: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('support_tickets')
    .update({ assigned_to: adminId, status: 'in_progress' })
    .eq('id', ticketId);
  if (error) return { error: error.message };

  await logAdminAction('ticket.assign', 'support', 'ticket', ticketId, { admin_id: adminId });
  return { error: null };
}

export async function closeTicket(ticketId: string): Promise<{ error: string | null }> {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('support_tickets')
    .update({
      status: 'closed',
      closed_at: new Date().toISOString(),
      closed_by: user?.id || null,
    })
    .eq('id', ticketId);
  if (error) return { error: error.message };

  await logAdminAction('ticket.close', 'support', 'ticket', ticketId, {});
  return { error: null };
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
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('cms_pages').insert({
    ...data,
    author_id: user?.id || null,
    is_published: data.is_published ?? false,
    published_at: data.is_published ? new Date().toISOString() : null,
  });
  if (error) return { error: error.message };

  await logAdminAction('cms.create', 'cms', null, null, { slug: data.slug });
  return { error: null };
}

export async function updateCmsPage(id: string, data: Record<string, unknown>): Promise<{ error: string | null }> {
  if (data.is_published === true && !data.published_at) {
    data.published_at = new Date().toISOString();
  }
  const { error } = await supabase.from('cms_pages').update(data).eq('id', id);
  if (error) return { error: error.message };

  await logAdminAction('cms.update', 'cms', 'cms_page', id, data);
  return { error: null };
}

export async function deleteCmsPage(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('cms_pages').delete().eq('id', id);
  if (error) return { error: error.message };

  await logAdminAction('cms.delete', 'cms', 'cms_page', id, {});
  return { error: null };
}

export async function getAdminFaq(): Promise<CmsFaqEntry[]> {
  const { data } = await supabase
    .from('cms_faq_entries')
    .select('*')
    .order('sort_order', { ascending: true });
  return (data || []) as CmsFaqEntry[];
}

export async function createFaqEntry(data: { question: string; answer: string; category?: string }): Promise<{ error: string | null }> {
  const { error } = await supabase.from('cms_faq_entries').insert({
    ...data,
    category: data.category || 'General',
    is_published: true,
  });
  return { error: error?.message || null };
}

export async function updateFaqEntry(id: string, data: Record<string, unknown>): Promise<{ error: string | null }> {
  const { error } = await supabase.from('cms_faq_entries').update(data).eq('id', id);
  return { error: error?.message || null };
}

export async function deleteFaqEntry(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('cms_faq_entries').delete().eq('id', id);
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
  const { error } = await supabase.from('announcements').insert({
    ...data,
    university_id: data.university_id || null,
    starts_at: data.starts_at || new Date().toISOString(),
    ends_at: data.ends_at || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });
  if (error) return { error: error.message };

  await logAdminAction('announcement.create', 'announcements', null, null, { title: data.title });
  return { error: null };
}

export async function updateAnnouncement(id: string, data: Record<string, unknown>): Promise<{ error: string | null }> {
  const { error } = await supabase.from('announcements').update(data).eq('id', id);
  return { error: error?.message || null };
}

export async function deleteAnnouncement(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('announcements').delete().eq('id', id);
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

async function logAdminAction(
  action: string,
  module: string,
  targetType: string | null,
  targetId: string | null,
  metadata: Record<string, unknown>
): Promise<void> {
  try {
    await supabase.from('admin_actions').insert({
      action,
      module,
      target_type: targetType,
      target_id: targetId,
      metadata,
      result: 'success',
    });
  } catch {
    // Silent fail — logging is best-effort
  }
}

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
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const { data } = await supabase
    .from('profiles')
    .select('created_at')
    .gte('created_at', startDate.toISOString())
    .order('created_at', { ascending: true });

  if (!data) return [];

  const byDate: Record<string, number> = {};
  for (const p of data) {
    const date = new Date(p.created_at).toISOString().split('T')[0];
    byDate[date] = (byDate[date] || 0) + 1;
  }

  return Object.entries(byDate).map(([date, count]) => ({ date, count }));
}

export async function getOrderTrends(days = 30): Promise<Array<{ date: string; count: number }>> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const { data } = await supabase
    .from('orders')
    .select('created_at')
    .gte('created_at', startDate.toISOString())
    .order('created_at', { ascending: true });

  if (!data) return [];

  const byDate: Record<string, number> = {};
  for (const o of data) {
    const date = new Date(o.created_at).toISOString().split('T')[0];
    byDate[date] = (byDate[date] || 0) + 1;
  }

  return Object.entries(byDate).map(([date, count]) => ({ date, count }));
}

export async function getUniversityGrowth(): Promise<Array<{ name: string; students: number; vendors: number; businesses: number }>> {
  const { data: universities } = await supabase.from('universities').select('id, name').eq('is_enabled', true);

  if (!universities) return [];

  const results: Array<{ name: string; students: number; vendors: number; businesses: number }> = [];

  for (const uni of universities) {
    const [students, vendors] = await Promise.all([
      supabase.from('student_profiles').select('id', { count: 'exact', head: true }).eq('university_id', uni.id),
      supabase.from('vendors').select('id', { count: 'exact', head: true }).eq('university_id', uni.id),
    ]);
    results.push({
      name: uni.name,
      students: students.count || 0,
      vendors: vendors.count || 0,
      businesses: vendors.count || 0,
    });
  }

  return results;
}

export async function getCategoryPopularity(): Promise<Array<{ category: string; count: number }>> {
  const { data } = await supabase
    .from('vendors')
    .select('business_type')
    .not('business_type', 'is', null);

  if (!data) return [];

  const byCategory: Record<string, number> = {};
  for (const v of data) {
    const cat = v.business_type || 'Other';
    byCategory[cat] = (byCategory[cat] || 0) + 1;
  }

  return Object.entries(byCategory)
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
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
