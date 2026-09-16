/*
# Admin Platform Operations — Part 1: Tables & Extensions

Creates all admin tables, extends existing tables with admin columns,
and adds RLS policies. No functions in this part.
*/

-- =====================================================================
-- EXTEND REPORTS TABLE
-- =====================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'reports' AND column_name = 'resolution_note') THEN
    ALTER TABLE reports ADD COLUMN resolution_note text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'reports' AND column_name = 'priority') THEN
    ALTER TABLE reports ADD COLUMN priority text NOT NULL DEFAULT 'medium';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'reports' AND column_name = 'report_reason_category') THEN
    ALTER TABLE reports ADD COLUMN report_reason_category text;
  END IF;
END $$;

-- =====================================================================
-- EXTEND ADVERTISEMENTS TABLE
-- =====================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'advertisements' AND column_name = 'status') THEN
    ALTER TABLE advertisements ADD COLUMN status text NOT NULL DEFAULT 'pending';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'advertisements' AND column_name = 'reviewed_by') THEN
    ALTER TABLE advertisements ADD COLUMN reviewed_by uuid REFERENCES profiles(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'advertisements' AND column_name = 'reviewed_at') THEN
    ALTER TABLE advertisements ADD COLUMN reviewed_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'advertisements' AND column_name = 'rejection_reason') THEN
    ALTER TABLE advertisements ADD COLUMN rejection_reason text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'advertisements' AND column_name = 'priority') THEN
    ALTER TABLE advertisements ADD COLUMN priority int NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'advertisements' AND column_name = 'is_featured') THEN
    ALTER TABLE advertisements ADD COLUMN is_featured boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'advertisements' AND column_name = 'is_sponsored') THEN
    ALTER TABLE advertisements ADD COLUMN is_sponsored boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- =====================================================================
-- EXTEND SUBSCRIPTIONS TABLE
-- =====================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'subscriptions' AND column_name = 'auto_renew') THEN
    ALTER TABLE subscriptions ADD COLUMN auto_renew boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'subscriptions' AND column_name = 'cancelled_at') THEN
    ALTER TABLE subscriptions ADD COLUMN cancelled_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'subscriptions' AND column_name = 'renewal_failed_at') THEN
    ALTER TABLE subscriptions ADD COLUMN renewal_failed_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'subscriptions' AND column_name = 'extended_by') THEN
    ALTER TABLE subscriptions ADD COLUMN extended_by uuid REFERENCES profiles(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'subscriptions' AND column_name = 'extension_note') THEN
    ALTER TABLE subscriptions ADD COLUMN extension_note text;
  END IF;
END $$;

-- =====================================================================
-- SUPPORT_TICKETS
-- =====================================================================
CREATE TABLE IF NOT EXISTS support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number text UNIQUE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subject text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'general' CHECK (category IN ('technical', 'payment', 'verification', 'general')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  assigned_to uuid REFERENCES profiles(id),
  internal_notes text,
  closed_at timestamptz,
  closed_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_select_own_tickets" ON support_tickets;
CREATE POLICY "user_select_own_tickets"
ON support_tickets FOR SELECT TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "staff_select_all_tickets" ON support_tickets;
CREATE POLICY "staff_select_all_tickets"
ON support_tickets FOR SELECT TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "user_insert_tickets" ON support_tickets;
CREATE POLICY "user_insert_tickets"
ON support_tickets FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "staff_update_tickets" ON support_tickets;
CREATE POLICY "staff_update_tickets"
ON support_tickets FOR UPDATE TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'))
WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

CREATE INDEX IF NOT EXISTS idx_tickets_user ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned ON support_tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tickets_number ON support_tickets(ticket_number);

-- =====================================================================
-- TICKET_REPLIES
-- =====================================================================
CREATE TABLE IF NOT EXISTS ticket_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  body text NOT NULL,
  is_internal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ticket_replies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_select_ticket_replies" ON ticket_replies;
CREATE POLICY "user_select_ticket_replies"
ON ticket_replies FOR SELECT TO authenticated
USING (
  is_internal = false AND
  EXISTS (SELECT 1 FROM support_tickets WHERE support_tickets.id = ticket_replies.ticket_id AND support_tickets.user_id = auth.uid())
);

DROP POLICY IF EXISTS "staff_select_ticket_replies" ON ticket_replies;
CREATE POLICY "staff_select_ticket_replies"
ON ticket_replies FOR SELECT TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "user_insert_ticket_replies" ON ticket_replies;
CREATE POLICY "user_insert_ticket_replies"
ON ticket_replies FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = author_id AND
  is_internal = false AND
  EXISTS (SELECT 1 FROM support_tickets WHERE support_tickets.id = ticket_replies.ticket_id AND support_tickets.user_id = auth.uid())
);

DROP POLICY IF EXISTS "staff_insert_ticket_replies" ON ticket_replies;
CREATE POLICY "staff_insert_ticket_replies"
ON ticket_replies FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = author_id AND
  auth.jwt() ->> 'role' IN ('moderator', 'super_admin')
);

CREATE INDEX IF NOT EXISTS idx_ticket_replies_ticket ON ticket_replies(ticket_id);

-- =====================================================================
-- CMS_PAGES
-- =====================================================================
CREATE TABLE IF NOT EXISTS cms_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  content text,
  page_type text NOT NULL DEFAULT 'blog' CHECK (page_type IN ('banner', 'faq', 'blog', 'help', 'terms', 'privacy', 'guidelines', 'about')),
  is_published boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  author_id uuid REFERENCES profiles(id),
  meta_description text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cms_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_select_cms_pages" ON cms_pages;
CREATE POLICY "public_select_cms_pages"
ON cms_pages FOR SELECT TO anon, authenticated
USING (is_published = true);

DROP POLICY IF EXISTS "staff_select_all_cms_pages" ON cms_pages;
CREATE POLICY "staff_select_all_cms_pages"
ON cms_pages FOR SELECT TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "staff_insert_cms_pages" ON cms_pages;
CREATE POLICY "staff_insert_cms_pages"
ON cms_pages FOR INSERT TO authenticated
WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "staff_update_cms_pages" ON cms_pages;
CREATE POLICY "staff_update_cms_pages"
ON cms_pages FOR UPDATE TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'))
WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "staff_delete_cms_pages" ON cms_pages;
CREATE POLICY "staff_delete_cms_pages"
ON cms_pages FOR DELETE TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

CREATE INDEX IF NOT EXISTS idx_cms_pages_slug ON cms_pages(slug);
CREATE INDEX IF NOT EXISTS idx_cms_pages_type ON cms_pages(page_type);
CREATE INDEX IF NOT EXISTS idx_cms_pages_published ON cms_pages(is_published);

-- =====================================================================
-- CMS_FAQ_ENTRIES
-- =====================================================================
CREATE TABLE IF NOT EXISTS cms_faq_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question text NOT NULL,
  answer text NOT NULL,
  category text,
  sort_order int NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cms_faq_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_select_faq" ON cms_faq_entries;
CREATE POLICY "public_select_faq"
ON cms_faq_entries FOR SELECT TO anon, authenticated
USING (is_published = true);

DROP POLICY IF EXISTS "staff_select_all_faq" ON cms_faq_entries;
CREATE POLICY "staff_select_all_faq"
ON cms_faq_entries FOR SELECT TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "staff_insert_faq" ON cms_faq_entries;
CREATE POLICY "staff_insert_faq"
ON cms_faq_entries FOR INSERT TO authenticated
WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "staff_update_faq" ON cms_faq_entries;
CREATE POLICY "staff_update_faq"
ON cms_faq_entries FOR UPDATE TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'))
WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "staff_delete_faq" ON cms_faq_entries;
CREATE POLICY "staff_delete_faq"
ON cms_faq_entries FOR DELETE TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

CREATE INDEX IF NOT EXISTS idx_faq_category ON cms_faq_entries(category);
CREATE INDEX IF NOT EXISTS idx_faq_sort ON cms_faq_entries(sort_order);

-- =====================================================================
-- CATEGORIES
-- =====================================================================
CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  description text,
  icon text,
  parent_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  sort_order int NOT NULL DEFAULT 0,
  is_visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_select_categories" ON categories;
CREATE POLICY "public_select_categories"
ON categories FOR SELECT TO anon, authenticated
USING (is_visible = true);

DROP POLICY IF EXISTS "staff_select_all_categories" ON categories;
CREATE POLICY "staff_select_all_categories"
ON categories FOR SELECT TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "staff_insert_categories" ON categories;
CREATE POLICY "staff_insert_categories"
ON categories FOR INSERT TO authenticated
WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "staff_update_categories" ON categories;
CREATE POLICY "staff_update_categories"
ON categories FOR UPDATE TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'))
WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "staff_delete_categories" ON categories;
CREATE POLICY "staff_delete_categories"
ON categories FOR DELETE TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_sort ON categories(sort_order);

-- Seed initial categories
INSERT INTO categories (name, slug, icon, sort_order, is_visible)
SELECT * FROM (VALUES
  ('Food & Drinks', 'food-and-drinks', '🍽️', 1, true),
  ('Printing & Photocopy', 'printing-and-photocopy', '🖨️', 2, true),
  ('Fashion', 'fashion', '👕', 3, true),
  ('Hair & Beauty', 'hair-and-beauty', '💇', 4, true),
  ('Phone Accessories', 'phone-accessories', '📱', 5, true),
  ('Electronics', 'electronics', '🔌', 6, true),
  ('Repairs', 'repairs', '🔧', 7, true),
  ('Laundry', 'laundry', '🧺', 8, true),
  ('Transportation', 'transportation', '🚗', 9, true),
  ('Accommodation', 'accommodation', '🏠', 10, true),
  ('Tutoring', 'tutoring', '📚', 11, true),
  ('Photography', 'photography', '📸', 12, true),
  ('Technology Services', 'technology-services', '💻', 13, true),
  ('Student Freelancers', 'student-freelancers', '🎓', 14, true),
  ('Other Services', 'other-services', '⚙️', 15, true)
) AS v(name, slug, icon, sort_order, is_visible)
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE slug = v.slug);

-- =====================================================================
-- ANNOUNCEMENTS
-- =====================================================================
CREATE TABLE IF NOT EXISTS announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  type text NOT NULL DEFAULT 'platform' CHECK (type IN ('platform', 'university', 'maintenance', 'promotional')),
  target_audience text NOT NULL DEFAULT 'all' CHECK (target_audience IN ('all', 'students', 'vendors', 'specific_university')),
  university_id uuid REFERENCES universities(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_select_announcements" ON announcements;
CREATE POLICY "public_select_announcements"
ON announcements FOR SELECT TO anon, authenticated
USING (is_active = true AND starts_at <= now() AND ends_at >= now());

DROP POLICY IF EXISTS "staff_select_all_announcements" ON announcements;
CREATE POLICY "staff_select_all_announcements"
ON announcements FOR SELECT TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "staff_insert_announcements" ON announcements;
CREATE POLICY "staff_insert_announcements"
ON announcements FOR INSERT TO authenticated
WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "staff_update_announcements" ON announcements;
CREATE POLICY "staff_update_announcements"
ON announcements FOR UPDATE TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'))
WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "staff_delete_announcements" ON announcements;
CREATE POLICY "staff_delete_announcements"
ON announcements FOR DELETE TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

CREATE INDEX IF NOT EXISTS idx_announcements_type ON announcements(type);
CREATE INDEX IF NOT EXISTS idx_announcements_active ON announcements(is_active);
CREATE INDEX IF NOT EXISTS idx_announcements_audience ON announcements(target_audience);

-- =====================================================================
-- ADMIN_ACTIONS (immutable audit trail for admin panel)
-- =====================================================================
CREATE TABLE IF NOT EXISTS admin_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  action text NOT NULL,
  module text NOT NULL,
  target_type text,
  target_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address inet,
  result text NOT NULL DEFAULT 'success' CHECK (result IN ('success', 'failure')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE admin_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_select_admin_actions" ON admin_actions;
CREATE POLICY "admin_select_admin_actions"
ON admin_actions FOR SELECT TO authenticated
USING (auth.jwt() ->> 'role' = 'super_admin');

DROP POLICY IF EXISTS "insert_admin_actions" ON admin_actions;
CREATE POLICY "insert_admin_actions"
ON admin_actions FOR INSERT TO authenticated
WITH CHECK (auth.uid() = admin_id);

CREATE INDEX IF NOT EXISTS idx_admin_actions_admin ON admin_actions(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_actions_module ON admin_actions(module);
CREATE INDEX IF NOT EXISTS idx_admin_actions_action ON admin_actions(action);
CREATE INDEX IF NOT EXISTS idx_admin_actions_created ON admin_actions(created_at DESC);

-- =====================================================================
-- EXTEND REPORTS RLS
-- =====================================================================
DROP POLICY IF EXISTS "staff_select_reports" ON reports;
CREATE POLICY "staff_select_reports"
ON reports FOR SELECT TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "staff_update_reports" ON reports;
CREATE POLICY "staff_update_reports"
ON reports FOR UPDATE TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'))
WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "user_select_own_reports" ON reports;
CREATE POLICY "user_select_own_reports"
ON reports FOR SELECT TO authenticated
USING (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "user_insert_reports" ON reports;
CREATE POLICY "user_insert_reports"
ON reports FOR INSERT TO authenticated
WITH CHECK (auth.uid() = reporter_id);

CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_priority ON reports(priority);

-- =====================================================================
-- EXTEND ADVERTISEMENTS RLS
-- =====================================================================
DROP POLICY IF EXISTS "staff_select_ads" ON advertisements;
CREATE POLICY "staff_select_ads"
ON advertisements FOR SELECT TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "staff_update_ads" ON advertisements;
CREATE POLICY "staff_update_ads"
ON advertisements FOR UPDATE TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'))
WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "staff_insert_ads" ON advertisements;
CREATE POLICY "staff_insert_ads"
ON advertisements FOR INSERT TO authenticated
WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "staff_delete_ads" ON advertisements;
CREATE POLICY "staff_delete_ads"
ON advertisements FOR DELETE TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

CREATE INDEX IF NOT EXISTS idx_ads_status ON advertisements(status);
CREATE INDEX IF NOT EXISTS idx_ads_priority ON advertisements(priority);

-- =====================================================================
-- EXTEND SUBSCRIPTIONS RLS
-- =====================================================================
DROP POLICY IF EXISTS "staff_select_subscriptions" ON subscriptions;
CREATE POLICY "staff_select_subscriptions"
ON subscriptions FOR SELECT TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "staff_update_subscriptions" ON subscriptions;
CREATE POLICY "staff_update_subscriptions"
ON subscriptions FOR UPDATE TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'))
WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

-- =====================================================================
-- EXTEND UNIVERSITIES RLS
-- =====================================================================
DROP POLICY IF EXISTS "staff_insert_universities" ON universities;
CREATE POLICY "staff_insert_universities"
ON universities FOR INSERT TO authenticated
WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "staff_update_universities" ON universities;
CREATE POLICY "staff_update_universities"
ON universities FOR UPDATE TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'))
WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

-- =====================================================================
-- EXTEND PROFILES RLS
-- =====================================================================
DROP POLICY IF EXISTS "staff_select_profiles" ON profiles;
CREATE POLICY "staff_select_profiles"
ON profiles FOR SELECT TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "staff_update_profiles" ON profiles;
CREATE POLICY "staff_update_profiles"
ON profiles FOR UPDATE TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'))
WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

-- =====================================================================
-- EXTEND STUDENT_PROFILES RLS
-- =====================================================================
DROP POLICY IF EXISTS "staff_select_student_profiles" ON student_profiles;
CREATE POLICY "staff_select_student_profiles"
ON student_profiles FOR SELECT TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "staff_update_student_profiles" ON student_profiles;
CREATE POLICY "staff_update_student_profiles"
ON student_profiles FOR UPDATE TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'))
WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

-- =====================================================================
-- EXTEND VENDOR_PROFILES RLS
-- =====================================================================
DROP POLICY IF EXISTS "staff_select_vendor_profiles" ON vendor_profiles;
CREATE POLICY "staff_select_vendor_profiles"
ON vendor_profiles FOR SELECT TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

-- =====================================================================
-- EXTEND VENDORS RLS
-- =====================================================================
DROP POLICY IF EXISTS "staff_select_vendors" ON vendors;
CREATE POLICY "staff_select_vendors"
ON vendors FOR SELECT TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "staff_update_vendors" ON vendors;
CREATE POLICY "staff_update_vendors"
ON vendors FOR UPDATE TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'))
WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

-- =====================================================================
-- EXTEND ORDERS RLS (admin read)
-- =====================================================================
DROP POLICY IF EXISTS "admin_select_orders" ON orders;
CREATE POLICY "admin_select_orders"
ON orders FOR SELECT TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

-- =====================================================================
-- EXTEND ORDER_ITEMS RLS
-- =====================================================================
DROP POLICY IF EXISTS "admin_select_order_items" ON order_items;
CREATE POLICY "admin_select_order_items"
ON order_items FOR SELECT TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

-- =====================================================================
-- EXTEND PRODUCTS RLS
-- =====================================================================
DROP POLICY IF EXISTS "staff_select_products" ON products;
CREATE POLICY "staff_select_products"
ON products FOR SELECT TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

-- =====================================================================
-- EXTEND SERVICES RLS
-- =====================================================================
DROP POLICY IF EXISTS "staff_select_services" ON services;
CREATE POLICY "staff_select_services"
ON services FOR SELECT TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

-- =====================================================================
-- EXTEND EVENTS RLS
-- =====================================================================
DROP POLICY IF EXISTS "staff_select_events" ON events;
CREATE POLICY "staff_select_events"
ON events FOR SELECT TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "staff_update_events" ON events;
CREATE POLICY "staff_update_events"
ON events FOR UPDATE TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'))
WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

-- =====================================================================
-- EXTEND REVIEWS RLS
-- =====================================================================
DROP POLICY IF EXISTS "staff_select_reviews" ON reviews;
CREATE POLICY "staff_select_reviews"
ON reviews FOR SELECT TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "staff_update_reviews" ON reviews;
CREATE POLICY "staff_update_reviews"
ON reviews FOR UPDATE TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'))
WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

-- =====================================================================
-- UPDATED_AT TRIGGERS for new tables
-- =====================================================================
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['support_tickets', 'cms_pages', 'cms_faq_entries', 'categories']) LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%s_updated ON %s;
       CREATE TRIGGER trg_%s_updated BEFORE UPDATE ON %s
       FOR EACH ROW EXECUTE FUNCTION set_updated_at();',
      t, t, t, t
    );
  END LOOP;
END $$;