import { supabase } from '@/lib/supabase/client';
import { nonChatNotificationTypes } from '@/lib/notifications/unread-events';

export type HeaderUnreadCounts = { messages: number; notifications: number };

/** Counts only: do not download private message bodies for navigation badges.
 * Explicit owner filters supplement, never replace, the existing database RLS. */
export async function getHeaderUnreadCounts(userId: string, includeRegistrationReminders: boolean): Promise<HeaderUnreadCounts> {
  const messages = supabase.from('messages').select('id', { count: 'exact', head: true })
    .eq('recipient_id', userId).eq('is_read', false).eq('is_deleted', false);
  let notifications = supabase.from('notifications').select('id', { count: 'exact', head: true })
    .eq('user_id', userId).eq('is_read', false).neq('category', 'messages').or(nonChatNotificationTypes);
  if (!includeRegistrationReminders) notifications = notifications.neq('type', 'registration_payment_required');
  const [chatResult, alertResult] = await Promise.all([messages, notifications]);
  if (chatResult.error || alertResult.error) throw new Error('Unread counts could not load.');
  return { messages: chatResult.count ?? 0, notifications: alertResult.count ?? 0 };
}
