/*
# Unified Communication & Notification Hub

1. New Tables
- `message_attachments` — file attachments for messages (images, documents)
- `message_reads` — read receipts for individual messages
- `notification_preferences` — per-user, per-category channel preferences (in_app, email, push, whatsapp, sms)
- `communication_events` — outbound communication events (type, recipient, channels, status)
- `communication_deliveries` — per-channel delivery tracking (queued, sent, delivered, failed, opened, read)
- `communication_templates` — reusable message templates with variable placeholders
- `communication_logs` — administrative audit log of all outbound communications (metadata only, no message content)
- `push_subscriptions` — browser PWA push notification subscriptions (endpoint, p256dh, auth keys)
- `blocked_users` — user-level blocking for messaging
- `message_reports` — abuse reports for messages/conversations routed to moderation system
- `business_announcements` — vendor-created announcements for their own business
- `admin_broadcasts` — platform-wide broadcast announcements from admins
- `university_announcements` — university-scoped announcements
- `event_reminders` — user event reminder preferences (24h, 1h, custom)
2. Modified Tables
- `messages` — add columns: message_type, attachment_url, is_deleted, deleted_at, order_id
- `conversations` — add columns: order_id, is_archived, archived_at, last_message_at
- `notifications` — add columns: category, action_url, metadata, icon
3. Security
- RLS enabled on all new tables with ownership-based policies
- Admin/moderator access for communication logs, reports, broadcasts
- Privacy: message content NOT exposed in communication logs (metadata only)
*/

-- ============================================================
-- EXTEND EXISTING TABLES
-- ============================================================

ALTER TABLE messages ADD COLUMN IF NOT EXISTS message_type text NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'document', 'link'));
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_url text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS order_id uuid;

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS order_id uuid;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_message_at timestamptz;

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'general';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS action_url text;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS icon text;

-- Add order FK to conversations and messages
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_name = 'conversations' AND constraint_name = 'conversations_order_id_fkey') THEN
    ALTER TABLE conversations ADD CONSTRAINT conversations_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_name = 'messages' AND constraint_name = 'messages_order_id_fkey') THEN
    ALTER TABLE messages ADD CONSTRAINT messages_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_recipient_unread ON messages(recipient_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_messages_order ON messages(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_order ON conversations(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_participant ON conversations(participant_one, participant_two);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_category ON notifications(category);

-- ============================================================
-- NEW TABLES
-- ============================================================

-- Message attachments (for images, documents in chat)
CREATE TABLE IF NOT EXISTS message_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  file_name text NOT NULL,
  file_type text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  thumbnail_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_msg_attachments_message ON message_attachments(message_id);

-- Message read receipts
CREATE TABLE IF NOT EXISTS message_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_message_reads_message ON message_reads(message_id);
CREATE INDEX IF NOT EXISTS idx_message_reads_user ON message_reads(user_id);

-- Notification preferences (per-user, per-category, per-channel)
CREATE TABLE IF NOT EXISTS notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notif_prefs_user ON notification_preferences(user_id);

-- Communication events (outbound communication tracking)
CREATE TABLE IF NOT EXISTS communication_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  recipient_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  recipient_email text,
  recipient_phone text,
  subject text,
  channels text[] NOT NULL DEFAULT ARRAY['in_app'],
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'sent', 'delivered', 'failed', 'cancelled')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comm_events_recipient ON communication_events(recipient_id);
CREATE INDEX IF NOT EXISTS idx_comm_events_status ON communication_events(status);
CREATE INDEX IF NOT EXISTS idx_comm_events_type ON communication_events(event_type);
CREATE INDEX IF NOT EXISTS idx_comm_events_created ON communication_events(created_at DESC);

-- Communication deliveries (per-channel delivery tracking)
CREATE TABLE IF NOT EXISTS communication_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES communication_events(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('in_app', 'email', 'push', 'whatsapp', 'sms')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'delivered', 'failed', 'opened', 'read')),
  provider text,
  provider_reference text,
  error_message text,
  sent_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comm_deliveries_event ON communication_deliveries(event_id);
CREATE INDEX IF NOT EXISTS idx_comm_deliveries_channel ON communication_deliveries(channel);
CREATE INDEX IF NOT EXISTS idx_comm_deliveries_status ON communication_deliveries(status);

-- Communication templates (reusable, with variables)
CREATE TABLE IF NOT EXISTS communication_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key text NOT NULL UNIQUE,
  name text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('in_app', 'email', 'push', 'whatsapp', 'sms')),
  subject text,
  body text NOT NULL,
  variables text[] NOT NULL DEFAULT ARRAY[]::text[],
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comm_templates_key ON communication_templates(template_key);

-- Communication logs (admin audit — metadata only, no message content)
CREATE TABLE IF NOT EXISTS communication_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  channel text NOT NULL,
  recipient_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  recipient_identifier text,
  status text NOT NULL,
  provider text,
  provider_reference text,
  university_id uuid REFERENCES universities(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comm_logs_created ON communication_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comm_logs_channel ON communication_logs(channel);
CREATE INDEX IF NOT EXISTS idx_comm_logs_status ON communication_logs(status);
CREATE INDEX IF NOT EXISTS idx_comm_logs_university ON communication_logs(university_id);

-- Push subscriptions (browser PWA push)
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh_key text NOT NULL,
  auth_key text NOT NULL,
  expiration_time timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subs_active ON push_subscriptions(is_active) WHERE is_active = true;

-- Blocked users
CREATE TABLE IF NOT EXISTS blocked_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(blocker_id, blocked_id)
);
CREATE INDEX IF NOT EXISTS idx_blocked_blocker ON blocked_users(blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocked_blocked ON blocked_users(blocked_id);

-- Message reports (abuse reports routed to moderation)
CREATE TABLE IF NOT EXISTS message_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reported_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  reason text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'resolved', 'dismissed')),
  reviewed_by uuid REFERENCES profiles(id),
  reviewed_at timestamptz,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_msg_reports_status ON message_reports(status);
CREATE INDEX IF NOT EXISTS idx_msg_reports_reported ON message_reports(reported_id);
CREATE INDEX IF NOT EXISTS idx_msg_reports_created ON message_reports(created_at DESC);

-- Business announcements (vendor to their customers)
CREATE TABLE IF NOT EXISTS business_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  announcement_type text NOT NULL DEFAULT 'general' CHECK (announcement_type IN ('new_product', 'holiday_hours', 'temporary_closure', 'special_promotion', 'general')),
  image_url text,
  is_active boolean NOT NULL DEFAULT true,
  is_approved boolean NOT NULL DEFAULT false,
  reviewed_by uuid REFERENCES profiles(id),
  reviewed_at timestamptz,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_biz_announcements_vendor ON business_announcements(vendor_id);
CREATE INDEX IF NOT EXISTS idx_biz_announcements_active ON business_announcements(is_active, is_approved);

-- Admin broadcasts (platform-wide announcements)
CREATE TABLE IF NOT EXISTS admin_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  broadcast_type text NOT NULL DEFAULT 'announcement' CHECK (broadcast_type IN ('announcement', 'maintenance', 'update', 'event', 'promotion')),
  target_audience text NOT NULL DEFAULT 'all' CHECK (target_audience IN ('all', 'students', 'vendors', 'specific_university', 'specific_category', 'selected_users')),
  target_filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  channels text[] NOT NULL DEFAULT ARRAY['in_app'],
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'pending_approval', 'approved', 'sending', 'sent', 'cancelled')),
  scheduled_at timestamptz,
  sent_at timestamptz,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL REFERENCES profiles(id),
  approved_by uuid REFERENCES profiles(id),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_broadcasts_status ON admin_broadcasts(status);
CREATE INDEX IF NOT EXISTS idx_admin_broadcasts_created ON admin_broadcasts(created_at DESC);

-- University announcements
CREATE TABLE IF NOT EXISTS university_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id uuid NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  announcement_type text NOT NULL DEFAULT 'general',
  is_active boolean NOT NULL DEFAULT true,
  is_pinned boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_uni_announcements_university ON university_announcements(university_id);
CREATE INDEX IF NOT EXISTS idx_uni_announcements_active ON university_announcements(is_active);

-- Event reminders
CREATE TABLE IF NOT EXISTS event_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  reminder_type text NOT NULL DEFAULT '24h' CHECK (reminder_type IN ('24h', '1h', 'custom')),
  custom_minutes_before integer,
  is_sent boolean NOT NULL DEFAULT false,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, event_id, reminder_type)
);
CREATE INDEX IF NOT EXISTS idx_event_reminders_user ON event_reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_event_reminders_event ON event_reminders(event_id);
CREATE INDEX IF NOT EXISTS idx_event_reminders_unsent ON event_reminders(is_sent) WHERE is_sent = false;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- Message attachments
ALTER TABLE message_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "msg_attachments_select_participants" ON message_attachments;
CREATE POLICY "msg_attachments_select_participants"
ON message_attachments FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM messages WHERE messages.id = message_attachments.message_id
    AND (messages.sender_id = auth.uid() OR messages.recipient_id = auth.uid()))
);
DROP POLICY IF EXISTS "msg_attachments_insert_sender" ON message_attachments;
CREATE POLICY "msg_attachments_insert_sender"
ON message_attachments FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM messages WHERE messages.id = message_attachments.message_id AND messages.sender_id = auth.uid())
);

-- Message reads
ALTER TABLE message_reads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "msg_reads_select_own" ON message_reads;
CREATE POLICY "msg_reads_select_own"
ON message_reads FOR SELECT TO authenticated
USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM messages WHERE messages.id = message_reads.message_id AND messages.sender_id = auth.uid()));
DROP POLICY IF EXISTS "msg_reads_insert_own" ON message_reads;
CREATE POLICY "msg_reads_insert_own"
ON message_reads FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Notification preferences
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notif_prefs_select_own" ON notification_preferences;
CREATE POLICY "notif_prefs_select_own"
ON notification_preferences FOR SELECT TO authenticated
USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "notif_prefs_insert_own" ON notification_preferences;
CREATE POLICY "notif_prefs_insert_own"
ON notification_preferences FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "notif_prefs_update_own" ON notification_preferences;
CREATE POLICY "notif_prefs_update_own"
ON notification_preferences FOR UPDATE TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Communication events
ALTER TABLE communication_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "comm_events_select_own" ON communication_events;
CREATE POLICY "comm_events_select_own"
ON communication_events FOR SELECT TO authenticated
USING (auth.uid() = recipient_id);
DROP POLICY IF EXISTS "comm_events_select_staff" ON communication_events;
CREATE POLICY "comm_events_select_staff"
ON communication_events FOR SELECT TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));
DROP POLICY IF EXISTS "comm_events_insert_staff" ON communication_events;
CREATE POLICY "comm_events_insert_staff"
ON communication_events FOR INSERT TO authenticated
WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

-- Communication deliveries
ALTER TABLE communication_deliveries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "comm_deliveries_select_staff" ON communication_deliveries;
CREATE POLICY "comm_deliveries_select_staff"
ON communication_deliveries FOR SELECT TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));
DROP POLICY IF EXISTS "comm_deliveries_insert_staff" ON communication_deliveries;
CREATE POLICY "comm_deliveries_insert_staff"
ON communication_deliveries FOR INSERT TO authenticated
WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));
DROP POLICY IF EXISTS "comm_deliveries_update_staff" ON communication_deliveries;
CREATE POLICY "comm_deliveries_update_staff"
ON communication_deliveries FOR UPDATE TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

-- Communication templates
ALTER TABLE communication_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "comm_templates_select_all" ON communication_templates;
CREATE POLICY "comm_templates_select_all"
ON communication_templates FOR SELECT TO authenticated
USING (is_active = true);
DROP POLICY IF EXISTS "comm_templates_manage_staff" ON communication_templates;
CREATE POLICY "comm_templates_manage_staff"
ON communication_templates FOR ALL TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'))
WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

-- Communication logs (admin only)
ALTER TABLE communication_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "comm_logs_select_staff" ON communication_logs;
CREATE POLICY "comm_logs_select_staff"
ON communication_logs FOR SELECT TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));
DROP POLICY IF EXISTS "comm_logs_insert_staff" ON communication_logs;
CREATE POLICY "comm_logs_insert_staff"
ON communication_logs FOR INSERT TO authenticated
WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

-- Push subscriptions
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "push_subs_select_own" ON push_subscriptions;
CREATE POLICY "push_subs_select_own"
ON push_subscriptions FOR SELECT TO authenticated
USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "push_subs_insert_own" ON push_subscriptions;
CREATE POLICY "push_subs_insert_own"
ON push_subscriptions FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "push_subs_update_own" ON push_subscriptions;
CREATE POLICY "push_subs_update_own"
ON push_subscriptions FOR UPDATE TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "push_subs_delete_own" ON push_subscriptions;
CREATE POLICY "push_subs_delete_own"
ON push_subscriptions FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- Blocked users
ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "blocked_select_blocker" ON blocked_users;
CREATE POLICY "blocked_select_blocker"
ON blocked_users FOR SELECT TO authenticated
USING (auth.uid() = blocker_id);
DROP POLICY IF EXISTS "blocked_insert_blocker" ON blocked_users;
CREATE POLICY "blocked_insert_blocker"
ON blocked_users FOR INSERT TO authenticated
WITH CHECK (auth.uid() = blocker_id);
DROP POLICY IF EXISTS "blocked_delete_blocker" ON blocked_users;
CREATE POLICY "blocked_delete_blocker"
ON blocked_users FOR DELETE TO authenticated
USING (auth.uid() = blocker_id);

-- Message reports
ALTER TABLE message_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "msg_reports_select_reporter" ON message_reports;
CREATE POLICY "msg_reports_select_reporter"
ON message_reports FOR SELECT TO authenticated
USING (auth.uid() = reporter_id OR auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));
DROP POLICY IF EXISTS "msg_reports_insert_reporter" ON message_reports;
CREATE POLICY "msg_reports_insert_reporter"
ON message_reports FOR INSERT TO authenticated
WITH CHECK (auth.uid() = reporter_id);
DROP POLICY IF EXISTS "msg_reports_update_staff" ON message_reports;
CREATE POLICY "msg_reports_update_staff"
ON message_reports FOR UPDATE TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'))
WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

-- Business announcements
ALTER TABLE business_announcements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "biz_announcements_select_public" ON business_announcements;
CREATE POLICY "biz_announcements_select_public"
ON business_announcements FOR SELECT TO authenticated
USING (is_active = true AND is_approved = true);
DROP POLICY IF EXISTS "biz_announcements_select_owner" ON business_announcements;
CREATE POLICY "biz_announcements_select_owner"
ON business_announcements FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM vendors WHERE vendors.id = business_announcements.vendor_id AND vendors.owner_id = auth.uid()));
DROP POLICY IF EXISTS "biz_announcements_select_staff" ON business_announcements;
CREATE POLICY "biz_announcements_select_staff"
ON business_announcements FOR SELECT TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));
DROP POLICY IF EXISTS "biz_announcements_insert_owner" ON business_announcements;
CREATE POLICY "biz_announcements_insert_owner"
ON business_announcements FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM vendors WHERE vendors.id = business_announcements.vendor_id AND vendors.owner_id = auth.uid()));
DROP POLICY IF EXISTS "biz_announcements_update_owner" ON business_announcements;
CREATE POLICY "biz_announcements_update_owner"
ON business_announcements FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM vendors WHERE vendors.id = business_announcements.vendor_id AND vendors.owner_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM vendors WHERE vendors.id = business_announcements.vendor_id AND vendors.owner_id = auth.uid()));
DROP POLICY IF EXISTS "biz_announcements_update_staff" ON business_announcements;
CREATE POLICY "biz_announcements_update_staff"
ON business_announcements FOR UPDATE TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'))
WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

-- Admin broadcasts (admin manages, users can read sent broadcasts)
ALTER TABLE admin_broadcasts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "broadcasts_select_sent" ON admin_broadcasts;
CREATE POLICY "broadcasts_select_sent"
ON admin_broadcasts FOR SELECT TO authenticated
USING (status = 'sent' OR auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));
DROP POLICY IF EXISTS "broadcasts_manage_staff" ON admin_broadcasts;
CREATE POLICY "broadcasts_manage_staff"
ON admin_broadcasts FOR ALL TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'))
WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

-- University announcements
ALTER TABLE university_announcements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "uni_announcements_select" ON university_announcements;
CREATE POLICY "uni_announcements_select"
ON university_announcements FOR SELECT TO authenticated
USING (is_active = true);
DROP POLICY IF EXISTS "uni_announcements_manage_staff" ON university_announcements;
CREATE POLICY "uni_announcements_manage_staff"
ON university_announcements FOR ALL TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'))
WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

-- Event reminders
ALTER TABLE event_reminders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "event_reminders_select_own" ON event_reminders;
CREATE POLICY "event_reminders_select_own"
ON event_reminders FOR SELECT TO authenticated
USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "event_reminders_insert_own" ON event_reminders;
CREATE POLICY "event_reminders_insert_own"
ON event_reminders FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "event_reminders_delete_own" ON event_reminders;
CREATE POLICY "event_reminders_delete_own"
ON event_reminders FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- ============================================================
-- SEED COMMUNICATION TEMPLATES
-- ============================================================
INSERT INTO communication_templates (template_key, name, channel, subject, body, variables) VALUES
  ('order_placed', 'Order Placed', 'in_app', NULL, 'Your order {{order_number}} has been placed successfully.', ARRAY['order_number']),
  ('order_accepted', 'Order Accepted', 'in_app', NULL, 'Your order {{order_number}} has been accepted by {{business_name}}.', ARRAY['order_number', 'business_name']),
  ('order_cancelled', 'Order Cancelled', 'in_app', NULL, 'Your order {{order_number}} has been cancelled.', ARRAY['order_number']),
  ('payment_successful', 'Payment Successful', 'in_app', NULL, 'Your payment of GHS {{amount}} was successful.', ARRAY['amount']),
  ('payment_failed', 'Payment Failed', 'in_app', NULL, 'Your payment of GHS {{amount}} failed. Please try again.', ARRAY['amount']),
  ('subscription_expiring', 'Subscription Expiring', 'in_app', NULL, 'Your {{plan}} subscription expires in {{days}} days.', ARRAY['plan', 'days']),
  ('vendor_approved', 'Vendor Approved', 'in_app', NULL, 'Your vendor account for {{business_name}} has been approved!', ARRAY['business_name']),
  ('student_verified', 'Student Verified', 'in_app', NULL, 'Your student verification has been approved!', ARRAY[]::text[]),
  ('new_message', 'New Message', 'in_app', NULL, 'You have a new message from {{sender_name}}.', ARRAY['sender_name']),
  ('new_review', 'New Review', 'in_app', NULL, 'You received a new {{rating}}-star review.', ARRAY['rating']),
  ('event_reminder', 'Event Reminder', 'in_app', NULL, 'Reminder: {{event_name}} starts in {{time}}.', ARRAY['event_name', 'time']),
  ('ad_approved', 'Advertisement Approved', 'in_app', NULL, 'Your advertisement "{{ad_title}}" has been approved.', ARRAY['ad_title']),
  ('support_update', 'Support Ticket Update', 'in_app', NULL, 'Your support ticket has been updated.', ARRAY[]::text[]),
  ('welcome_email', 'Welcome Email', 'email', 'Welcome to UniEco Ghana, {{user_name}}!', 'Welcome to UniEco Ghana, {{user_name}}! Complete your profile to get started.', ARRAY['user_name']),
  ('order_confirmation_email', 'Order Confirmation Email', 'email', 'Order {{order_number}} confirmed', 'Hi {{user_name}}, your order {{order_number}} from {{business_name}} has been confirmed. Total: GHS {{amount}}.', ARRAY['user_name', 'order_number', 'business_name', 'amount']),
  ('payment_confirmation_email', 'Payment Confirmation Email', 'email', 'Payment confirmed — GHS {{amount}}', 'Hi {{user_name}}, your payment of GHS {{amount}} has been confirmed. Receipt: {{receipt_number}}.', ARRAY['user_name', 'amount', 'receipt_number']),
  ('subscription_reminder_email', 'Subscription Reminder Email', 'email', 'Your subscription expires soon', 'Hi {{user_name}}, your {{plan}} subscription expires on {{date}}. Renew to keep your features.', ARRAY['user_name', 'plan', 'date']),
  ('event_reminder_email', 'Event Reminder Email', 'email', 'Reminder: {{event_name}} tomorrow', 'Hi {{user_name}}, this is a reminder that {{event_name}} is happening on {{date}} at {{time}}.', ARRAY['user_name', 'event_name', 'date', 'time']),
  ('whatsapp_order_update', 'WhatsApp Order Update', 'whatsapp', NULL, 'Hello {{user_name}}, your order {{order_number}} from {{business_name}} has been updated to: {{status}}.', ARRAY['user_name', 'order_number', 'business_name', 'status']),
  ('whatsapp_subscription_reminder', 'WhatsApp Subscription Reminder', 'whatsapp', NULL, 'Hello {{user_name}}, your {{plan}} subscription expires on {{date}}. Renew at unieco.gh.', ARRAY['user_name', 'plan', 'date']),
  ('sms_otp', 'SMS OTP', 'sms', NULL, 'Your UniEco Ghana verification code is {{code}}.', ARRAY['code']),
  ('sms_order_ready', 'SMS Order Ready', 'sms', NULL, 'Your order {{order_number}} from {{business_name}} is ready for pickup.', ARRAY['order_number', 'business_name'])
ON CONFLICT (template_key) DO NOTHING;