'use client';

import { supabase } from '@/lib/supabase/client';
import type {
  SavedItem,
  RecentlyViewed,
  StudentPreferences,
  ItemType,
  ConversationWithDetails,
  ReviewWithDetails,
} from '@/lib/types/student';

// ============================================================
// Saved Items
// ============================================================

export async function toggleSaveItem(
  itemType: ItemType,
  itemId: string,
  collection?: string
): Promise<{ saved: boolean; error: string | null }> {
  const { data: existing } = await supabase
    .from('saved_items')
    .select('id')
    .eq('item_type', itemType)
    .eq('item_id', itemId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('saved_items')
      .delete()
      .eq('id', existing.id);
    return { saved: false, error: error?.message || null };
  }

  const { error } = await supabase
    .from('saved_items')
    .insert({ item_type: itemType, item_id: itemId, collection: collection || null });
  return { saved: !error, error: error?.message || null };
}

export async function isItemSaved(itemType: ItemType, itemId: string): Promise<boolean> {
  const { data } = await supabase
    .from('saved_items')
    .select('id')
    .eq('item_type', itemType)
    .eq('item_id', itemId)
    .maybeSingle();
  return !!data;
}

export async function getSavedItemIds(itemType: ItemType): Promise<Set<string>> {
  const { data } = await supabase
    .from('saved_items')
    .select('item_id')
    .eq('item_type', itemType);
  return new Set((data || []).map((r) => r.item_id));
}

export async function getSavedItems(itemType?: ItemType): Promise<SavedItem[]> {
  let query = supabase.from('saved_items').select('*').order('created_at', { ascending: false });
  if (itemType) query = query.eq('item_type', itemType);
  const { data } = await query;
  return (data || []) as SavedItem[];
}

export async function getSavedItemCounts(): Promise<Record<ItemType, number>> {
  const { data } = await supabase
    .from('saved_items')
    .select('item_type');
  const counts: Record<ItemType, number> = { business: 0, product: 0, service: 0, event: 0 };
  (data || []).forEach((r) => {
    counts[r.item_type as ItemType] = (counts[r.item_type as ItemType] || 0) + 1;
  });
  return counts;
}

export async function updateSavedItemCollection(id: string, collection: string | null) {
  const { error } = await supabase.from('saved_items').update({ collection }).eq('id', id);
  return { error: error?.message || null };
}

export async function deleteSavedItem(id: string) {
  const { error } = await supabase.from('saved_items').delete().eq('id', id);
  return { error: error?.message || null };
}

// ============================================================
// Recently Viewed
// ============================================================

export async function trackRecentlyViewed(itemType: ItemType, itemId: string) {
  const { data: existing } = await supabase
    .from('recently_viewed')
    .select('id')
    .eq('item_type', itemType)
    .eq('item_id', itemId)
    .maybeSingle();

  if (existing) {
    await supabase.from('recently_viewed').update({ viewed_at: new Date().toISOString() }).eq('id', existing.id);
  } else {
    await supabase.from('recently_viewed').insert({ item_type: itemType, item_id: itemId });
  }
}

export async function getRecentlyViewed(itemType?: ItemType, limit = 10): Promise<RecentlyViewed[]> {
  let query = supabase
    .from('recently_viewed')
    .select('*')
    .order('viewed_at', { ascending: false })
    .limit(limit);
  if (itemType) query = query.eq('item_type', itemType);
  const { data } = await query;
  return (data || []) as RecentlyViewed[];
}

// ============================================================
// Student Preferences
// ============================================================

export async function getStudentPreferences(): Promise<StudentPreferences | null> {
  const { data } = await supabase
    .from('student_preferences')
    .select('*')
    .maybeSingle();
  return data as StudentPreferences | null;
}

export async function upsertStudentPreferences(
  prefs: Partial<Pick<StudentPreferences, 'interests' | 'notification_preferences' | 'privacy_settings'>>
): Promise<{ error: string | null }> {
  const { data: existing } = await supabase
    .from('student_preferences')
    .select('id')
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('student_preferences')
      .update({ ...prefs, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
    return { error: error?.message || null };
  }

  const { error } = await supabase.from('student_preferences').insert(prefs);
  return { error: error?.message || null };
}

// ============================================================
// Reviews
// ============================================================

export async function createReview(params: {
  vendorId?: string;
  productId?: string;
  eventId?: string;
  rating: number;
  comment: string;
}): Promise<{ error: string | null }> {
  const { data: existing } = await supabase
    .from('reviews')
    .select('id')
    .eq('vendor_id', params.vendorId || null)
    .eq('reviewer_id', (await supabase.auth.getUser()).data.user?.id)
    .maybeSingle();

  if (existing) {
    return { error: 'You have already reviewed this business.' };
  }

  const { error } = await supabase.from('reviews').insert({
    reviewer_id: (await supabase.auth.getUser()).data.user?.id,
    vendor_id: params.vendorId || null,
    product_id: params.productId || null,
    event_id: params.eventId || null,
    rating: params.rating,
    comment: params.comment,
    is_approved: true,
  });
  return { error: error?.message || null };
}

export async function updateReview(id: string, rating: number, comment: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('reviews').update({ rating, comment }).eq('id', id);
  return { error: error?.message || null };
}

export async function deleteReview(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('reviews').delete().eq('id', id);
  return { error: error?.message || null };
}

export async function getMyReviews(): Promise<ReviewWithDetails[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from('reviews')
    .select(`
      *,
      reviewer:profiles!reviews_reviewer_id_fkey(full_name, avatar_url),
      vendor:vendors!reviews_vendor_id_fkey(business_name, business_slug)
    `)
    .eq('reviewer_id', user.id)
    .order('created_at', { ascending: false });
  return (data || []) as unknown as ReviewWithDetails[];
}

export async function checkExistingReview(vendorId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase
    .from('reviews')
    .select('id')
    .eq('vendor_id', vendorId)
    .eq('reviewer_id', user.id)
    .maybeSingle();
  return !!data;
}

// ============================================================
// Notifications
// ============================================================

export async function getNotifications(limit = 20) {
  const { data } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  return data || [];
}

export async function getUnreadNotificationCount(): Promise<number> {
  const { count } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('is_read', false);
  return count || 0;
}

export async function markNotificationRead(id: string) {
  await supabase.rpc('set_own_notification_read_state', { p_notification_id: id, p_is_read: true });
}

export async function markAllNotificationsRead() {
  await supabase.rpc('mark_all_own_notifications_read', { p_category: null });
}

export async function deleteNotification(id: string) {
  await supabase.rpc('dismiss_own_notification', { p_notification_id: id });
}

// ============================================================
// Student Profile
// ============================================================

export async function updateStudentProfile(
  studentProfileId: string,
  updates: {
    program_of_study?: string;
    faculty?: string;
    department?: string;
    level?: string;
    admission_year?: number;
    graduation_year?: number;
  }
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('student_profiles')
    .update(updates)
    .eq('id', studentProfileId);
  return { error: error?.message || null };
}

export function calculateProfileCompletion(profile: {
  avatar_url?: string | null;
  full_name?: string | null;
  phone?: string | null;
  bio?: string | null;
}, studentProfile: {
  program_of_study?: string | null;
  faculty?: string | null;
  department?: string | null;
  level?: string | null;
  graduation_year?: number | null;
  is_verified_student?: boolean | null;
} | null, preferences: { interests?: string[] } | null): number {
  let completed = 0;
  let total = 10;

  if (profile.avatar_url) completed++;
  if (profile.full_name) completed++;
  if (profile.phone) completed++;
  if (profile.bio) completed++;

  if (studentProfile) {
    if (studentProfile.program_of_study) completed++;
    if (studentProfile.faculty) completed++;
    if (studentProfile.department) completed++;
    if (studentProfile.level) completed++;
    if (studentProfile.graduation_year) completed++;
  }

  if (studentProfile?.is_verified_student) completed++;

  if (preferences?.interests && preferences.interests.length > 0) completed++;

  total = 11;
  return Math.round((completed / total) * 100);
}
