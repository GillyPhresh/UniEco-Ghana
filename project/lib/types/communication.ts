/**
 * UniEco Ghana — Communication Hub Types
 *
 * Types for the unified communication & notification infrastructure
 * covering in-app messaging, notifications, email, WhatsApp, push, and SMS.
 */

// ============================================================
// Channels & Providers
// ============================================================

export type CommunicationChannel = 'in_app' | 'email' | 'push' | 'whatsapp' | 'sms';

export type EmailProvider = 'resend' | 'brevo' | 'sendgrid';
export type SmsProvider = 'hubtel' | 'twilio';
export type WhatsAppProvider = 'whatsapp_cloud_api' | 'twilio_whatsapp';

export type DeliveryStatus =
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'opened'
  | 'read';

// ============================================================
// Communication Events (trigger types)
// ============================================================

export type CommunicationEventType =
  | 'order_placed'
  | 'order_accepted'
  | 'order_cancelled'
  | 'payment_successful'
  | 'payment_failed'
  | 'subscription_expiring'
  | 'vendor_approved'
  | 'vendor_rejected'
  | 'student_verified'
  | 'new_message'
  | 'new_review'
  | 'event_reminder'
  | 'ad_approved'
  | 'support_ticket_update'
  | 'broadcast'
  | 'business_announcement';

// ============================================================
// Messaging
// ============================================================

export type MessageType = 'text' | 'image' | 'document' | 'link';

export interface MessageAttachment {
  id: string;
  message_id: string;
  file_url: string;
  file_name: string;
  file_type: string;
  file_size: number;
  thumbnail_url: string | null;
  created_at: string;
}

export interface MessageRead {
  id: string;
  message_id: string;
  user_id: string;
  read_at: string;
}

export interface ConversationWithOrder extends ConversationWithDetails {
  order_id: string | null;
  order?: {
    id: string;
    order_number: string | null;
    status: string;
    total_amount: number;
  } | null;
}

// Re-export for convenience
export interface ConversationWithDetails {
  id: string;
  participant_one: string;
  participant_two: string;
  created_at: string;
  updated_at: string;
  order_id: string | null;
  is_archived: boolean;
  archived_at: string | null;
  last_message_at: string | null;
  other_participant: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
  last_message: {
    body: string | null;
    created_at: string;
    sender_id: string;
  } | null;
  unread_count: number;
}

export interface MessageWithMeta {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string | null;
  is_read: boolean;
  created_at: string;
  conversation_id: string | null;
  is_archived_by_sender: boolean;
  is_archived_by_recipient: boolean;
  message_type: MessageType;
  attachment_url: string | null;
  is_deleted: boolean;
  deleted_at: string | null;
  order_id: string | null;
  attachments?: MessageAttachment[];
  reads?: MessageRead[];
}

// ============================================================
// Notifications
// ============================================================

export type NotificationCategory =
  | 'orders'
  | 'payments'
  | 'messages'
  | 'businesses'
  | 'events'
  | 'reviews'
  | 'subscriptions'
  | 'verification'
  | 'announcements'
  | 'general';

export interface NotificationWithMeta {
  id: string;
  user_id: string;
  type: string | null;
  title: string | null;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
  category: NotificationCategory;
  action_url: string | null;
  metadata: Record<string, unknown>;
  icon: string | null;
}

// ============================================================
// Notification Preferences
// ============================================================

export interface CategoryChannelPrefs {
  in_app: boolean;
  email: boolean;
  push: boolean;
  whatsapp: boolean;
  sms: boolean;
}

export type NotificationPreferences = {
  user_id: string;
} & Partial<Record<NotificationCategory, CategoryChannelPrefs>>;

export const DEFAULT_CHANNEL_PREFS: CategoryChannelPrefs = {
  in_app: true,
  email: true,
  push: false,
  whatsapp: false,
  sms: false,
};

export const NOTIFICATION_CATEGORIES_FULL: {
  key: NotificationCategory;
  label: string;
  description: string;
  defaultPrefs: CategoryChannelPrefs;
}[] = [
  {
    key: 'orders',
    label: 'Orders',
    description: 'Order placed, accepted, cancelled, or ready',
    defaultPrefs: { in_app: true, email: true, push: true, whatsapp: true, sms: false },
  },
  {
    key: 'payments',
    label: 'Payments',
    description: 'Payment successful, failed, or refunded',
    defaultPrefs: { in_app: true, email: true, push: true, whatsapp: false, sms: false },
  },
  {
    key: 'messages',
    label: 'Messages',
    description: 'New messages from vendors or students',
    defaultPrefs: { in_app: true, email: false, push: true, whatsapp: false, sms: false },
  },
  {
    key: 'businesses',
    label: 'Businesses',
    description: 'Business announcements and updates',
    defaultPrefs: { in_app: true, email: false, push: false, whatsapp: false, sms: false },
  },
  {
    key: 'events',
    label: 'Events',
    description: 'Event reminders and updates',
    defaultPrefs: { in_app: true, email: true, push: true, whatsapp: false, sms: false },
  },
  {
    key: 'reviews',
    label: 'Reviews',
    description: 'New reviews on your products or services',
    defaultPrefs: { in_app: true, email: true, push: false, whatsapp: false, sms: false },
  },
  {
    key: 'subscriptions',
    label: 'Subscriptions',
    description: 'Subscription reminders and expiry warnings',
    defaultPrefs: { in_app: true, email: true, push: true, whatsapp: true, sms: false },
  },
  {
    key: 'verification',
    label: 'Verification',
    description: 'Student and vendor verification updates',
    defaultPrefs: { in_app: true, email: true, push: false, whatsapp: false, sms: false },
  },
  {
    key: 'announcements',
    label: 'Platform Announcements',
    description: 'Platform-wide and university announcements',
    defaultPrefs: { in_app: true, email: true, push: false, whatsapp: false, sms: false },
  },
];

// ============================================================
// Communication Events & Deliveries
// ============================================================

export interface CommunicationEvent {
  id: string;
  event_type: CommunicationEventType;
  recipient_id: string | null;
  recipient_email: string | null;
  recipient_phone: string | null;
  subject: string | null;
  channels: CommunicationChannel[];
  status: 'queued' | 'processing' | 'sent' | 'delivered' | 'failed' | 'cancelled';
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CommunicationDelivery {
  id: string;
  event_id: string;
  channel: CommunicationChannel;
  status: DeliveryStatus;
  provider: string | null;
  provider_reference: string | null;
  error_message: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  created_at: string;
}

// ============================================================
// Templates
// ============================================================

export interface CommunicationTemplate {
  id: string;
  template_key: string;
  name: string;
  channel: CommunicationChannel;
  subject: string | null;
  body: string;
  variables: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================
// Communication Logs (admin — metadata only)
// ============================================================

export interface CommunicationLog {
  id: string;
  event_type: string;
  channel: CommunicationChannel;
  recipient_id: string | null;
  recipient_identifier: string | null;
  status: string;
  provider: string | null;
  provider_reference: string | null;
  university_id: string | null;
  created_at: string;
}

// ============================================================
// Push Subscriptions
// ============================================================

export interface PushSubscription {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh_key: string;
  auth_key: string;
  expiration_time: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================
// Blocking & Reporting
// ============================================================

export interface BlockedUser {
  id: string;
  blocker_id: string;
  blocked_id: string;
  reason: string | null;
  created_at: string;
}

export type MessageReportStatus = 'pending' | 'reviewing' | 'resolved' | 'dismissed';

export interface MessageReport {
  id: string;
  reporter_id: string;
  reported_id: string;
  message_id: string | null;
  conversation_id: string | null;
  reason: string;
  description: string | null;
  status: MessageReportStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  resolution_note: string | null;
  created_at: string;
}

// ============================================================
// Announcements
// ============================================================

export type AnnouncementType = 'new_product' | 'holiday_hours' | 'temporary_closure' | 'special_promotion' | 'general';

export interface BusinessAnnouncement {
  id: string;
  vendor_id: string;
  title: string;
  body: string;
  announcement_type: AnnouncementType;
  image_url: string | null;
  is_active: boolean;
  is_approved: boolean;
  reviewed_by: string | null;
  reviewed_at: string | null;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
}

export type BroadcastType = 'announcement' | 'maintenance' | 'update' | 'event' | 'promotion';
export type BroadcastTarget = 'all' | 'students' | 'vendors' | 'specific_university' | 'specific_category' | 'selected_users';
export type BroadcastStatus = 'draft' | 'scheduled' | 'pending_approval' | 'approved' | 'sending' | 'sent' | 'cancelled';

export interface AdminBroadcast {
  id: string;
  title: string;
  body: string;
  broadcast_type: BroadcastType;
  target_audience: BroadcastTarget;
  target_filters: Record<string, unknown>;
  channels: CommunicationChannel[];
  status: BroadcastStatus;
  scheduled_at: string | null;
  sent_at: string | null;
  sent_count: number;
  failed_count: number;
  created_by: string;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UniversityAnnouncement {
  id: string;
  university_id: string;
  title: string;
  body: string;
  announcement_type: string;
  is_active: boolean;
  is_pinned: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// ============================================================
// Event Reminders
// ============================================================

export type ReminderType = '24h' | '1h' | 'custom';

export interface EventReminder {
  id: string;
  user_id: string;
  event_id: string;
  reminder_type: ReminderType;
  custom_minutes_before: number | null;
  is_sent: boolean;
  sent_at: string | null;
  created_at: string;
}

// ============================================================
// Service Layer Types
// ============================================================

export interface CommunicationEventPayload {
  eventType: CommunicationEventType;
  recipientId: string;
  recipientEmail?: string;
  recipientPhone?: string;
  category: NotificationCategory;
  title: string;
  body: string;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
  urgency?: 'normal' | 'high' | 'urgent';
}

export interface SendResult {
  success: boolean;
  channelsAttempted: CommunicationChannel[];
  channelsDelivered: CommunicationChannel[];
  errors: string[];
  eventId?: string;
}

// ============================================================
// Constants & Labels
// ============================================================

export const CHANNEL_LABELS: Record<CommunicationChannel, string> = {
  in_app: 'In-App',
  email: 'Email',
  push: 'Push',
  whatsapp: 'WhatsApp',
  sms: 'SMS',
};

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, { label: string; color: string }> = {
  queued: { label: 'Queued', color: 'muted' },
  sent: { label: 'Sent', color: 'info' },
  delivered: { label: 'Delivered', color: 'success' },
  failed: { label: 'Failed', color: 'error' },
  opened: { label: 'Opened', color: 'info' },
  read: { label: 'Read', color: 'success' },
};

export const NOTIFICATION_CATEGORY_LABELS: Record<NotificationCategory, string> = {
  orders: 'Orders',
  payments: 'Payments',
  messages: 'Messages',
  businesses: 'Businesses',
  events: 'Events',
  reviews: 'Reviews',
  subscriptions: 'Subscriptions',
  verification: 'Verification',
  announcements: 'Announcements',
  general: 'General',
};

export const NOTIFICATION_CATEGORY_ICONS: Record<NotificationCategory, string> = {
  orders: 'ShoppingBag',
  payments: 'CreditCard',
  messages: 'MessageSquare',
  businesses: 'Store',
  events: 'Calendar',
  reviews: 'Star',
  subscriptions: 'RefreshCw',
  verification: 'BadgeCheck',
  announcements: 'Megaphone',
  general: 'Bell',
};

export const ANNOUNCEMENT_TYPE_LABELS: Record<AnnouncementType, string> = {
  new_product: 'New Product',
  holiday_hours: 'Holiday Hours',
  temporary_closure: 'Temporary Closure',
  special_promotion: 'Special Promotion',
  general: 'General',
};

export const BROADCAST_STATUS_LABELS: Record<BroadcastStatus, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'muted' },
  scheduled: { label: 'Scheduled', color: 'info' },
  pending_approval: { label: 'Pending Approval', color: 'warning' },
  approved: { label: 'Approved', color: 'success' },
  sending: { label: 'Sending', color: 'info' },
  sent: { label: 'Sent', color: 'success' },
  cancelled: { label: 'Cancelled', color: 'error' },
};

export const MESSAGE_REPORT_REASONS = [
  'Spam or promotional content',
  'Harassment or bullying',
  'Inappropriate content',
  'Scam or fraud',
  'Offensive language',
  'Other',
] as const;

export const ALLOWED_ATTACHMENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
];

export const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024; // 10MB

export const VENDOR_QUICK_REPLIES = [
  'Thank you for your order! We are processing it now.',
  'Your order is ready for pickup.',
  'Could you provide more details about what you need?',
  'Yes, that is available. Would you like to proceed?',
  'Your delivery is on the way.',
  'We apologize for the delay. How can we help?',
];

export const MESSAGE_RATE_LIMIT = 30; // max messages per minute per user
