/**
 * UniEco Ghana — Communication Data Client
 *
 * Client-side data access functions for the communication hub.
 * Covers messaging, notifications, preferences, blocking, reporting,
 * announcements, event reminders, and push subscriptions.
 */

import { supabase } from '@/lib/supabase/client';
import type {
  ConversationWithDetails,
  MessageWithMeta,
  NotificationWithMeta,
  NotificationPreferences,
  CategoryChannelPrefs,
  BlockedUser,
  MessageReport,
  BusinessAnnouncement,
  AdminBroadcast,
  UniversityAnnouncement,
  EventReminder,
  PushSubscription,
  CommunicationLog,
  NotificationCategory,
  MessageType,
} from '@/lib/types/communication';
import {
  NOTIFICATION_CATEGORIES_FULL,
  DEFAULT_CHANNEL_PREFS,
  MAX_ATTACHMENT_SIZE,
  ALLOWED_ATTACHMENT_TYPES,
  MESSAGE_REPORT_REASONS,
} from '@/lib/types/communication';

// ============================================================
// CONVERSATIONS
// ============================================================

export async function getOrCreateConversation(
  otherUserId: string,
  orderId?: string,
): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_or_create_direct_conversation', {
    p_target_user_id: otherUserId,
    p_order_id: orderId ?? null,
  });
  return error ? null : data;
}

export async function getConversationRecipient(
  conversationId: string,
): Promise<{ id: string; full_name: string | null; avatar_url: string | null } | null> {
  const { data, error } = await supabase.rpc('get_message_conversation_recipient', {
    p_conversation_id: conversationId,
  });
  return error || !data?.[0] ? null : data[0];
}

export interface MessageRecipient {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

export async function searchMessageRecipients(query: string): Promise<MessageRecipient[]> {
  const { data, error } = await supabase.rpc('search_message_recipients', {
    p_query: query,
    p_limit: 10,
  });
  return error ? [] : (data || []) as MessageRecipient[];
}

export async function getConversations(
  includeArchived = false,
  orderId?: string,
): Promise<ConversationWithDetails[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  let query = supabase
    .from('conversations')
    .select('*')
    .or(`participant_one.eq.${user.id},participant_two.eq.${user.id}`)
    .order('updated_at', { ascending: false });

  if (!includeArchived) {
    query = query.eq('is_archived', false);
  }

  if (orderId) {
    query = query.eq('order_id', orderId);
  }

  const { data } = await query;
  if (!data) return [];

  const conversations: ConversationWithDetails[] = [];
  for (const conv of data) {
    // Profile RLS intentionally prevents arbitrary profile joins. Resolve the
    // other participant through the participant-authorized messaging RPC.
    const otherParticipant = await getConversationRecipient(conv.id);

    const { data: lastMsg } = await supabase
      .from('messages')
      .select('body, created_at, sender_id')
      .eq('conversation_id', conv.id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { count } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('conversation_id', conv.id)
      .eq('recipient_id', user.id)
      .eq('is_read', false)
      .eq('is_deleted', false);

    conversations.push({
      ...conv,
      other_participant: otherParticipant,
      last_message: lastMsg,
      unread_count: count || 0,
    });
  }
  return conversations;
}

export async function searchConversations(searchTerm: string): Promise<ConversationWithDetails[]> {
  const all = await getConversations();
  if (!searchTerm.trim()) return all;
  const term = searchTerm.toLowerCase();
  return all.filter(
    (c) =>
      c.other_participant?.full_name?.toLowerCase().includes(term) ||
      c.last_message?.body?.toLowerCase().includes(term),
  );
}

// ============================================================
// MESSAGES
// ============================================================

export async function getMessages(
  conversationId: string,
  page = 1,
  pageSize = 50,
): Promise<MessageWithMeta[]> {
  const { data } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true })
    .range((page - 1) * pageSize, page * pageSize - 1);
  return (data || []) as MessageWithMeta[];
}

export async function sendMessage(
  conversationId: string,
  recipientId: string,
  body: string | null,
  messageType: MessageType = 'text',
  attachmentUrl?: string,
  orderId?: string,
): Promise<{ error: string | null; messageId?: string }> {
  void recipientId;
  void orderId;
  const { data, error } = await supabase.rpc('send_direct_message', {
    p_conversation_id: conversationId,
    p_body: body,
    p_message_type: messageType,
    p_attachment_url: attachmentUrl ?? null,
  });
  if (error) return { error: error.message };

  // Outbound communication and provider delivery are intentionally not
  // dispatched from the browser. The message RPC is the complete client path;
  // a future trusted server dispatcher may consume messaging events separately.

  return { error: null, messageId: data };
}

export async function deleteMessage(messageId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('soft_delete_direct_message', { p_message_id: messageId });
  return { error: error?.message || null };
}

export async function markMessagesRead(conversationId: string): Promise<void> {
  await supabase.rpc('mark_direct_messages_read', { p_conversation_id: conversationId });
}

// ============================================================
// MESSAGE ATTACHMENTS
// ============================================================

export function validateAttachment(file: File): { valid: boolean; error?: string } {
  if (!ALLOWED_ATTACHMENT_TYPES.includes(file.type)) {
    return { valid: false, error: 'File type not allowed. Please use images, PDF, or Word documents.' };
  }
  if (file.size > MAX_ATTACHMENT_SIZE) {
    return { valid: false, error: 'File too large. Maximum size is 10MB.' };
  }
  return { valid: true };
}

export async function uploadMessageAttachment(
  conversationId: string,
  file: File,
): Promise<{ url: string | null; error: string | null }> {
  const validation = validateAttachment(file);
  if (!validation.valid) {
    return { url: null, error: validation.error || 'Invalid file' };
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { url: null, error: 'Not authenticated' };

  const ext = file.name.split('.').pop();
  const path = `${conversationId}/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('message-attachments')
    .upload(path, file, { upsert: false });

  if (uploadError) return { url: null, error: uploadError.message };

  // Persist an opaque object reference. A public URL would expose a private
  // conversation attachment to anyone who obtains it.
  return { url: `attachment://${path}`, error: null };
}

export async function resolveMessageAttachmentUrl(reference: string): Promise<string | null> {
  const path = messageAttachmentPathFromReference(reference);
  // An unrelated external URL remains a legacy attachment reference; object
  // URLs from the UniEco bucket are deliberately converted to a signed URL.
  if (!path) return reference;
  const { data, error } = await supabase.storage
    .from('message-attachments')
    .createSignedUrl(path, 5 * 60);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export async function deleteMessageAttachment(
  messageId: string,
  reference: string,
): Promise<{ error: string | null }> {
  const path = messageAttachmentPathFromReference(reference);
  if (!path || !reference.startsWith('attachment://')) {
    return { error: 'Only private message attachments can be deleted.' };
  }
  const { error: storageError } = await supabase.storage.from('message-attachments').remove([path]);
  if (storageError) return { error: storageError.message };
  const { error: messageError } = await supabase.rpc('clear_direct_message_attachment', {
    p_message_id: messageId,
  });
  return { error: messageError?.message || null };
}

function messageAttachmentPathFromReference(reference: string): string | null {
  if (reference.startsWith('attachment://')) return reference.slice('attachment://'.length);

  // Phase A2 used public URLs before the bucket was made private. Preserve
  // access for an authorized conversation participant after migration 0031,
  // without treating the old URL as an authorization credential.
  try {
    const url = new URL(reference);
    const marker = '/storage/v1/object/public/message-attachments/';
    const markerIndex = url.pathname.indexOf(marker);
    if (markerIndex === -1) return null;
    const path = url.pathname.slice(markerIndex + marker.length);
    return path || null;
  } catch {
    return null;
  }
}

// ============================================================
// NOTIFICATIONS
// ============================================================

export async function getNotifications(
  limit = 20,
  category?: NotificationCategory,
  unreadOnly = false,
): Promise<NotificationWithMeta[]> {
  let query = supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (category && category !== 'general') {
    query = query.eq('category', category);
  }
  if (unreadOnly) {
    query = query.eq('is_read', false);
  }

  const { data } = await query;
  return (data || []) as NotificationWithMeta[];
}

export async function getUnreadNotificationCount(): Promise<number> {
  const { count } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('is_read', false);
  return count || 0;
}

export async function getUnreadCountsByCategory(): Promise<Record<string, number>> {
  const { data } = await supabase
    .from('notifications')
    .select('category')
    .eq('is_read', false);

  if (!data) return {};
  const counts: Record<string, number> = {};
  for (const row of data) {
    const cat = (row as { category: string }).category;
    counts[cat] = (counts[cat] || 0) + 1;
  }
  return counts;
}

export async function markNotificationRead(id: string): Promise<void> {
  await supabase.rpc('set_own_notification_read_state', { p_notification_id: id, p_is_read: true });
}

export async function markAllNotificationsRead(category?: NotificationCategory): Promise<void> {
  await supabase.rpc('mark_all_own_notifications_read', { p_category: category && category !== 'general' ? category : null });
}

export async function deleteNotification(id: string): Promise<void> {
  await supabase.rpc('dismiss_own_notification', { p_notification_id: id });
}

// ============================================================
// NOTIFICATION PREFERENCES
// ============================================================

export async function getNotificationPreferences(): Promise<NotificationPreferences | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('notification_preferences')
    .select('preferences')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!data) {
    // Return defaults
    const defaults: NotificationPreferences = { user_id: user.id };
    for (const cat of NOTIFICATION_CATEGORIES_FULL) {
      defaults[cat.key] = cat.defaultPrefs;
    }
    return defaults;
  }

  return { user_id: user.id, ...(data.preferences as Record<string, CategoryChannelPrefs>) };
}

export async function updateNotificationPreferences(
  prefs: Partial<Record<NotificationCategory, CategoryChannelPrefs>>,
): Promise<{ error: string | null }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  // Merge with existing
  const existing = await getNotificationPreferences();
  const merged = { ...(existing ?? {}), ...prefs };
  // Remove user_id from the stored jsonb
  const { user_id, ...prefsToStore } = merged;

  const { error } = await supabase.rpc('set_own_notification_preferences', { p_preferences: prefsToStore });

  return { error: error?.message || null };
}

export function getDefaultPrefsForCategory(category: NotificationCategory): CategoryChannelPrefs {
  const config = NOTIFICATION_CATEGORIES_FULL.find((c) => c.key === category);
  return config?.defaultPrefs ?? DEFAULT_CHANNEL_PREFS;
}

// ============================================================
// BLOCKING
// ============================================================

export async function blockUser(blockedId: string, reason?: string): Promise<{ error: string | null }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase.from('blocked_users').insert({
    blocker_id: user.id,
    blocked_id: blockedId,
    reason: reason ?? null,
  });

  return { error: error?.message || null };
}

export async function unblockUser(blockedId: string): Promise<{ error: string | null }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase
    .from('blocked_users')
    .delete()
    .eq('blocker_id', user.id)
    .eq('blocked_id', blockedId);

  return { error: error?.message || null };
}

export async function getBlockedUsers(): Promise<BlockedUser[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from('blocked_users')
    .select(`
      *,
      blocked:profiles!blocked_users_blocked_id_fkey(id, full_name, avatar_url)
    `)
    .eq('blocker_id', user.id)
    .order('created_at', { ascending: false });

  return (data || []) as unknown as BlockedUser[];
}

export async function isUserBlocked(userId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase
    .from('blocked_users')
    .select('id')
    .eq('blocker_id', user.id)
    .eq('blocked_id', userId)
    .maybeSingle();

  return !!data;
}

// ============================================================
// REPORTING
// ============================================================

export async function reportMessage(params: {
  reportedId: string;
  messageId?: string;
  conversationId?: string;
  reason: string;
  description?: string;
}): Promise<{ error: string | null }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase.from('message_reports').insert({
    reporter_id: user.id,
    reported_id: params.reportedId,
    message_id: params.messageId ?? null,
    conversation_id: params.conversationId ?? null,
    reason: params.reason,
    description: params.description ?? null,
  });

  return { error: error?.message || null };
}

export async function getMessageReports(): Promise<MessageReport[]> {
  const { data } = await supabase
    .from('message_reports')
    .select(`
      *,
      reporter:profiles!message_reports_reporter_id_fkey(id, full_name, avatar_url),
      reported:profiles!message_reports_reported_id_fkey(id, full_name, avatar_url)
    `)
    .order('created_at', { ascending: false });

  return (data || []) as unknown as MessageReport[];
}

export { MESSAGE_REPORT_REASONS };

// ============================================================
// PUSH SUBSCRIPTIONS
// ============================================================

export async function subscribeToPush(
  subscription: PushSubscription,
): Promise<{ error: string | null }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: user.id,
      endpoint: subscription.endpoint,
      p256dh_key: subscription.p256dh_key,
      auth_key: subscription.auth_key,
      expiration_time: subscription.expiration_time,
      is_active: true,
    },
    { onConflict: 'endpoint' },
  );

  return { error: error?.message || null };
}

export async function unsubscribeFromPush(endpoint: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('push_subscriptions')
    .update({ is_active: false })
    .eq('endpoint', endpoint);

  return { error: error?.message || null };
}

export async function getPushSubscriptions(): Promise<PushSubscription[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from('push_subscriptions')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_active', true);

  return (data || []) as PushSubscription[];
}

// ============================================================
// BUSINESS ANNOUNCEMENTS
// ============================================================

export async function getBusinessAnnouncements(vendorId: string): Promise<BusinessAnnouncement[]> {
  const { data } = await supabase
    .from('business_announcements')
    .select('*')
    .eq('vendor_id', vendorId)
    .order('created_at', { ascending: false });

  return (data || []) as BusinessAnnouncement[];
}

export async function createBusinessAnnouncement(params: {
  vendor_id: string;
  title: string;
  body: string;
  announcement_type: string;
  image_url?: string;
  starts_at?: string;
  ends_at?: string;
}): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('create_own_business_announcement', {
    p_vendor_id: params.vendor_id, p_title: params.title, p_body: params.body,
    p_announcement_type: params.announcement_type, p_image_url: params.image_url ?? null,
    p_starts_at: params.starts_at ?? null, p_ends_at: params.ends_at ?? null,
  });

  return { error: error?.message || null };
}

export async function updateBusinessAnnouncement(
  id: string,
  updates: Partial<BusinessAnnouncement>,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('update_own_business_announcement', {
    p_announcement_id: id, p_title: updates.title ?? null, p_body: updates.body ?? null,
    p_announcement_type: updates.announcement_type ?? null, p_image_url: updates.image_url ?? null,
    p_starts_at: updates.starts_at ?? null, p_ends_at: updates.ends_at ?? null,
  });

  return { error: error?.message || null };
}

export async function deleteBusinessAnnouncement(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('delete_own_business_announcement', { p_announcement_id: id });
  return { error: error?.message || null };
}

// ============================================================
// ADMIN BROADCASTS
// ============================================================

export async function getAdminBroadcasts(): Promise<AdminBroadcast[]> {
  const { data } = await supabase
    .from('admin_broadcasts')
    .select('*')
    .order('created_at', { ascending: false });

  return (data || []) as AdminBroadcast[];
}

export async function createAdminBroadcast(params: {
  title: string;
  body: string;
  broadcast_type: string;
  target_audience: string;
  target_filters?: Record<string, unknown>;
  channels?: string[];
  submitForApproval?: boolean;
}): Promise<{ error: string | null; id?: string }> {
  const { data, error } = await supabase
    .rpc('create_admin_broadcast_draft', {
      p_title: params.title,
      p_body: params.body,
      p_broadcast_type: params.broadcast_type,
      p_target_audience: params.target_audience,
      p_target_filters: params.target_filters ?? {},
      p_channels: params.channels ?? ['in_app'],
      p_submit_for_approval: params.submitForApproval ?? false,
    });

  return { error: error?.message || null, id: data ?? undefined };
}

export async function approveAdminBroadcast(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('approve_admin_broadcast', { p_broadcast_id: id });
  return { error: error?.message || null };
}

export async function beginAdminBroadcastDelivery(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('begin_admin_broadcast_delivery', { p_broadcast_id: id });
  return { error: error?.message || null };
}

export async function cancelAdminBroadcast(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('cancel_admin_broadcast', { p_broadcast_id: id });
  return { error: error?.message || null };
}

// ============================================================
// UNIVERSITY ANNOUNCEMENTS
// ============================================================

export async function getUniversityAnnouncements(universityId: string): Promise<UniversityAnnouncement[]> {
  const { data } = await supabase
    .from('university_announcements')
    .select('*')
    .eq('university_id', universityId)
    .eq('is_active', true)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false });

  return (data || []) as UniversityAnnouncement[];
}

export async function createUniversityAnnouncement(params: {
  university_id: string;
  title: string;
  body: string;
  announcement_type?: string;
  is_pinned?: boolean;
}): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('create_university_announcement', {
    p_university_id: params.university_id, p_title: params.title, p_body: params.body,
    p_announcement_type: params.announcement_type ?? 'general', p_is_pinned: params.is_pinned ?? false,
  });

  return { error: error?.message || null };
}

// ============================================================
// EVENT REMINDERS
// ============================================================

export async function getEventReminders(eventId?: string): Promise<EventReminder[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  let query = supabase
    .from('event_reminders')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (eventId) {
    query = query.eq('event_id', eventId);
  }

  const { data } = await query;
  return (data || []) as EventReminder[];
}

export async function setEventReminder(params: {
  event_id: string;
  reminder_type: '24h' | '1h' | 'custom';
  custom_minutes_before?: number;
}): Promise<{ error: string | null }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  void user;
  const { error } = await supabase.rpc('schedule_event_reminder', {
    p_event_id: params.event_id,
    p_reminder_type: params.reminder_type,
    p_custom_minutes_before: params.custom_minutes_before ?? null,
  });

  return { error: error?.message || null };
}

export async function removeEventReminder(eventId: string, reminderType?: string): Promise<{ error: string | null }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  void user;
  const { error } = await supabase.rpc('cancel_event_reminder', {
    p_event_id: eventId,
    p_reminder_type: reminderType ?? null,
  });
  return { error: error?.message || null };
}

// ============================================================
// ADMIN: COMMUNICATION LOGS
// ============================================================

export async function getCommunicationLogs(filters?: {
  channel?: string;
  status?: string;
  eventType?: string;
  universityId?: string;
  limit?: number;
  offset?: number;
}): Promise<CommunicationLog[]> {
  let query = supabase
    .from('communication_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(filters?.limit ?? 50);

  if (filters?.channel) query = query.eq('channel', filters.channel);
  if (filters?.status) query = query.eq('status', filters.status);
  if (filters?.eventType) query = query.eq('event_type', filters.eventType);
  if (filters?.universityId) query = query.eq('university_id', filters.universityId);
  if (filters?.offset) query = query.range(filters.offset, (filters.offset) + (filters.limit ?? 50) - 1);

  const { data } = await query;
  return (data || []) as CommunicationLog[];
}

export async function getCommunicationStats(): Promise<{
  total: number;
  byChannel: Record<string, number>;
  byStatus: Record<string, number>;
  failed: number;
}> {
  const { data: channelData } = await supabase
    .from('communication_logs')
    .select('channel, status');

  if (!channelData) return { total: 0, byChannel: {}, byStatus: {}, failed: 0 };

  const byChannel: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  let failed = 0;

  for (const row of channelData) {
    const ch = (row as { channel: string }).channel;
    const st = (row as { status: string }).status;
    byChannel[ch] = (byChannel[ch] || 0) + 1;
    byStatus[st] = (byStatus[st] || 0) + 1;
    if (st === 'failed') failed++;
  }

  return {
    total: channelData.length,
    byChannel,
    byStatus,
    failed,
  };
}
