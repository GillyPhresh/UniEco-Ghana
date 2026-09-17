import { supabase } from '@/lib/supabase/client';

export type AnalyticsEventType =
  | 'page_view' | 'university_view' | 'business_view' | 'product_view' | 'service_view'
  | 'search' | 'search_result_click' | 'vendor_profile_visit' | 'product_click' | 'service_click'
  | 'event_view' | 'marketplace_interaction' | 'cart_add' | 'cart_remove' | 'checkout_started'
  | 'message_opened' | 'ad_impression' | 'ad_click' | 'review_submitted'
  | 'registration_started' | 'registration_completed' | 'vendor_registration_started' | 'vendor_registration_completed';

export type AnalyticsSubjectType = 'university' | 'business' | 'product' | 'service' | 'event' | 'advertisement';
export type AnalyticsEvent = { event_type: AnalyticsEventType; subject_type?: AnalyticsSubjectType; subject_id?: string; result_count?: number };

const pending: AnalyticsEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | undefined;

/** Batches at most 20 non-sensitive interaction classifications per RPC. */
export function trackAnalyticsEvent(event: AnalyticsEvent): void {
  pending.push(event);
  if (pending.length >= 20) void flushAnalyticsEvents();
  if (!flushTimer) flushTimer = setTimeout(() => void flushAnalyticsEvents(), 3000);
}

export async function flushAnalyticsEvents(): Promise<void> {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = undefined; }
  const batch = pending.splice(0, 20);
  if (!batch.length) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase.rpc('record_analytics_events', { p_events: batch });
  if (error) return;
  if (pending.length) void flushAnalyticsEvents();
}

export async function getVendorAnalyticsDashboard(days = 30): Promise<Record<string, number>> {
  const { data } = await supabase.rpc('get_vendor_analytics_dashboard', { p_days: days });
  return (data || {}) as Record<string, number>;
}

export async function getPlatformAnalyticsDashboard(days = 30): Promise<Record<string, number>> {
  const { data } = await supabase.rpc('get_platform_analytics_dashboard', { p_days: days });
  return (data || {}) as Record<string, number>;
}

export async function getUniversityAnalyticsDashboard(days = 30, universityId?: string): Promise<Record<string, number>> {
  const { data } = await supabase.rpc('get_university_analytics_dashboard', { p_days: days, p_university_id: universityId ?? null });
  return (data || {}) as Record<string, number>;
}
