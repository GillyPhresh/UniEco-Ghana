/**
 * Browser-safe communication utilities.
 *
 * Outbound provider delivery is owned exclusively by the trusted
 * `dispatch-communication-queue` Edge Function. This module deliberately has
 * no Supabase client import and cannot create events, deliveries, logs, or
 * provider calls from a browser bundle.
 */
import type {
  CommunicationEventPayload,
  CommunicationChannel,
  NotificationCategory,
  NotificationPreferences,
  SendResult,
} from '@/lib/types/communication';
import { DEFAULT_CHANNEL_PREFS, NOTIFICATION_CATEGORIES_FULL } from '@/lib/types/communication';

export function resolveChannels(
  category: NotificationCategory,
  prefs: NotificationPreferences | null,
  urgency: 'normal' | 'high' | 'urgent' = 'normal',
): CommunicationChannel[] {
  const defaults = NOTIFICATION_CATEGORIES_FULL.find((item) => item.key === category)?.defaultPrefs ?? DEFAULT_CHANNEL_PREFS;
  const selected = prefs?.[category] ?? defaults;
  const channels = (Object.entries(selected) as Array<[CommunicationChannel, boolean]>)
    .filter(([channel, enabled]) => enabled && ['in_app', 'email', 'push', 'whatsapp', 'sms'].includes(channel))
    .map(([channel]) => channel);
  if (urgency === 'urgent' && !channels.includes('in_app')) channels.unshift('in_app');
  return channels;
}

export function renderTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => variables[key] ?? '');
}

/**
 * Compatibility quarantine for inactive legacy callers. It does not enqueue
 * anything; trusted server workflows must use the service-role queue API.
 */
export async function dispatchCommunication(_payload: CommunicationEventPayload): Promise<SendResult> {
  return {
    success: false,
    channelsAttempted: [],
    channelsDelivered: [],
    errors: ['Outbound communication can only be dispatched by trusted server infrastructure.'],
  };
}
