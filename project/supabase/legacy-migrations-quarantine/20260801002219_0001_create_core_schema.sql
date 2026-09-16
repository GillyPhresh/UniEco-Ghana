/*
# UniEco Ghana — Core Multi-Tenant Schema

## Purpose
Establishes the foundational multi-tenant database for the UniEco Ghana platform.
One deployment supports every tertiary institution in Ghana. Each university's
data is isolated while sharing a single application. The first enabled university
is the University of Energy and Natural Resources (UENR); administrators can add
more universities later without modifying application code.

## 1. New Tables
- universities (tenant root)
- user_roles (app role catalog, seeded)
- profiles (one row per auth user)
- student_profiles (student-specific extension)
- vendors (business entity owned by a user)
- businesses (storefront under a vendor)
- products, services (sellable items)
- orders, order_items, payments
- subscriptions
- events
- reviews, messages, notifications
- advertisements, locations, reports

## 2. Security — RLS
App HAS a sign-in screen. Owner-scoped tables use auth.uid() ownership checks
scoped TO authenticated. Public browse content (enabled universities, active
vendors/businesses/products/services, published events, approved reviews) is
readable by anon+authenticated so visitors can browse before signing in.

## 3. Seed
- Six user_roles rows.
- One enabled university: UENR.

## 4. Notes
- Owner columns default to auth.uid() so inserts omitting the owner still pass WITH CHECK.
- A SECURITY DEFINER trigger auto-creates a profile on auth user signup.
*/

-- =====================================================================
-- ROLE CATALOG
-- =====================================================================
CREATE TABLE IF NOT EXISTS user_roles (
  id smallint PRIMARY KEY,
  name text UNIQUE NOT NULL,
  description text
);

INSERT INTO user_roles (id, name, description) VALUES
  (1, 'visitor', 'Unauthenticated browsing user'),
  (2, 'student', 'Authenticated student member of a university'),
  (3, 'student_vendor', 'Student who also operates a business'),
  (4, 'external_vendor', 'Non-student business operator near a campus'),
  (5, 'moderator', 'Content moderator with limited admin powers'),
  (6, 'super_admin', 'Platform super administrator')
ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- UNIVERSITIES
-- =====================================================================
CREATE TABLE IF NOT EXISTS universities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  short_name text UNIQUE NOT NULL,
  slug text UNIQUE NOT NULL,
  city text,
  region text,
  country text NOT NULL DEFAULT 'Ghana',
  logo_url text,
  website_url text,
  description text,
  is_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE universities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_select_enabled_universities" ON universities;
CREATE POLICY "public_select_enabled_universities"
ON universities FOR SELECT
TO anon, authenticated
USING (is_enabled = true);

DROP POLICY IF EXISTS "admin_insert_universities" ON universities;
CREATE POLICY "admin_insert_universities"
ON universities FOR INSERT
TO authenticated
WITH CHECK (auth.jwt() ->> 'role' = 'super_admin');

DROP POLICY IF EXISTS "admin_update_universities" ON universities;
CREATE POLICY "admin_update_universities"
ON universities FOR UPDATE
TO authenticated
USING (auth.jwt() ->> 'role' = 'super_admin')
WITH CHECK (auth.jwt() ->> 'role' = 'super_admin');

-- =====================================================================
-- PROFILES
-- =====================================================================
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  university_id uuid REFERENCES universities(id),
  role_id smallint NOT NULL DEFAULT 2 REFERENCES user_roles(id),
  email text NOT NULL,
  full_name text,
  phone text,
  avatar_url text,
  bio text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own_profile" ON profiles;
CREATE POLICY "users_read_own_profile"
ON profiles FOR SELECT
TO authenticated
USING (auth.uid() = id);

DROP POLICY IF EXISTS "users_insert_own_profile" ON profiles;
CREATE POLICY "users_insert_own_profile"
ON profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "users_update_own_profile" ON profiles;
CREATE POLICY "users_update_own_profile"
ON profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "staff_read_all_profiles" ON profiles;
CREATE POLICY "staff_read_all_profiles"
ON profiles FOR SELECT
TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

-- =====================================================================
-- STUDENT PROFILES
-- =====================================================================
CREATE TABLE IF NOT EXISTS student_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  university_id uuid REFERENCES universities(id),
  student_id_number text,
  program_of_study text,
  level text,
  graduation_year int,
  is_verified_student boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE student_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "students_read_own_profile" ON student_profiles;
CREATE POLICY "students_read_own_profile"
ON student_profiles FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "students_insert_own_profile" ON student_profiles;
CREATE POLICY "students_insert_own_profile"
ON student_profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "students_update_own_profile" ON student_profiles;
CREATE POLICY "students_update_own_profile"
ON student_profiles FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- =====================================================================
-- VENDORS
-- =====================================================================
CREATE TABLE IF NOT EXISTS vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id uuid REFERENCES universities(id),
  owner_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  business_name text NOT NULL,
  business_slug text UNIQUE NOT NULL,
  business_type text,
  description text,
  is_student_business boolean NOT NULL DEFAULT false,
  is_verified boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  logo_url text,
  cover_image_url text,
  contact_phone text,
  contact_email text,
  website_url text,
  rating_avg numeric(3,2) NOT NULL DEFAULT 0,
  rating_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_select_active_vendors" ON vendors;
CREATE POLICY "public_select_active_vendors"
ON vendors FOR SELECT
TO anon, authenticated
USING (is_active = true);

DROP POLICY IF EXISTS "owners_insert_vendors" ON vendors;
CREATE POLICY "owners_insert_vendors"
ON vendors FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "owners_update_vendors" ON vendors;
CREATE POLICY "owners_update_vendors"
ON vendors FOR UPDATE
TO authenticated
USING (auth.uid() = owner_id)
WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "owners_delete_vendors" ON vendors;
CREATE POLICY "owners_delete_vendors"
ON vendors FOR DELETE
TO authenticated
USING (auth.uid() = owner_id);

-- =====================================================================
-- BUSINESSES
-- =====================================================================
CREATE TABLE IF NOT EXISTS businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  university_id uuid REFERENCES universities(id),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  description text,
  category text,
  logo_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_select_active_businesses" ON businesses;
CREATE POLICY "public_select_active_businesses"
ON businesses FOR SELECT
TO anon, authenticated
USING (is_active = true);

DROP POLICY IF EXISTS "owners_insert_businesses" ON businesses;
CREATE POLICY "owners_insert_businesses"
ON businesses FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM vendors WHERE vendors.id = businesses.vendor_id AND vendors.owner_id = auth.uid())
);

DROP POLICY IF EXISTS "owners_update_businesses" ON businesses;
CREATE POLICY "owners_update_businesses"
ON businesses FOR UPDATE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM vendors WHERE vendors.id = businesses.vendor_id AND vendors.owner_id = auth.uid())
)
WITH CHECK (
  EXISTS (SELECT 1 FROM vendors WHERE vendors.id = businesses.vendor_id AND vendors.owner_id = auth.uid())
);

DROP POLICY IF EXISTS "owners_delete_businesses" ON businesses;
CREATE POLICY "owners_delete_businesses"
ON businesses FOR DELETE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM vendors WHERE vendors.id = businesses.vendor_id AND vendors.owner_id = auth.uid())
);

-- =====================================================================
-- PRODUCTS
-- =====================================================================
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  university_id uuid REFERENCES universities(id),
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  price numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'GHS',
  stock int NOT NULL DEFAULT 0,
  image_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_select_active_products" ON products;
CREATE POLICY "public_select_active_products"
ON products FOR SELECT
TO anon, authenticated
USING (is_active = true);

DROP POLICY IF EXISTS "owners_insert_products" ON products;
CREATE POLICY "owners_insert_products"
ON products FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM businesses b
    JOIN vendors v ON v.id = b.vendor_id
    WHERE b.id = products.business_id AND v.owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "owners_update_products" ON products;
CREATE POLICY "owners_update_products"
ON products FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM businesses b
    JOIN vendors v ON v.id = b.vendor_id
    WHERE b.id = products.business_id AND v.owner_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM businesses b
    JOIN vendors v ON v.id = b.vendor_id
    WHERE b.id = products.business_id AND v.owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "owners_delete_products" ON products;
CREATE POLICY "owners_delete_products"
ON products FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM businesses b
    JOIN vendors v ON v.id = b.vendor_id
    WHERE b.id = products.business_id AND v.owner_id = auth.uid()
  )
);

-- =====================================================================
-- SERVICES
-- =====================================================================
CREATE TABLE IF NOT EXISTS services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  university_id uuid REFERENCES universities(id),
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  price numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'GHS',
  duration_estimate text,
  image_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_select_active_services" ON services;
CREATE POLICY "public_select_active_services"
ON services FOR SELECT
TO anon, authenticated
USING (is_active = true);

DROP POLICY IF EXISTS "owners_insert_services" ON services;
CREATE POLICY "owners_insert_services"
ON services FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM businesses b
    JOIN vendors v ON v.id = b.vendor_id
    WHERE b.id = services.business_id AND v.owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "owners_update_services" ON services;
CREATE POLICY "owners_update_services"
ON services FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM businesses b
    JOIN vendors v ON v.id = b.vendor_id
    WHERE b.id = services.business_id AND v.owner_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM businesses b
    JOIN vendors v ON v.id = b.vendor_id
    WHERE b.id = services.business_id AND v.owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "owners_delete_services" ON services;
CREATE POLICY "owners_delete_services"
ON services FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM businesses b
    JOIN vendors v ON v.id = b.vendor_id
    WHERE b.id = services.business_id AND v.owner_id = auth.uid()
  )
);

-- =====================================================================
-- ORDERS
-- =====================================================================
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id uuid REFERENCES universities(id),
  buyer_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  vendor_id uuid REFERENCES vendors(id),
  status text NOT NULL DEFAULT 'pending',
  total_amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'GHS',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "buyers_select_own_orders" ON orders;
CREATE POLICY "buyers_select_own_orders"
ON orders FOR SELECT
TO authenticated
USING (auth.uid() = buyer_id);

DROP POLICY IF EXISTS "buyers_insert_own_orders" ON orders;
CREATE POLICY "buyers_insert_own_orders"
ON orders FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = buyer_id);

DROP POLICY IF EXISTS "buyers_update_own_orders" ON orders;
CREATE POLICY "buyers_update_own_orders"
ON orders FOR UPDATE
TO authenticated
USING (auth.uid() = buyer_id)
WITH CHECK (auth.uid() = buyer_id);

DROP POLICY IF EXISTS "vendors_select_orders" ON orders;
CREATE POLICY "vendors_select_orders"
ON orders FOR SELECT
TO authenticated
USING (
  EXISTS (SELECT 1 FROM vendors WHERE vendors.id = orders.vendor_id AND vendors.owner_id = auth.uid())
);

-- =====================================================================
-- ORDER ITEMS
-- =====================================================================
CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id),
  service_id uuid REFERENCES services(id),
  quantity int NOT NULL DEFAULT 1,
  unit_price numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "participants_select_order_items" ON order_items;
CREATE POLICY "participants_select_order_items"
ON order_items FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM orders o
    LEFT JOIN vendors v ON v.id = o.vendor_id
    WHERE o.id = order_items.order_id
      AND (o.buyer_id = auth.uid() OR v.owner_id = auth.uid())
  )
);

-- =====================================================================
-- PAYMENTS
-- =====================================================================
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider text,
  provider_reference text UNIQUE,
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'GHS',
  status text NOT NULL DEFAULT 'pending',
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_owner_select_payments" ON payments;
CREATE POLICY "order_owner_select_payments"
ON payments FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM orders o
    LEFT JOIN vendors v ON v.id = o.vendor_id
    WHERE o.id = payments.order_id
      AND (o.buyer_id = auth.uid() OR v.owner_id = auth.uid())
  )
);

-- =====================================================================
-- SUBSCRIPTIONS
-- =====================================================================
CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'free',
  status text NOT NULL DEFAULT 'active',
  started_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  provider_reference text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owners_select_subscriptions" ON subscriptions;
CREATE POLICY "owners_select_subscriptions"
ON subscriptions FOR SELECT
TO authenticated
USING (
  EXISTS (SELECT 1 FROM vendors WHERE vendors.id = subscriptions.vendor_id AND vendors.owner_id = auth.uid())
);

-- =====================================================================
-- EVENTS
-- =====================================================================
CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id uuid REFERENCES universities(id),
  organizer_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  slug text NOT NULL,
  description text,
  start_time timestamptz,
  end_time timestamptz,
  location text,
  is_virtual boolean NOT NULL DEFAULT false,
  cover_image_url text,
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_select_published_events" ON events;
CREATE POLICY "public_select_published_events"
ON events FOR SELECT
TO anon, authenticated
USING (is_published = true);

DROP POLICY IF EXISTS "organizers_insert_events" ON events;
CREATE POLICY "organizers_insert_events"
ON events FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = organizer_id);

DROP POLICY IF EXISTS "organizers_update_events" ON events;
CREATE POLICY "organizers_update_events"
ON events FOR UPDATE
TO authenticated
USING (auth.uid() = organizer_id)
WITH CHECK (auth.uid() = organizer_id);

DROP POLICY IF EXISTS "organizers_delete_events" ON events;
CREATE POLICY "organizers_delete_events"
ON events FOR DELETE
TO authenticated
USING (auth.uid() = organizer_id);

-- =====================================================================
-- REVIEWS
-- =====================================================================
CREATE TABLE IF NOT EXISTS reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reviewer_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  vendor_id uuid REFERENCES vendors(id),
  product_id uuid REFERENCES products(id),
  event_id uuid REFERENCES events(id),
  rating int NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text,
  is_approved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_select_approved_reviews" ON reviews;
CREATE POLICY "public_select_approved_reviews"
ON reviews FOR SELECT
TO anon, authenticated
USING (is_approved = true);

DROP POLICY IF EXISTS "reviewers_insert_reviews" ON reviews;
CREATE POLICY "reviewers_insert_reviews"
ON reviews FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = reviewer_id);

DROP POLICY IF EXISTS "reviewers_update_reviews" ON reviews;
CREATE POLICY "reviewers_update_reviews"
ON reviews FOR UPDATE
TO authenticated
USING (auth.uid() = reviewer_id)
WITH CHECK (auth.uid() = reviewer_id);

DROP POLICY IF EXISTS "reviewers_delete_reviews" ON reviews;
CREATE POLICY "reviewers_delete_reviews"
ON reviews FOR DELETE
TO authenticated
USING (auth.uid() = reviewer_id);

DROP POLICY IF EXISTS "moderators_read_all_reviews" ON reviews;
CREATE POLICY "moderators_read_all_reviews"
ON reviews FOR SELECT
TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

-- =====================================================================
-- MESSAGES
-- =====================================================================
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_own_messages" ON messages;
CREATE POLICY "users_select_own_messages"
ON messages FOR SELECT
TO authenticated
USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

DROP POLICY IF EXISTS "users_insert_own_messages" ON messages;
CREATE POLICY "users_insert_own_messages"
ON messages FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = sender_id);

DROP POLICY IF EXISTS "recipients_update_messages" ON messages;
CREATE POLICY "recipients_update_messages"
ON messages FOR UPDATE
TO authenticated
USING (auth.uid() = recipient_id)
WITH CHECK (auth.uid() = recipient_id);

DROP POLICY IF EXISTS "senders_delete_messages" ON messages;
CREATE POLICY "senders_delete_messages"
ON messages FOR DELETE
TO authenticated
USING (auth.uid() = sender_id);

-- =====================================================================
-- NOTIFICATIONS
-- =====================================================================
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  type text,
  title text,
  body text,
  link text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_own_notifications" ON notifications;
CREATE POLICY "users_select_own_notifications"
ON notifications FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_update_own_notifications" ON notifications;
CREATE POLICY "users_update_own_notifications"
ON notifications FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_delete_own_notifications" ON notifications;
CREATE POLICY "users_delete_own_notifications"
ON notifications FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- =====================================================================
-- ADVERTISEMENTS
-- =====================================================================
CREATE TABLE IF NOT EXISTS advertisements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid REFERENCES vendors(id),
  university_id uuid REFERENCES universities(id),
  title text,
  image_url text,
  target_url text,
  placement text,
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE advertisements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_select_active_ads" ON advertisements;
CREATE POLICY "public_select_active_ads"
ON advertisements FOR SELECT
TO anon, authenticated
USING (is_active = true);

DROP POLICY IF EXISTS "owners_insert_ads" ON advertisements;
CREATE POLICY "owners_insert_ads"
ON advertisements FOR INSERT
TO authenticated
WITH CHECK (
  advertisements.vendor_id IS NULL OR
  EXISTS (SELECT 1 FROM vendors WHERE vendors.id = advertisements.vendor_id AND vendors.owner_id = auth.uid())
);

DROP POLICY IF EXISTS "owners_update_ads" ON advertisements;
CREATE POLICY "owners_update_ads"
ON advertisements FOR UPDATE
TO authenticated
USING (
  advertisements.vendor_id IS NULL OR
  EXISTS (SELECT 1 FROM vendors WHERE vendors.id = advertisements.vendor_id AND vendors.owner_id = auth.uid())
)
WITH CHECK (
  advertisements.vendor_id IS NULL OR
  EXISTS (SELECT 1 FROM vendors WHERE vendors.id = advertisements.vendor_id AND vendors.owner_id = auth.uid())
);

-- =====================================================================
-- LOCATIONS
-- =====================================================================
CREATE TABLE IF NOT EXISTS locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id uuid REFERENCES universities(id),
  owner_type text,
  owner_id uuid,
  label text,
  address_line text,
  city text,
  region text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_select_locations" ON locations;
CREATE POLICY "public_select_locations"
ON locations FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "users_insert_locations" ON locations;
CREATE POLICY "users_insert_locations"
ON locations FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "users_update_locations" ON locations;
CREATE POLICY "users_update_locations"
ON locations FOR UPDATE
TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- =====================================================================
-- REPORTS
-- =====================================================================
CREATE TABLE IF NOT EXISTS reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  target_type text,
  target_id uuid,
  reason text,
  status text NOT NULL DEFAULT 'open',
  moderator_id uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reporters_select_own_reports" ON reports;
CREATE POLICY "reporters_select_own_reports"
ON reports FOR SELECT
TO authenticated
USING (auth.uid() = reporter_id OR auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "users_insert_reports" ON reports;
CREATE POLICY "users_insert_reports"
ON reports FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "moderators_update_reports" ON reports;
CREATE POLICY "moderators_update_reports"
ON reports FOR UPDATE
TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'))
WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

-- =====================================================================
-- INDEXES
-- =====================================================================
CREATE INDEX IF NOT EXISTS idx_universities_slug ON universities(slug);
CREATE INDEX IF NOT EXISTS idx_universities_enabled ON universities(is_enabled);
CREATE INDEX IF NOT EXISTS idx_profiles_university ON profiles(university_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role_id);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_student_profiles_university ON student_profiles(university_id);
CREATE INDEX IF NOT EXISTS idx_student_profiles_user ON student_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_vendors_university ON vendors(university_id);
CREATE INDEX IF NOT EXISTS idx_vendors_owner ON vendors(owner_id);
CREATE INDEX IF NOT EXISTS idx_vendors_slug ON vendors(business_slug);
CREATE INDEX IF NOT EXISTS idx_businesses_vendor ON businesses(vendor_id);
CREATE INDEX IF NOT EXISTS idx_businesses_university ON businesses(university_id);
CREATE INDEX IF NOT EXISTS idx_businesses_slug ON businesses(slug);
CREATE INDEX IF NOT EXISTS idx_products_business ON products(business_id);
CREATE INDEX IF NOT EXISTS idx_products_university ON products(university_id);
CREATE INDEX IF NOT EXISTS idx_services_business ON services(business_id);
CREATE INDEX IF NOT EXISTS idx_services_university ON services(university_id);
CREATE INDEX IF NOT EXISTS idx_orders_university ON orders(university_id);
CREATE INDEX IF NOT EXISTS idx_orders_buyer ON orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_orders_vendor ON orders(vendor_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_reference ON payments(provider_reference);
CREATE INDEX IF NOT EXISTS idx_subscriptions_vendor ON subscriptions(vendor_id);
CREATE INDEX IF NOT EXISTS idx_events_university ON events(university_id);
CREATE INDEX IF NOT EXISTS idx_events_organizer ON events(organizer_id);
CREATE INDEX IF NOT EXISTS idx_events_slug ON events(slug);
CREATE INDEX IF NOT EXISTS idx_reviews_vendor ON reviews(vendor_id);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewer ON reviews(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_ads_university ON advertisements(university_id);
CREATE INDEX IF NOT EXISTS idx_ads_vendor ON advertisements(vendor_id);
CREATE INDEX IF NOT EXISTS idx_locations_university ON locations(university_id);
CREATE INDEX IF NOT EXISTS idx_locations_owner ON locations(owner_type, owner_id);
CREATE INDEX IF NOT EXISTS idx_reports_reporter ON reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_reports_target ON reports(target_type, target_id);

-- =====================================================================
-- SEED: Enabled university — University of Energy and Natural Resources
-- =====================================================================
INSERT INTO universities (name, short_name, slug, city, region, country, description, is_enabled)
VALUES (
  'University of Energy and Natural Resources',
  'UENR',
  'uenr',
  'Sunyani',
  'Bono',
  'Ghana',
  'A public university in Sunyani focused on energy, natural resources, and technology.',
  true
)
ON CONFLICT (slug) DO NOTHING;

-- =====================================================================
-- updated_at triggers
-- =====================================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'universities','profiles','student_profiles','vendors','businesses',
      'products','services','orders','events'
    ])
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%s_updated ON %s;
       CREATE TRIGGER trg_%s_updated BEFORE UPDATE ON %s
       FOR EACH ROW EXECUTE FUNCTION set_updated_at();',
      t, t, t, t
    );
  END LOOP;
END $$;

-- =====================================================================
-- Auto-create a profile when a new auth user signs up.
-- Reads role from raw_app_meta_data (set during signup), defaulting to student.
-- =====================================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role_id, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      (SELECT id FROM public.user_roles WHERE name = NEW.raw_app_meta_data ->> 'role'),
      2
    ),
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'avatar_url'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();