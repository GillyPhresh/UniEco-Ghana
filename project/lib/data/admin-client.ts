'use client';

import { supabase } from '@/lib/supabase/client';
import type {
  AdminControlCenterSummary, AdminUniversityControlCenterSummary, AdminRecentActivityItem, AdminOperationalAlert, AdminUserDirectoryItem, AdminVendorDirectoryItem, SupportTicket, TicketReply,
  CmsPage, CmsFaqEntry, Category, Announcement, AdminAction, AdminQueryResult,
  AdminReport, AdminSubscription, AdminAdvertisement, AdminOrder, VendorVerificationQueueItem, ManagementSearchResult,
  VendorLocationReview,
  AdminStudentVerification,
  AdminReviewQueueItem,
  AdminStudentDirectoryItem,
  AdminDeliveryItem,
  AdminModerationCase,
  AdminModerationCaseEvent,
  AdminModerationReviewer,
  AdminEventModerationFlag,
  AdminEventOperationRow,
  AdminSupportAssignee,
} from '@/lib/types/admin';

// ============================================================
// Platform Overview Stats
// ============================================================
export async function searchManagementRecords(query: string, offset = 0, limit = 20): Promise<{ results: ManagementSearchResult[]; total: number }> {
  const normalized = query.trim();
  if (normalized.length < 3) return { results: [], total: 0 };
  const { data, error } = await supabase.rpc('search_management_records', {
    p_query: normalized,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw new Error('Unable to search authorized management records');
  const rows = (data || []) as Array<ManagementSearchResult & { total_count: number }>;
  return {
    results: rows.map(({ total_count: _totalCount, ...result }) => result),
    total: Number(rows[0]?.total_count || 0),
  };
}

export interface AdminSearchQualityDay {
  activity_date: string;
  searches: number;
  no_result_searches: number;
  search_result_clicks: number;
}

// This reader returns aggregates only; the database independently enforces super-admin access.
export async function getAdminSearchQualityMetrics(days: 7 | 30 | 90 = 30): Promise<AdminSearchQualityDay[]> {
  const { data, error } = await supabase.rpc('get_admin_search_quality_metrics', { p_days: days });
  if (error) throw new Error('Unable to load search quality metrics');
  return ((data || []) as AdminSearchQualityDay[]).map((row) => ({
    ...row,
    searches: Number(row.searches),
    no_result_searches: Number(row.no_result_searches),
    search_result_clicks: Number(row.search_result_clicks),
  }));
}

// User Management
// ============================================================
export async function getAdminUsers(params: {
  search?: string;
  role?: number;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ users: AdminUserDirectoryItem[]; total: number }> {
  const { data, error } = await supabase.rpc('get_admin_user_directory', {
    p_search: params.search?.trim().length && params.search.trim().length >= 3 ? params.search.trim() : null,
    p_role_id: params.role || null,
    p_status: params.status && params.status !== 'all' ? params.status : null,
    p_limit: params.limit || 20,
    p_offset: params.offset || 0,
  });
  if (error) throw new Error('Unable to load user directory');
  const rows = (data || []) as Array<{
    id: string; full_name: string | null; email: string; role_id: number; role_name: string;
    status: string; is_active: boolean; university_name: string | null; created_at: string; total_count: number;
  }>;
  return {
    users: rows.map((row) => ({
      id: row.id, full_name: row.full_name, email: row.email, role_id: Number(row.role_id),
      status: row.status, is_active: row.is_active, created_at: row.created_at,
      role: { name: row.role_name }, university: row.university_name ? { name: row.university_name } : null,
    })),
    total: rows[0]?.total_count || 0,
  };
}

export async function resetNonAdminAccounts(confirmation: string, reason: string): Promise<{ deletedUserCount: number }> {
  const { data, error } = await supabase.rpc('admin_reset_non_admin_accounts', {
    p_confirmation: confirmation,
    p_reason: reason,
  });
  if (error) throw new Error(error.message || 'Unable to reset non-admin accounts');
  return { deletedUserCount: Number((data as { deleted_user_count?: number } | null)?.deleted_user_count || 0) };
}

export async function getAdminStudents(params: {
  search?: string;
  verificationStatus?: string;
  accountStatus?: string;
  limit?: number;
  offset?: number;
}): Promise<{ students: AdminStudentDirectoryItem[]; total: number }> {
  const query = params.search?.trim() || '';
  const { data, error } = await supabase.rpc('get_admin_student_directory', {
    p_search: query.length >= 3 ? query : null,
    p_verification_status: params.verificationStatus || 'all',
    p_account_status: params.accountStatus || 'all',
    p_limit: params.limit || 25,
    p_offset: params.offset || 0,
  });
  if (error) throw new Error('Unable to load student directory');
  const rows = (data || []) as Array<AdminStudentDirectoryItem & { total_count: number }>;
  return {
    students: rows.map(({ total_count: _totalCount, ...student }) => ({
      ...student,
      total_orders: Number(student.total_orders),
      completed_orders: Number(student.completed_orders),
      unresolved_support_tickets: Number(student.unresolved_support_tickets),
      active_account_flags: Number(student.active_account_flags),
    })),
    total: Number(rows[0]?.total_count || 0),
  };
}

export async function setStudentAccountStatus(
  studentId: string,
  status: 'active' | 'suspended',
  reason: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('admin_set_student_account_status', {
    p_student_id: studentId,
    p_status: status,
    p_reason: reason,
  });
  if (error) return { error: 'Unable to update this student account. Refresh the record and verify your access and reason.' };
  return { error: null };
}

export async function suspendUser(userId: string, reason: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('set_profile_status', {
    p_target_user_id: userId,
    p_status: 'suspended',
    p_is_active: false,
    p_reason: reason,
  });
  if (error) return { error: 'Unable to suspend this user. Refresh the record and verify your access.' };

  return { error: null };
}

export async function reactivateUser(userId: string, reason: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('set_profile_status', {
    p_target_user_id: userId,
    p_status: 'active',
    p_is_active: true, p_reason: reason,
  });
  if (error) return { error: 'Unable to restore this user. Refresh the record and verify your access.' };

  return { error: null };
}

export async function assignUserRole(userId: string, roleId: number, reason: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('assign_application_role', {
    p_target_user_id: userId,
    p_new_role_id: roleId, p_reason: reason,
  });
  if (error) return { error: 'Unable to update this user role. Refresh the record and verify your access and reason.' };

  return { error: null };
}

// ============================================================
// Student Verification
// ============================================================
export async function getStudentVerifications(params: {
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ students: AdminStudentVerification[]; total: number }> {
  const { data, error } = await supabase.rpc('get_admin_student_verification_queue', {
    p_status: params.status || 'pending',
    p_limit: params.limit || 30,
    p_offset: params.offset || 0,
  });
  if (error) throw new Error('Unable to load student verification queue');
  const rows = (data || []) as Array<{
    id: string; user_id: string; student_id_number: string | null; program_of_study: string | null;
    faculty: string | null; department: string | null; level: string | null; verification_status: string;
    is_verified_student: boolean; has_student_id_document: boolean; rejection_reason: string | null;
    created_at: string; user_email: string; user_full_name: string | null; user_avatar_url: string | null;
    university_name: string | null; total_count: number;
  }>;
  return {
    students: rows.map((row) => ({
      id: row.id, user_id: row.user_id, student_id_number: row.student_id_number,
      program_of_study: row.program_of_study, faculty: row.faculty, department: row.department,
      level: row.level, verification_status: row.verification_status,
      is_verified_student: row.is_verified_student, has_student_id_document: row.has_student_id_document,
      rejection_reason: row.rejection_reason, created_at: row.created_at,
      user: {
        id: row.user_id, email: row.user_email, full_name: row.user_full_name, avatar_url: row.user_avatar_url,
        university: row.university_name ? { name: row.university_name } : null,
      },
    })),
    total: Number(rows[0]?.total_count || 0),
  };
}

export async function getStudentVerificationDocumentUrl(studentProfileId: string): Promise<{ url: string | null; error: string | null }> {
  let data: { signedUrl?: unknown } | null;
  let error: unknown;
  try {
    const result = await supabase.functions.invoke('get-student-verification-document-url', {
      body: { studentProfileId },
    });
    data = result.data;
    error = result.error;
  } catch {
    return { url: null, error: 'Unable to authorize access to this student document.' };
  }
  if (error || !data || typeof data.signedUrl !== 'string') {
    return { url: null, error: 'Unable to authorize access to this student document.' };
  }

  try {
    const signedUrl = new URL(data.signedUrl);
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl || signedUrl.origin !== new URL(supabaseUrl).origin
      || !signedUrl.pathname.startsWith('/storage/v1/object/sign/student-documents/')) {
      return { url: null, error: 'The document service returned an invalid link.' };
    }
    return { url: signedUrl.toString(), error: null };
  } catch {
    return { url: null, error: 'The document service returned an invalid link.' };
  }
}

export async function approveStudentVerification(studentProfileId: string, note?: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('review_student_verification', {
    p_student_profile_id: studentProfileId,
    p_approved: true,
    p_reason: note || null,
  });
  if (error) return { error: 'Unable to approve this student verification. Please retry.' };

  return { error: null };
}

export async function rejectStudentVerification(studentProfileId: string, reason: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('review_student_verification', {
    p_student_profile_id: studentProfileId,
    p_approved: false,
    p_reason: reason,
  });
  if (error) return { error: 'Unable to reject this student verification. Check the reason and retry.' };

  return { error: null };
}

// ============================================================
// Vendor Verification
// ============================================================
export async function getVendorVerifications(params: {
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ vendors: VendorVerificationQueueItem[]; total: number }> {
  const { data, error } = await supabase.rpc('get_vendor_verification_queue', {
    p_status: params.status || 'unverified',
    p_limit: params.limit || 30,
    p_offset: params.offset || 0,
  });
  if (error) throw new Error('Unable to load vendor verification queue');
  const rows = (data || []) as Array<{
    id: string; business_name: string; business_type: string | null; logo_url: string | null;
    contact_phone: string | null; is_verified: boolean; is_active: boolean; is_student_business: boolean;
    rating_avg: number; rating_count: number; created_at: string; university_name: string | null;
    owner_full_name: string | null; owner_email: string | null; total_count: number;
  }>;
  return {
    vendors: rows.map((row) => ({
      id: row.id, business_name: row.business_name, business_type: row.business_type, logo_url: row.logo_url,
      contact_phone: row.contact_phone, is_verified: row.is_verified, is_active: row.is_active,
      is_student_business: row.is_student_business, rating_avg: Number(row.rating_avg), rating_count: Number(row.rating_count),
      created_at: row.created_at, university: row.university_name ? { name: row.university_name } : null,
      owner: { full_name: row.owner_full_name, email: row.owner_email },
    })),
    total: rows[0]?.total_count || 0,
  };
}

export async function getVendorLocationReview(vendorId: string): Promise<VendorLocationReview | null> {
  const { data, error } = await supabase.rpc('get_vendor_location_review', { p_vendor_id: vendorId });
  if (error) throw new Error('Unable to load vendor location review');
  return (data || null) as VendorLocationReview | null;
}

export async function reviewVendorLocation(vendorId: string, status: 'verified' | 'rejected', note: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('review_vendor_location', { p_vendor_id: vendorId, p_status: status, p_note: note.trim() || null });
  return { error: error ? 'Unable to update the vendor location review.' : null };
}

export async function approveVendor(vendorId: string, reason: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('review_vendor_verification', {
    p_vendor_id: vendorId,
    p_approved: true,
    p_reason: reason.trim(),
  });
  if (error) return { error: 'Unable to approve this vendor. Refresh the queue and verify your access.' };

  return { error: null };
}

export async function rejectVendor(vendorId: string, reason: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('review_vendor_verification', {
    p_vendor_id: vendorId,
    p_approved: false,
    p_reason: reason,
  });
  if (error) return { error: 'Unable to reject this vendor. Refresh the queue and verify the reason.' };

  return { error: null };
}

export async function suspendVendor(vendorId: string, reason: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('set_vendor_active', {
    p_vendor_id: vendorId,
    p_is_active: false,
    p_reason: reason,
  });
  if (error) return { error: 'Unable to change vendor status. Refresh the record and verify the reason and access.' };

  return { error: null };
}

export async function restoreVendor(vendorId: string, reason: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('set_vendor_active', {
    p_vendor_id: vendorId,
    p_is_active: true,
    p_reason: reason.trim(),
  });
  if (error) return { error: 'Unable to change vendor status. Refresh the record and verify the reason and access.' };

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
}): Promise<{ vendors: AdminVendorDirectoryItem[]; total: number }> {
  const { data, error } = await supabase.rpc('get_admin_business_directory', {
    p_search: params.search?.trim().length && params.search.trim().length >= 3 ? params.search.trim() : null,
    p_verified: params.verified ?? null,
    p_limit: params.limit || 20,
    p_offset: params.offset || 0,
  });
  if (error) throw new Error('Unable to load businesses within your management scope.');
  const rows = (data || []) as Array<{
    id: string; business_name: string; business_type: string | null; is_verified: boolean; is_active: boolean;
    is_student_business: boolean; delivery_available: boolean; rating_avg: number; rating_count: number;
    created_at: string; university_name: string | null; owner_full_name: string | null;
    owner_email: string | null; total_count: number;
  }>;
  return {
    vendors: rows.map((row) => ({
      id: row.id, business_name: row.business_name, business_type: row.business_type,
      is_verified: row.is_verified, is_active: row.is_active, is_student_business: row.is_student_business,
      delivery_available: row.delivery_available, rating_avg: Number(row.rating_avg), rating_count: row.rating_count,
      created_at: row.created_at, university: row.university_name ? { name: row.university_name } : null,
      owner: row.owner_full_name || row.owner_email ? { full_name: row.owner_full_name, email: row.owner_email } : null,
    })),
    total: Number(rows[0]?.total_count || 0),
  };
}

// ============================================================
// University Management
// ============================================================
export async function getAdminUniversities(): Promise<Array<{ id: string; name: string; short_name: string; slug: string; city: string | null; region: string | null; country: string; logo_url: string | null; hero_image_url: string | null; logo_alt_text: string | null; hero_alt_text: string | null; image_credit: string | null; image_source: string | null; website_url: string | null; description: string | null; is_enabled: boolean; created_at: string }>> {
  const { data, error } = await supabase.rpc('get_admin_universities');
  if (error || !data) throw new Error('Unable to load universities within your management scope.');
  return data as Array<{ id: string; name: string; short_name: string; slug: string; city: string | null; region: string | null; country: string; logo_url: string | null; hero_image_url: string | null; logo_alt_text: string | null; hero_alt_text: string | null; image_credit: string | null; image_source: string | null; website_url: string | null; description: string | null; is_enabled: boolean; created_at: string }>;
}

export type UniversityAdminMembership = {
  user_id: string;
  full_name: string | null;
  email: string;
  is_active: boolean;
  assigned_at: string;
  revoked_at: string | null;
};

export type UniversityAdminCandidate = {
  user_id: string;
  full_name: string | null;
  email: string;
  current_role: string;
};

export async function getUniversityAdminMemberships(universityId: string): Promise<UniversityAdminMembership[]> {
  const { data, error } = await supabase.rpc('get_admin_university_memberships', { p_university_id: universityId });
  if (error || !data) throw new Error('Unable to load university administrators.');
  return data as UniversityAdminMembership[];
}

export async function searchUniversityAdminCandidates(universityId: string, search: string): Promise<UniversityAdminCandidate[]> {
  const { data, error } = await supabase.rpc('search_university_admin_candidates', {
    p_university_id: universityId,
    p_search: search,
  });
  if (error || !data) throw new Error('Unable to search eligible administrator accounts.');
  return data as UniversityAdminCandidate[];
}

export async function assignUniversityAdministrator(userId: string, universityId: string, reason: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('assign_university_administrator', {
    p_target_user_id: userId,
    p_university_id: universityId,
    p_reason: reason,
  });
  return { error: error ? 'Unable to assign this university administrator.' : null };
}

export async function revokeUniversityAdministrator(userId: string, universityId: string, reason: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('revoke_university_administrator', {
    p_target_user_id: userId,
    p_university_id: universityId,
    p_reason: reason,
  });
  return { error: error ? 'Unable to revoke this university administrator.' : null };
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
  return { error: error ? 'Unable to create university. Check the details and your permissions.' : null };
}

export async function updateUniversity(id: string, data: Record<string, unknown>): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('update_admin_university', {
    p_university_id: id, p_name: data.name, p_short_name: data.short_name, p_slug: data.slug,
    p_city: data.city || null, p_region: data.region || null, p_country: data.country || null,
    p_website_url: data.website_url || null, p_description: data.description || null,
    p_logo_alt_text: data.logo_alt_text || null, p_hero_alt_text: data.hero_alt_text || null,
    p_image_credit: data.image_credit || null, p_image_source: data.image_source || null,
  });
  return { error: error ? 'Unable to update university. Check the details and your permissions.' : null };
}

export async function updateUniversityBrandingMetadata(id: string, data: {
  logo_alt_text: string;
  hero_alt_text: string;
  image_credit: string;
  image_source: string;
}): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('update_admin_university_branding_metadata', {
    p_university_id: id,
    p_logo_alt_text: data.logo_alt_text || null,
    p_hero_alt_text: data.hero_alt_text || null,
    p_image_credit: data.image_credit || null,
    p_image_source: data.image_source || null,
  });
  return { error: error ? 'Unable to update branding metadata within your university scope.' : null };
}

export async function toggleUniversityEnabled(id: string, enabled: boolean): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('set_admin_university_enabled', { p_university_id: id, p_enabled: enabled });
  return { error: error ? 'Unable to update university status. Verify your permissions and try again.' : null };
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
    .upload(path, file, { contentType: file.type || `image/${ext}`, upsert: false });

  if (uploadError) {
    return {
      url: null,
      error: 'Unable to upload this image. Check its format, size, and your university permissions.',
    };
  }

  const { error: updateError } = await supabase.rpc('set_admin_university_branding', {
    p_university_id: universityId, p_image_type: imageType, p_object_path: path,
  });
  if (updateError) {
    // Do not leave an unlinked asset behind when the protected record update
    // fails. The removal is best-effort; the original error is more useful.
    await supabase.storage.from('university-branding').remove([path]);
    return { url: null, error: 'The image uploaded but could not be linked to this university. Refresh and retry.' };
  }
  return { url: supabase.storage.from('university-branding').getPublicUrl(path).data.publicUrl, error: null };
}

export async function removeUniversityImage(
  universityId: string,
  imageType: 'logo' | 'hero'
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('set_admin_university_branding', {
    p_university_id: universityId, p_image_type: imageType, p_object_path: null,
  });
  return { error: error ? 'Unable to remove this university image. Verify your permissions and try again.' : null };
}

// ============================================================
// Category Management
// ============================================================
export async function getAdminCategories(): Promise<Category[]> {
  const { data, error } = await supabase.rpc('get_admin_category_directory', { p_limit: 100, p_offset: 0 });
  if (error) throw new Error('Unable to load categories');
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
  return { error: error ? 'Unable to create category. Check the details and your permissions.' : null };
}

export async function updateCategory(id: string, data: Record<string, unknown>): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('update_admin_category', {
    p_category_id: id, p_name: data.name, p_slug: data.slug, p_description: data.description || null,
    p_icon: data.icon || null, p_parent_id: data.parent_id || null,
    p_sort_order: data.sort_order ?? 0, p_is_visible: data.is_visible ?? true,
  });
  return { error: error ? 'Unable to update category. Check the details and your permissions.' : null };
}

export async function deleteCategory(id: string, reason: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('delete_admin_category', { p_category_id: id, p_reason: reason });
  return { error: error ? 'Unable to delete category. Verify that it is unused and try again.' : null };
}

// ============================================================
// Subscriptions
// ============================================================
export async function getAdminSubscriptions(params: {
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ subscriptions: AdminSubscription[]; total: number }> {
  const { data, error } = await supabase.rpc('get_admin_subscription_directory', {
    p_status: params.status && params.status !== 'all' ? params.status : null,
    p_limit: params.limit || 20,
    p_offset: params.offset || 0,
  });
  if (error) throw new Error('Unable to load authorized subscriptions');
  const rows = (data || []) as Array<{
    id: string; vendor_id: string; plan: string; status: string; started_at: string; ends_at: string | null;
    amount: number | null; currency: string; created_at: string; business_name: string; business_slug: string; total_count: number;
  }>;
  return {
    subscriptions: rows.map(row => ({
      id: row.id, vendor_id: row.vendor_id, plan: row.plan, status: row.status, started_at: row.started_at,
      ends_at: row.ends_at, amount: row.amount, currency: row.currency, created_at: row.created_at,
      vendor: { business_name: row.business_name, business_slug: row.business_slug },
    })),
    total: rows[0]?.total_count || 0,
  };
}

export async function extendSubscription(subId: string, days: number, note: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('admin_extend_subscription', {
    p_subscription_id: subId,
    p_days: days,
    p_note: note || null,
  });
  return { error: error ? 'Unable to extend the subscription. Verify its status and your permissions.' : null };
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

export async function approveAdvertisement(adId: string, priority: number, featured: boolean, sponsored: boolean, reason: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('review_admin_advertisement', {
    p_advertisement_id: adId, p_decision: 'approved', p_priority: priority,
    p_featured: featured, p_sponsored: sponsored, p_rejection_reason: reason.trim(),
  });
  return { error: error ? 'Unable to approve this advertisement. Verify its state and your permissions.' : null };
}

export async function rejectAdvertisement(adId: string, reason: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('review_admin_advertisement', {
    p_advertisement_id: adId, p_decision: 'rejected', p_priority: 0,
    p_featured: false, p_sponsored: false, p_rejection_reason: reason,
  });
  return { error: error ? 'Unable to reject this advertisement. Verify its state, reason, and your permissions.' : null };
}

export async function getAdminReviewQueue(params: {
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ reviews: AdminReviewQueueItem[]; total: number }> {
  const { data, error } = await supabase.rpc('get_admin_review_moderation_queue', {
    p_status: params.status || 'pending_review',
    p_search: params.search?.trim() || null,
    p_limit: params.limit || 25,
    p_offset: params.offset || 0,
  });
  if (error) throw new Error('Unable to load review moderation queue');
  const rows = (data || []) as Array<AdminReviewQueueItem & { total_count: number }>;
  return {
    reviews: rows.map(({ total_count: _totalCount, ...review }) => review),
    total: Number(rows[0]?.total_count || 0),
  };
}

export async function moderateAdminReview(
  reviewId: string,
  decision: 'published' | 'hidden' | 'removed',
  reason?: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('moderate_admin_review', {
    p_review_id: reviewId,
    p_decision: decision,
    p_note: reason?.trim() || null,
  });
  return { error: error ? 'Unable to update review moderation status' : null };
}

// ============================================================
// Order Monitoring (read-only)
// ============================================================
export async function getAdminDeliveryOperations(params: {
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ orders: AdminDeliveryItem[]; total: number }> {
  const { data, error } = await supabase.rpc('get_admin_delivery_operations', {
    p_status: params.status && params.status !== 'all' ? params.status : null,
    p_search: params.search?.trim().length && params.search.trim().length >= 3 ? params.search.trim() : null,
    p_limit: params.limit || 50,
    p_offset: params.offset || 0,
  });
  if (error) throw new Error('Unable to load delivery operations');
  const rows = (data || []) as Array<AdminDeliveryItem & { total_count: number }>;
  return { orders: rows.map(({ total_count: _count, ...order }) => order), total: Number(rows[0]?.total_count || 0) };
}

export async function getAdminOrders(params: {
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ orders: AdminOrder[]; total: number }> {
  const { data, error } = await supabase.rpc('get_admin_order_monitoring', {
    p_status: params.status && params.status !== 'all' ? params.status : null,
    p_search: params.search?.trim() || null,
    p_limit: params.limit || 20,
    p_offset: params.offset || 0,
  });
  if (error) throw new Error('Unable to load orders');
  const rows = (data || []) as Array<{
    id: string; order_number: string | null; buyer_id: string; buyer_full_name: string | null;
    buyer_email: string; vendor_id: string | null; vendor_business_name: string | null;
    status: string; total_amount: number; order_type: string; delivery_method: string | null;
    created_at: string; completed_at: string | null; items_count: number; total_count: number;
  }>;
  return {
    orders: rows.map((row) => ({
      id: row.id, order_number: row.order_number, buyer_id: row.buyer_id, vendor_id: row.vendor_id,
      status: row.status, total_amount: Number(row.total_amount), order_type: row.order_type,
      delivery_method: row.delivery_method, created_at: row.created_at, completed_at: row.completed_at,
      items_count: row.items_count,
      buyer: { full_name: row.buyer_full_name, email: row.buyer_email },
      vendor: row.vendor_business_name ? { business_name: row.vendor_business_name } : null,
    })),
    total: rows[0]?.total_count || 0,
  };
}

export async function getOrderStats(): Promise<{ total: number; completed: number; cancelled: number; pending: number }> {
  const { data, error } = await supabase.rpc('get_admin_order_monitoring_summary');
  if (error || !data?.[0]) throw new Error('Unable to load order summary');
  const summary = data[0] as { total: number; completed: number; cancelled: number; pending: number };
  return {
    total: Number(summary.total),
    completed: Number(summary.completed),
    cancelled: Number(summary.cancelled),
    pending: Number(summary.pending),
  };
}

// ============================================================
// Moderation / Reports
// ============================================================
export async function getAdminEventModerationFlags(params: {
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ flags: AdminEventModerationFlag[]; total: number }> {
  const { data, error } = await supabase.rpc('get_admin_event_moderation_queue', {
    p_status: params.status || 'pending',
    p_limit: params.limit || 30,
    p_offset: params.offset || 0,
  });
  if (error) throw new Error('Unable to load event moderation queue');
  const rows = (data || []) as Array<AdminEventModerationFlag & { total_count: number }>;
  return { flags: rows.map(({ total_count: _count, ...flag }) => flag), total: Number(rows[0]?.total_count || 0) };
}

export async function reviewAdminEventFlag(flagId: string, action: 'dismiss' | 'hide' | 'publish', reason: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('review_admin_event_flag', {
    p_flag_id: flagId,
    p_action: action,
    p_reason: reason.trim(),
  });
  return { error: error ? 'Unable to complete event moderation. Refresh the queue and verify the reason.' : null };
}

export async function getAdminEventOperations(params: {
  visibility?: 'all' | 'published' | 'draft'; limit?: number; offset?: number;
}): Promise<{ events: AdminEventOperationRow[]; total: number }> {
  const { data, error } = await supabase.rpc('get_admin_event_operations', {
    p_visibility: params.visibility || 'all', p_limit: params.limit || 30, p_offset: params.offset || 0,
  });
  if (error) throw new Error('Unable to load event operations');
  const rows = (data || []) as Array<AdminEventOperationRow & { total_count: number }>;
  return { events: rows.map(({ total_count: _count, ...event }) => event), total: Number(rows[0]?.total_count || 0) };
}

export async function setAdminEventVisibility(eventId: string, published: boolean, reason: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('set_admin_event_visibility', {
    p_event_id: eventId, p_is_published: published, p_reason: reason.trim(),
  });
  return { error: error ? 'Unable to update event visibility. Refresh and check your scope and reason.' : null };
}

export async function getAdminModerationCases(params: {
  status?: string;
  severity?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ cases: AdminModerationCase[]; total: number }> {
  const { data, error } = await supabase.rpc('get_admin_moderation_cases', {
    p_status: params.status && params.status !== 'all' ? params.status : null,
    p_severity: params.severity && params.severity !== 'all' ? params.severity : null,
    p_search: params.search?.trim().length && params.search.trim().length >= 3 ? params.search.trim() : null,
    p_limit: params.limit || 30,
    p_offset: params.offset || 0,
  });
  if (error) throw new Error('Unable to load Trust and Safety cases');
  const rows = (data || []) as Array<AdminModerationCase & { total_count: number }>;
  return { cases: rows.map(({ total_count: _count, ...item }) => item), total: Number(rows[0]?.total_count || 0) };
}

export async function updateAdminModerationCase(caseId: string, status: string, reason: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('update_admin_moderation_case', {
    p_case_id: caseId,
    p_next_status: status,
    p_reason: reason.trim(),
  });
  return { error: error ? 'Unable to update the case. Verify the reason and allowed transition, then retry.' : null };
}

export async function getAdminModerationReviewers(): Promise<AdminModerationReviewer[]> {
  const { data, error } = await supabase.rpc('get_admin_moderation_reviewers');
  if (error) throw new Error('Unable to load Trust and Safety reviewers');
  return (data || []) as AdminModerationReviewer[];
}

export async function assignAdminModerationCase(caseId: string, assigneeId: string | null, reason: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('assign_admin_moderation_case', {
    p_case_id: caseId,
    p_assignee_id: assigneeId,
    p_reason: reason.trim(),
  });
  return { error: error ? 'Unable to assign the case. Confirm the reviewer and provide a reason, then retry.' : null };
}

export async function getAdminModerationCaseEvents(caseId: string): Promise<AdminModerationCaseEvent[]> {
  const { data, error } = await supabase.rpc('get_admin_moderation_case_events', {
    p_case_id: caseId,
    p_limit: 100,
  });
  if (error) throw new Error('Unable to load case activity');
  return (data || []) as AdminModerationCaseEvent[];
}

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

  const { data, count, error } = await query;
  if (error) throw new Error('Unable to load reports');
  return { reports: (data || []) as unknown as AdminReport[], total: count || 0 };
}

export async function resolveReport(reportId: string, note: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('resolve_admin_report', { p_report_id: reportId, p_resolution_note: note });
  return { error: error ? 'Unable to resolve the report. Check your permission and resolution note, then retry.' : null };
}

// ============================================================
// Support Tickets
// ============================================================
export async function getAdminTickets(params: {
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<AdminQueryResult<{ tickets: SupportTicket[]; total: number }>> {
  const limit = params.limit || 20;
  const offset = params.offset || 0;
  let data: unknown;
  try {
    const result = await supabase.rpc('get_admin_support_tickets', {
      p_status: params.status && params.status !== 'all' ? params.status : null,
      p_limit: limit,
      p_offset: offset,
    });
    if (result.error) return { ok: false, error: 'Unable to load support tickets.' };
    data = result.data;
  } catch {
    return { ok: false, error: 'Unable to load support tickets.' };
  }
  const rows = (data || []) as Array<{
    id: string; ticket_number: string | null; user_id: string; user_full_name: string | null; user_email: string;
    subject: string; category: string; status: string; priority: string; assigned_to: string | null;
    assignee_full_name: string | null; created_at: string; updated_at: string; total_count: number;
  }>;
  return {
    ok: true,
    data: {
      tickets: rows.map((row) => ({
        id: row.id, ticket_number: row.ticket_number, user_id: row.user_id,
        subject: row.subject, description: null, category: row.category, status: row.status,
        priority: row.priority, assigned_to: row.assigned_to, internal_notes: null,
        closed_at: null, closed_by: null, created_at: row.created_at, updated_at: row.updated_at,
        user: { full_name: row.user_full_name, email: row.user_email, avatar_url: null },
        assignee: row.assignee_full_name ? { full_name: row.assignee_full_name } : null,
      })),
      total: Number(rows[0]?.total_count || 0),
    },
  };
}

export async function getTicketById(ticketId: string): Promise<SupportTicket> {
  let data: unknown;
  try {
    const result = await supabase.rpc('get_admin_support_ticket_detail', { p_ticket_id: ticketId });
    if (result.error) throw new Error('Unable to load support ticket details.');
    data = result.data;
  } catch {
    throw new Error('Unable to load support ticket details.');
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('Support ticket was not returned.');
  const ticket = row as {
    id: string; ticket_number: string | null; user_id: string; user_full_name: string | null; user_email: string;
    subject: string; description: string | null; category: string; status: string; priority: string;
    assigned_to: string | null; assignee_full_name: string | null; created_at: string; updated_at: string;
  };
  return {
    id: ticket.id, ticket_number: ticket.ticket_number, user_id: ticket.user_id,
    subject: ticket.subject, description: ticket.description, category: ticket.category, status: ticket.status,
    priority: ticket.priority, assigned_to: ticket.assigned_to, internal_notes: null, closed_at: null, closed_by: null,
    created_at: ticket.created_at, updated_at: ticket.updated_at,
    user: { full_name: ticket.user_full_name, email: ticket.user_email, avatar_url: null },
    assignee: ticket.assignee_full_name ? { full_name: ticket.assignee_full_name } : null,
  };
}

export async function getTicketReplies(ticketId: string): Promise<AdminQueryResult<TicketReply[]>> {
  let data: unknown;
  try {
    const result = await supabase.rpc('get_admin_support_ticket_replies', { p_ticket_id: ticketId });
    if (result.error) return { ok: false, error: 'Unable to load ticket replies.' };
    data = result.data;
  } catch {
    return { ok: false, error: 'Unable to load ticket replies.' };
  }
  const rows = (data || []) as Array<{
    id: string; author_id: string; author_full_name: string | null; author_email: string; body: string;
    is_internal: boolean; created_at: string;
  }>;
  return {
    ok: true,
    data: rows.map((row) => ({
      id: row.id, ticket_id: ticketId, author_id: row.author_id, body: row.body, is_internal: row.is_internal,
      created_at: row.created_at,
      author: { full_name: row.author_full_name, avatar_url: null, email: row.author_email },
    })),
  };
}

export async function replyToTicket(ticketId: string, body: string, isInternal: boolean): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.rpc('add_admin_ticket_reply', {
      p_ticket_id: ticketId, p_body: body, p_is_internal: isInternal,
    });
    return { error: error ? 'Unable to send the support reply. Check ticket status and permission, then retry.' : null };
  } catch {
    return { error: 'Unable to send the support reply. Please try again.' };
  }
}

export async function getAdminSupportAssignees(): Promise<AdminQueryResult<AdminSupportAssignee[]>> {
  try {
    const { data, error } = await supabase.rpc('get_admin_support_assignees');
    if (error) return { ok: false, error: 'Unable to load eligible support operators.' };
    return { ok: true, data: (data || []) as AdminSupportAssignee[] };
  } catch {
    return { ok: false, error: 'Unable to load eligible support operators.' };
  }
}

export async function assignTicket(ticketId: string, assigneeId: string | null, reason: string): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.rpc('assign_admin_support_ticket', {
      p_ticket_id: ticketId,
      p_assignee_id: assigneeId,
      p_reason: reason,
    });
    return { error: error ? 'Unable to update ticket assignment. Check the selected operator and reason, then retry.' : null };
  } catch {
    return { error: 'Unable to update ticket assignment. Please try again.' };
  }
}

export async function closeTicket(ticketId: string, reason: string): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.rpc('close_admin_support_ticket', { p_ticket_id: ticketId, p_reason: reason.trim() });
    return { error: error ? 'Unable to close the support ticket. Check its status and permission, then retry.' : null };
  } catch {
    return { error: 'Unable to close the support ticket. Please try again.' };
  }
}

export async function createTicket(data: {
  subject: string;
  description: string;
  category: string;
}): Promise<{ data: Pick<SupportTicket, 'id' | 'ticket_number' | 'subject' | 'status' | 'priority' | 'created_at'> | null; error: string | null }> {
  // The database derives the requester, ticket number, priority, and initial state.
  try {
    const { data: ticket, error } = await supabase.rpc('create_support_ticket', {
      p_subject: data.subject,
      p_description: data.description,
      p_category: data.category,
    });
    if (error || !ticket) return { data: null, error: 'Unable to create support ticket. Check the details and try again.' };
    return { data: ticket as Pick<SupportTicket, 'id' | 'ticket_number' | 'subject' | 'status' | 'priority' | 'created_at'>, error: null };
  } catch {
    return { data: null, error: 'Unable to create support ticket. Please try again.' };
  }
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

  const { data, error } = await query;
  if (error) throw new Error('Unable to load CMS pages');
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
  return { error: error ? 'Unable to create CMS page. Verify the details and try again.' : null };
}

export async function updateCmsPage(id: string, data: Record<string, unknown>): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('update_admin_cms_page', {
    p_page_id: id, p_slug: data.slug, p_title: data.title, p_content: data.content,
    p_page_type: data.page_type, p_meta_description: data.meta_description || null,
    p_is_published: data.is_published ?? false, p_sort_order: data.sort_order ?? 0,
  });
  return { error: error ? 'Unable to update CMS page. Verify the details and try again.' : null };
}

export async function deleteCmsPage(id: string, reason: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('delete_admin_cms_page', { p_page_id: id, p_reason: reason });
  return { error: error ? 'Unable to delete CMS page. Please retry.' : null };
}

export async function getAdminFaq(): Promise<CmsFaqEntry[]> {
  const { data, error } = await supabase
    .from('cms_faq_entries')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) throw new Error('Unable to load FAQ entries');
  return (data || []) as CmsFaqEntry[];
}

export async function createFaqEntry(data: { question: string; answer: string; category?: string }): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('create_admin_faq', { p_question: data.question, p_answer: data.answer, p_category: data.category || 'General', p_sort_order: 0, p_is_published: true });
  return { error: error ? 'Unable to create FAQ entry. Verify the details and try again.' : null };
}

export async function updateFaqEntry(id: string, data: Record<string, unknown>): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('update_admin_faq', { p_faq_id: id, p_question: data.question, p_answer: data.answer, p_category: data.category || 'General', p_sort_order: data.sort_order ?? 0, p_is_published: data.is_published ?? true });
  return { error: error ? 'Unable to update FAQ entry. Verify the details and try again.' : null };
}

export async function deleteFaqEntry(id: string, reason: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('delete_admin_faq', { p_faq_id: id, p_reason: reason });
  return { error: error ? 'Unable to delete FAQ entry. Please retry.' : null };
}

// ============================================================
// Announcements
// ============================================================
export async function getAdminAnnouncements(): Promise<Announcement[]> {
  const { data, error } = await supabase.rpc('get_admin_announcements');
  if (error) throw new Error('Unable to load announcements');
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
  reason: string;
}): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('create_admin_announcement', { p_title: data.title, p_body: data.body, p_type: data.type, p_target_audience: data.target_audience, p_university_id: data.university_id || null, p_starts_at: data.starts_at || null, p_ends_at: data.ends_at || null, p_reason: data.reason });
  return { error: error ? 'Unable to create announcement. Verify its audience, dates, and permissions.' : null };
}

export async function updateAnnouncement(id: string, data: Record<string, unknown> & { reason: string }): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('update_admin_announcement', { p_announcement_id: id, p_title: data.title, p_body: data.body, p_type: data.type, p_target_audience: data.target_audience, p_university_id: data.university_id || null, p_is_active: data.is_active ?? true, p_starts_at: data.starts_at, p_ends_at: data.ends_at, p_reason: data.reason });
  return { error: error ? 'Unable to update announcement. Verify its audience, dates, and permissions.' : null };
}

export async function deleteAnnouncement(id: string, reason: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('delete_admin_announcement', { p_announcement_id: id, p_reason: reason });
  return { error: error ? 'Unable to delete announcement. Please retry.' : null };
}

// ============================================================
// Audit Logs / Admin Actions
// ============================================================
export async function getAdminRecentActivity(limit = 10): Promise<AdminRecentActivityItem[]> {
  const { data, error } = await supabase.rpc('get_admin_recent_activity', { p_limit: limit });
  if (error) throw new Error('Unable to load recent management activity');
  return (data || []) as AdminRecentActivityItem[];
}

export async function getAdminOperationalAlerts(): Promise<AdminOperationalAlert[]> {
  const { data, error } = await supabase.rpc('get_admin_operational_alerts');
  if (error) throw new Error('Unable to load authorized operational alerts');
  return (data || []).map((row: AdminOperationalAlert) => ({
    ...row,
    affected_count: Number(row.affected_count),
  }));
}

export async function getAdminActions(params: {
  module?: string;
  actionSearch?: string;
  actorId?: string;
  targetId?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
}): Promise<{ actions: AdminAction[]; total: number }> {
  const actorId = params.actorId?.trim() || '';
  const targetId = params.targetId?.trim() || '';
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (actorId && !uuidPattern.test(actorId)) throw new Error('Enter a valid actor profile UUID.');
  if (targetId && !uuidPattern.test(targetId)) throw new Error('Enter a valid target resource UUID.');
  const isCalendarDate = (value?: string) => !value || (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
  );
  if (!isCalendarDate(params.fromDate) || !isCalendarDate(params.toDate)) {
    throw new Error('Enter valid audit dates.');
  }
  if (params.fromDate && params.toDate && params.fromDate > params.toDate) {
    throw new Error('Start date must not be after end date.');
  }
  const { data, error } = await supabase.rpc('get_admin_action_log_filtered', {
    p_module: params.module && params.module !== 'all' ? params.module : null,
    p_action_search: params.actionSearch?.trim().length && params.actionSearch.trim().length >= 3
      ? params.actionSearch.trim()
      : null,
    p_actor_id: actorId || null,
    p_target_id: targetId || null,
    p_from_date: params.fromDate || null,
    p_to_date: params.toDate || null,
    p_limit: params.limit || 50,
    p_offset: params.offset || 0,
  });
  if (error) throw new Error('Unable to load audit logs');
  const rows = (data || []) as Array<{
    id: string; admin_id: string; admin_full_name: string | null; admin_email: string;
    action: string; module: string; target_type: string | null; target_id: string | null;
    reason: string | null; result: string; created_at: string; total_count: number;
  }>;
  return {
    actions: rows.map((row) => ({
      id: row.id, admin_id: row.admin_id, action: row.action, module: row.module,
      target_type: row.target_type, target_id: row.target_id, reason: row.reason, metadata: {}, ip_address: null,
      result: row.result, created_at: row.created_at,
      admin: { full_name: row.admin_full_name, email: row.admin_email, avatar_url: null },
    })),
    total: rows[0]?.total_count || 0,
  };
}

    // Silent fail — logging is best-effort
// ============================================================
// Role & Permission Management
// ============================================================
export async function getRolePermissions(): Promise<Array<{ id: string; role: string; permission: string }>> {
  const { data, error } = await supabase.rpc('get_admin_role_permissions');
  if (error) throw new Error('Unable to load assigned moderator permissions');
  return ((data || []) as Array<{ role: string; permission: string }>).map(row => ({
    id: `${row.role}:${row.permission}`,
    role: row.role,
    permission: row.permission,
  }));
}

export async function updateModeratorPermissions(permissions: string[], reason: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('update_admin_moderator_permissions', {
    p_permissions: permissions,
    p_reason: reason,
  });
  return { error: error ? 'Unable to update moderator permissions. Check authority and reason, then retry.' : null };
}

// ============================================================
// Analytics
// ============================================================
export async function getAdminControlCenterSummary(days = 30): Promise<AdminControlCenterSummary> {
  const { data, error } = await supabase.rpc('get_admin_control_center_summary', { p_days: days });
  if (error || !data || typeof data !== 'object') {
    throw new Error('Unable to load authorized management overview.');
  }
  return data as AdminControlCenterSummary;
}

/** The database derives all university scope from the authenticated membership rows. */
export async function getAdminUniversityControlCenterSummary(days = 30): Promise<AdminUniversityControlCenterSummary> {
  const { data, error } = await supabase.rpc('get_admin_university_control_center_summary', { p_days: days });
  if (error || !data || typeof data !== 'object') {
    throw new Error('Unable to load the authorized university overview.');
  }
  return data as AdminUniversityControlCenterSummary;
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
