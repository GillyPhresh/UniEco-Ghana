/**
 * UniEco Ghana — Communication Service Layer
 *
 * Centralized service that determines which channels to use for each
 * communication event based on user preferences, message type, consent,
 * urgency, and available providers. This is the single entry point for
 * triggering any outbound communication — do NOT scatter notification
 * logic throughout unrelated components.
 *
 * Provider Abstraction:
 * - Email: Resend / Brevo / SendGrid (configurable via env)
 * - SMS: Hubtel / Twilio (configurable via env)
 * - WhatsApp: WhatsApp Cloud API / Twilio WhatsApp (configurable via env)
 * - Push: Web Push API (VAPID keys via env)
 * - In-App: Direct Supabase insert (always available)
 *
 * All external provider calls are proxied through edge functions to keep
 * secrets server-side. This client-side service creates the communication
 * event record and dispatches to the appropriate edge function.
 */

import { supabase } from '@/lib/supabase/client';
import type {
  CommunicationEventPayload,
  CommunicationChannel,
  NotificationCategory,
  CategoryChannelPrefs,
  NotificationPreferences,
  SendResult,
  DeliveryStatus,
} from '@/lib/types/communication';
import {
  DEFAULT_CHANNEL_PREFS,
  NOTIFICATION_CATEGORIES_FULL,
} from '@/lib/types/communication';

// ============================================================
// Category → Channel resolution
// ============================================================

/**
 * Resolve which channels should be used for a given event, based on the
 * recipient's stored preferences. Falls back to category defaults.
 */
export function resolveChannels(
  category: NotificationCategory,
  prefs: NotificationPreferences | null,
  urgency: 'normal' | 'high' | 'urgent' = 'normal',
): CommunicationChannel[] {
  const categoryConfig = NOTIFICATION_CATEGORIES_FULL.find((c) => c.key === category);
  const defaults = categoryConfig?.defaultPrefs ?? DEFAULT_CHANNEL_PREFS;
  const userPrefs = prefs?.[category] ?? defaults;

  const channels: CommunicationChannel[] = [];
  if (userPrefs.in_app) channels.push('in_app');
  if (userPrefs.email) channels.push('email');
  if (userPrefs.push) channels.push('push');
  if (userPrefs.whatsapp) channels.push('whatsapp');
  if (userPrefs.sms) channels.push('sms');

  // Urgent events always include in-app even if user disabled it
  if (urgency === 'urgent' && !channels.includes('in_app')) {
    channels.unshift('in_app');
  }

  return channels;
}

// ============================================================
// Template rendering
// ============================================================

/**
 * Render a template body by replacing {{variable}} placeholders.
 * Only simple string replacement is used — no eval, no code execution.
 */
export function renderTemplate(
  template: string,
  variables: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    return variables[key] ?? '';
  });
}

// ============================================================
// Core: dispatch a communication event
// ============================================================

/**
 * Trigger a communication event. This is the main entry point for the
 * entire communication hub. Call this from order flows, payment flows,
 * verification flows, etc.
 *
 * Steps:
 * 1. Fetch recipient preferences
 * 2. Resolve channels based on prefs + urgency
 * 3. Insert in-app notification (if enabled)
 * 4. Create communication_event record
 * 5. Dispatch to edge functions for email/push/whatsapp/sms
 */
export async function dispatchCommunication(
  payload: CommunicationEventPayload,
): Promise<SendResult> {
  const {
    eventType,
    recipientId,
    category,
    title,
    body,
    actionUrl,
    metadata = {},
    urgency = 'normal',
  } = payload;

  const errors: string[] = [];
  const channelsDelivered: CommunicationChannel[] = [];
  const channelsAttempted: CommunicationChannel[] = [];

  // 1. Fetch recipient preferences
  const { data: prefsData } = await supabase
    .from('notification_preferences')
    .select('preferences')
    .eq('user_id', recipientId)
    .maybeSingle();

  const prefs = prefsData?.preferences as NotificationPreferences | null;
  const channels = resolveChannels(category, prefs, urgency);

  // 2. Always create a communication event record
  const { data: eventRecord, error: eventError } = await supabase
    .from('communication_events')
    .insert({
      event_type: eventType,
      recipient_id: recipientId,
      subject: title,
      channels,
      status: 'processing',
      metadata: { ...metadata, category, action_url: actionUrl },
    })
    .select('id')
    .single();

  if (eventError) {
    return {
      success: false,
      channelsAttempted: [],
      channelsDelivered: [],
      errors: [eventError.message],
    };
  }

  const eventId = eventRecord.id;

  // 3. In-app notification (direct Supabase insert)
  if (channels.includes('in_app')) {
    channelsAttempted.push('in_app');
    const { error: notifError } = await supabase.from('notifications').insert({
      user_id: recipientId,
      type: eventType,
      title,
      body,
      link: actionUrl ?? null,
      action_url: actionUrl ?? null,
      category,
      metadata,
      is_read: false,
    });

    if (notifError) {
      errors.push(`in_app: ${notifError.message}`);
    } else {
      channelsDelivered.push('in_app');
      await logDelivery(eventId, 'in_app', 'delivered');
    }
  }

  // 4. Email (via edge function)
  if (channels.includes('email') && payload.recipientEmail) {
    channelsAttempted.push('email');
    try {
      const result = await callEdgeFunction('send-email', {
        to: payload.recipientEmail,
        subject: title,
        body,
        eventType,
        recipientId,
        metadata,
      });
      if (result.success) {
        channelsDelivered.push('email');
        await logDelivery(eventId, 'email', 'sent', result.providerReference);
      } else {
        errors.push(`email: ${result.error}`);
        await logDelivery(eventId, 'email', 'failed', null, result.error);
      }
    } catch (err) {
      errors.push(`email: ${(err as Error).message}`);
      await logDelivery(eventId, 'email', 'failed', null, (err as Error).message);
    }
  }

  // 5. Push notification (via edge function)
  if (channels.includes('push')) {
    channelsAttempted.push('push');
    try {
      const result = await callEdgeFunction('send-push', {
        recipientId,
        title,
        body,
        actionUrl,
        eventType,
        metadata,
      });
      if (result.success) {
        channelsDelivered.push('push');
        await logDelivery(eventId, 'push', 'sent', result.providerReference);
      } else {
        errors.push(`push: ${result.error}`);
        await logDelivery(eventId, 'push', 'failed', null, result.error);
      }
    } catch (err) {
      errors.push(`push: ${(err as Error).message}`);
      await logDelivery(eventId, 'push', 'failed', null, (err as Error).message);
    }
  }

  // 6. WhatsApp (via edge function — only if configured)
  if (channels.includes('whatsapp') && payload.recipientPhone) {
    channelsAttempted.push('whatsapp');
    try {
      const result = await callEdgeFunction('send-whatsapp', {
        to: payload.recipientPhone,
        templateKey: eventType,
        variables: metadata,
        recipientId,
      });
      if (result.success) {
        channelsDelivered.push('whatsapp');
        await logDelivery(eventId, 'whatsapp', 'sent', result.providerReference);
      } else {
        errors.push(`whatsapp: ${result.error}`);
        await logDelivery(eventId, 'whatsapp', 'failed', null, result.error);
      }
    } catch (err) {
      errors.push(`whatsapp: ${(err as Error).message}`);
      await logDelivery(eventId, 'whatsapp', 'failed', null, (err as Error).message);
    }
  }

  // 7. SMS (via edge function — only if configured)
  if (channels.includes('sms') && payload.recipientPhone) {
    channelsAttempted.push('sms');
    try {
      const result = await callEdgeFunction('send-sms', {
        to: payload.recipientPhone,
        message: body,
        recipientId,
      });
      if (result.success) {
        channelsDelivered.push('sms');
        await logDelivery(eventId, 'sms', 'sent', result.providerReference);
      } else {
        errors.push(`sms: ${result.error}`);
        await logDelivery(eventId, 'sms', 'failed', null, result.error);
      }
    } catch (err) {
      errors.push(`sms: ${(err as Error).message}`);
      await logDelivery(eventId, 'sms', 'failed', null, (err as Error).message);
    }
  }

  // 8. Update event status
  const finalStatus = channelsDelivered.length > 0 ? 'sent' : 'failed';
  await supabase
    .from('communication_events')
    .update({ status: finalStatus, updated_at: new Date().toISOString() })
    .eq('id', eventId);

  return {
    success: channelsDelivered.length > 0,
    channelsAttempted,
    channelsDelivered,
    errors,
    eventId,
  };
}

// ============================================================
// Helper: log a delivery record
// ============================================================

async function logDelivery(
  eventId: string,
  channel: CommunicationChannel,
  status: DeliveryStatus,
  providerReference?: string | null,
  errorMessage?: string | null,
): Promise<void> {
  await supabase.from('communication_deliveries').insert({
    event_id: eventId,
    channel,
    status,
    provider_reference: providerReference ?? null,
    error_message: errorMessage ?? null,
    sent_at: status === 'sent' || status === 'delivered' ? new Date().toISOString() : null,
    delivered_at: status === 'delivered' ? new Date().toISOString() : null,
  });
}

// ============================================================
// Helper: call an edge function with error handling
// ============================================================

interface EdgeFunctionResult {
  success: boolean;
  providerReference?: string;
  error?: string;
}

async function callEdgeFunction(
  name: string,
  body: Record<string, unknown>,
): Promise<EdgeFunctionResult> {
  // Outbound providers run only from a trusted server dispatcher. Calling a
  // service-role Edge Function from browser code would let a user target any
  // email address, phone number, or push subscriber.
  void name;
  void body;
  return {
    success: false,
    error: 'External delivery is queued for trusted server-side dispatch.',
  };
}

// ============================================================
// Convenience: typed event triggers
// ============================================================

export async function notifyOrderPlaced(recipientId: string, orderNumber: string, amount: number): Promise<SendResult> {
  return dispatchCommunication({
    eventType: 'order_placed',
    recipientId,
    category: 'orders',
    title: 'Order Placed',
    body: `Your order ${orderNumber} has been placed successfully. Total: GHS ${amount.toFixed(2)}`,
    actionUrl: `/orders`,
    metadata: { order_number: orderNumber, amount },
  });
}

export async function notifyOrderAccepted(recipientId: string, orderNumber: string, businessName: string): Promise<SendResult> {
  return dispatchCommunication({
    eventType: 'order_accepted',
    recipientId,
    category: 'orders',
    title: 'Order Accepted',
    body: `Your order ${orderNumber} has been accepted by ${businessName}.`,
    actionUrl: `/orders`,
    metadata: { order_number: orderNumber, business_name: businessName },
  });
}

export async function notifyOrderCancelled(recipientId: string, orderNumber: string): Promise<SendResult> {
  return dispatchCommunication({
    eventType: 'order_cancelled',
    recipientId,
    category: 'orders',
    title: 'Order Cancelled',
    body: `Your order ${orderNumber} has been cancelled.`,
    actionUrl: `/orders`,
    metadata: { order_number: orderNumber },
  });
}

export async function notifyPaymentSuccessful(recipientId: string, amount: number, receiptNumber?: string): Promise<SendResult> {
  return dispatchCommunication({
    eventType: 'payment_successful',
    recipientId,
    category: 'payments',
    title: 'Payment Successful',
    body: `Your payment of GHS ${amount.toFixed(2)} was successful.${receiptNumber ? ` Receipt: ${receiptNumber}` : ''}`,
    actionUrl: `/dashboard/payment-history`,
    metadata: { amount, receipt_number: receiptNumber },
  });
}

export async function notifyPaymentFailed(recipientId: string, amount: number): Promise<SendResult> {
  return dispatchCommunication({
    eventType: 'payment_failed',
    recipientId,
    category: 'payments',
    title: 'Payment Failed',
    body: `Your payment of GHS ${amount.toFixed(2)} failed. Please try again.`,
    actionUrl: `/checkout`,
    metadata: { amount },
    urgency: 'high',
  });
}

export async function notifySubscriptionExpiring(recipientId: string, plan: string, daysLeft: number, expiryDate: string): Promise<SendResult> {
  return dispatchCommunication({
    eventType: 'subscription_expiring',
    recipientId,
    category: 'subscriptions',
    title: 'Subscription Expiring',
    body: `Your ${plan} subscription expires in ${daysLeft} days (${expiryDate}). Renew to keep your features.`,
    actionUrl: `/vendor-dashboard/subscription`,
    metadata: { plan, days: daysLeft, date: expiryDate },
    urgency: daysLeft <= 3 ? 'high' : 'normal',
  });
}

export async function notifyVendorApproved(recipientId: string, businessName: string): Promise<SendResult> {
  return dispatchCommunication({
    eventType: 'vendor_approved',
    recipientId,
    category: 'verification',
    title: 'Vendor Approved',
    body: `Your vendor account for ${businessName} has been approved! You now have full access to vendor features.`,
    actionUrl: `/vendor-dashboard`,
    metadata: { business_name: businessName },
  });
}

export async function notifyVendorRejected(recipientId: string, businessName: string, reason: string): Promise<SendResult> {
  return dispatchCommunication({
    eventType: 'vendor_rejected',
    recipientId,
    category: 'verification',
    title: 'Vendor Verification Update',
    body: `Your vendor verification for ${businessName} was not approved. Reason: ${reason}`,
    actionUrl: `/vendor-dashboard/verification`,
    metadata: { business_name: businessName, reason },
  });
}

export async function notifyStudentVerified(recipientId: string): Promise<SendResult> {
  return dispatchCommunication({
    eventType: 'student_verified',
    recipientId,
    category: 'verification',
    title: 'Student Verified',
    body: `Your student verification has been approved! You now have full student access.`,
    actionUrl: `/dashboard`,
    metadata: {},
  });
}

export async function notifyNewMessage(recipientId: string, senderName: string, conversationId: string): Promise<SendResult> {
  return dispatchCommunication({
    eventType: 'new_message',
    recipientId,
    category: 'messages',
    title: 'New Message',
    body: `You have a new message from ${senderName}.`,
    actionUrl: `/dashboard/messages?conv=${conversationId}`,
    metadata: { sender_name: senderName, conversation_id: conversationId },
  });
}

export async function notifyNewReview(recipientId: string, rating: number, vendorName: string): Promise<SendResult> {
  return dispatchCommunication({
    eventType: 'new_review',
    recipientId,
    category: 'reviews',
    title: 'New Review',
    body: `You received a new ${rating}-star review on ${vendorName}.`,
    actionUrl: `/vendor-dashboard/reviews`,
    metadata: { rating, vendor_name: vendorName },
  });
}

export async function notifyEventReminder(recipientId: string, eventName: string, eventDate: string, timeUntil: string): Promise<SendResult> {
  return dispatchCommunication({
    eventType: 'event_reminder',
    recipientId,
    category: 'events',
    title: 'Event Reminder',
    body: `Reminder: ${eventName} starts in ${timeUntil}.`,
    actionUrl: `/events`,
    metadata: { event_name: eventName, date: eventDate, time: timeUntil },
    urgency: 'high',
  });
}

export async function notifyAdApproved(recipientId: string, adTitle: string): Promise<SendResult> {
  return dispatchCommunication({
    eventType: 'ad_approved',
    recipientId,
    category: 'announcements',
    title: 'Advertisement Approved',
    body: `Your advertisement "${adTitle}" has been approved and is now active.`,
    actionUrl: `/vendor-dashboard/promotions`,
    metadata: { ad_title: adTitle },
  });
}

export async function notifySupportUpdate(recipientId: string, ticketId: string): Promise<SendResult> {
  return dispatchCommunication({
    eventType: 'support_ticket_update',
    recipientId,
    category: 'general',
    title: 'Support Ticket Update',
    body: `Your support ticket has been updated.`,
    actionUrl: `/dashboard/notifications`,
    metadata: { ticket_id: ticketId },
  });
}
