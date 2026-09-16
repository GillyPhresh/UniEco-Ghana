/*
# Student Experience System — Core Tables

## Purpose
Creates the data layer for the student experience: saving businesses/products/services/events,
tracking recently viewed items, storing student preferences and interests, and preparing
the messaging foundation with conversations.

## New Tables

### 1. saved_items
Stores a student's saved/favourited items (businesses, products, services, events).
- `id` (uuid PK)
- `user_id` (uuid, defaults to auth.uid(), FK to auth.users, CASCADE)
- `item_type` (text: 'business' | 'product' | 'service' | 'event')
- `item_id` (uuid — references vendors/products/services/events by type)
- `collection` (text, nullable — named collections like 'Food', 'Services')
- `created_at` (timestamptz)
- Unique constraint on (user_id, item_type, item_id) to prevent duplicates

### 2. recently_viewed
Tracks items a student has viewed for recommendations and activity feed.
- `id` (uuid PK)
- `user_id` (uuid, defaults to auth.uid(), FK to auth.users, CASCADE)
- `item_type` (text: 'business' | 'product' | 'service' | 'event')
- `item_id` (uuid)
- `viewed_at` (timestamptz, defaults to now())
- Unique on (user_id, item_type, item_id) — upsert to keep one record per item

### 3. student_preferences
Stores student interests and notification preferences for personalization.
- `id` (uuid PK)
- `student_id` (uuid, defaults to auth.uid(), FK to auth.users, CASCADE, UNIQUE)
- `interests` (text[] — list of interest categories)
- `notification_preferences` (jsonb — granular notification toggles)
- `privacy_settings` (jsonb — what is visible publicly)
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

### 4. conversations
Prepares the messaging foundation for student-vendor communication.
- `id` (uuid PK)
- `participant_one` (uuid, defaults to auth.uid(), FK to auth.users, CASCADE)
- `participant_two` (uuid, FK to auth.users, CASCADE)
- `created_at` (timestamptz)
- `updated_at` (timestamptz)
- Unique on (participant_one, participant_two) — one conversation per pair
- Check constraint: participant_one != participant_two

## Security — RLS on all 4 tables
All tables are owner-scoped: students can only see/modify their own rows.
For conversations, either participant can see and modify the conversation.
Policies use auth.uid() for ownership checks.

## Notes
1. reviews table already exists and is used as-is.
2. messages table already exists; conversations groups messages into threads.
3. notifications table already exists and is used as-is.
4. No data loss — all tables are new (CREATE TABLE IF NOT EXISTS).
*/

-- ============================================================
-- 1. saved_items
-- ============================================================
CREATE TABLE IF NOT EXISTS saved_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (item_type IN ('business', 'product', 'service', 'event')),
  item_id uuid NOT NULL,
  collection text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, item_type, item_id)
);

ALTER TABLE saved_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_saved_items" ON saved_items;
CREATE POLICY "select_own_saved_items" ON saved_items FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_saved_items" ON saved_items;
CREATE POLICY "insert_own_saved_items" ON saved_items FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_saved_items" ON saved_items;
CREATE POLICY "update_own_saved_items" ON saved_items FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_saved_items" ON saved_items;
CREATE POLICY "delete_own_saved_items" ON saved_items FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_saved_items_user ON saved_items(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_items_user_type ON saved_items(user_id, item_type);

-- ============================================================
-- 2. recently_viewed
-- ============================================================
CREATE TABLE IF NOT EXISTS recently_viewed (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (item_type IN ('business', 'product', 'service', 'event')),
  item_id uuid NOT NULL,
  viewed_at timestamptz DEFAULT now(),
  UNIQUE (user_id, item_type, item_id)
);

ALTER TABLE recently_viewed ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_recently_viewed" ON recently_viewed;
CREATE POLICY "select_own_recently_viewed" ON recently_viewed FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_recently_viewed" ON recently_viewed;
CREATE POLICY "insert_own_recently_viewed" ON recently_viewed FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_recently_viewed" ON recently_viewed;
CREATE POLICY "update_own_recently_viewed" ON recently_viewed FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_recently_viewed" ON recently_viewed;
CREATE POLICY "delete_own_recently_viewed" ON recently_viewed FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_recently_viewed_user ON recently_viewed(user_id);
CREATE INDEX IF NOT EXISTS idx_recently_viewed_user_recent ON recently_viewed(user_id, viewed_at DESC);

-- ============================================================
-- 3. student_preferences
-- ============================================================
CREATE TABLE IF NOT EXISTS student_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  interests text[] DEFAULT '{}',
  notification_preferences jsonb DEFAULT '{"email": true, "push": true, "events": true, "messages": true, "reviews": true, "announcements": true}'::jsonb,
  privacy_settings jsonb DEFAULT '{"profile_visibility": "university", "contact_visibility": "university"}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE student_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_preferences" ON student_preferences;
CREATE POLICY "select_own_preferences" ON student_preferences FOR SELECT
  TO authenticated USING (auth.uid() = student_id);

DROP POLICY IF EXISTS "insert_own_preferences" ON student_preferences;
CREATE POLICY "insert_own_preferences" ON student_preferences FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "update_own_preferences" ON student_preferences;
CREATE POLICY "update_own_preferences" ON student_preferences FOR UPDATE
  TO authenticated USING (auth.uid() = student_id) WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "delete_own_preferences" ON student_preferences;
CREATE POLICY "delete_own_preferences" ON student_preferences FOR DELETE
  TO authenticated USING (auth.uid() = student_id);

-- ============================================================
-- 4. conversations
-- ============================================================
CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_one uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  participant_two uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (participant_one, participant_two),
  CHECK (participant_one != participant_two)
);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- Either participant can read the conversation
DROP POLICY IF EXISTS "select_own_conversations" ON conversations;
CREATE POLICY "select_own_conversations" ON conversations FOR SELECT
  TO authenticated USING (auth.uid() = participant_one OR auth.uid() = participant_two);

-- Only participant_one (the initiator) can insert
DROP POLICY IF EXISTS "insert_own_conversations" ON conversations;
CREATE POLICY "insert_own_conversations" ON conversations FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = participant_one);

-- Either participant can update (e.g., updated_at timestamp)
DROP POLICY IF EXISTS "update_own_conversations" ON conversations;
CREATE POLICY "update_own_conversations" ON conversations FOR UPDATE
  TO authenticated USING (auth.uid() = participant_one OR auth.uid() = participant_two) WITH CHECK (auth.uid() = participant_one OR auth.uid() = participant_two);

-- Either participant can delete their own conversation
DROP POLICY IF EXISTS "delete_own_conversations" ON conversations;
CREATE POLICY "delete_own_conversations" ON conversations FOR DELETE
  TO authenticated USING (auth.uid() = participant_one OR auth.uid() = participant_two);

CREATE INDEX IF NOT EXISTS idx_conversations_p1 ON conversations(participant_one);
CREATE INDEX IF NOT EXISTS idx_conversations_p2 ON conversations(participant_two);

-- ============================================================
-- Update messages table: add conversation_id column if not exists
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'conversation_id'
  ) THEN
    ALTER TABLE messages ADD COLUMN conversation_id uuid;
  END IF;
END $$;

-- Add FK if column exists and FK not yet added
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'messages_conversation_id_fkey'
  ) THEN
    ALTER TABLE messages
    ADD CONSTRAINT messages_conversation_id_fkey
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Allow authenticated users to read messages where they are sender or recipient
-- (messages table already has RLS, check existing policies)
DROP POLICY IF EXISTS "select_own_messages" ON messages;
CREATE POLICY "select_own_messages" ON messages FOR SELECT
  TO authenticated USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

DROP POLICY IF EXISTS "insert_own_messages" ON messages;
CREATE POLICY "insert_own_messages" ON messages FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = sender_id);

DROP POLICY IF EXISTS "update_own_messages" ON messages;
CREATE POLICY "update_own_messages" ON messages FOR UPDATE
  TO authenticated USING (auth.uid() = sender_id OR auth.uid() = recipient_id) WITH CHECK (auth.uid() = sender_id OR auth.uid() = recipient_id);

DROP POLICY IF EXISTS "delete_own_messages" ON messages;
CREATE POLICY "delete_own_messages" ON messages FOR DELETE
  TO authenticated USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);

-- ============================================================
-- Update notifications table: ensure RLS policies exist
-- ============================================================
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_notifications" ON notifications;
CREATE POLICY "select_own_notifications" ON notifications FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_notifications" ON notifications;
CREATE POLICY "insert_own_notifications" ON notifications FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_notifications" ON notifications;
CREATE POLICY "update_own_notifications" ON notifications FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_notifications" ON notifications;
CREATE POLICY "delete_own_notifications" ON notifications FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Update reviews: ensure policies allow authenticated users to create reviews
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_all_reviews" ON reviews;
CREATE POLICY "select_all_reviews" ON reviews FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "insert_own_reviews" ON reviews;
CREATE POLICY "insert_own_reviews" ON reviews FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = reviewer_id);

DROP POLICY IF EXISTS "update_own_reviews" ON reviews;
CREATE POLICY "update_own_reviews" ON reviews FOR UPDATE
  TO authenticated USING (auth.uid() = reviewer_id) WITH CHECK (auth.uid() = reviewer_id);

DROP POLICY IF EXISTS "delete_own_reviews" ON reviews;
CREATE POLICY "delete_own_reviews" ON reviews FOR DELETE
  TO authenticated USING (auth.uid() = reviewer_id);