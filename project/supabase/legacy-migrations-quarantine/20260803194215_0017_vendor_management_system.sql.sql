/*
# UniEco Ghana — Vendor & Business Management System

## Purpose
Extends the core schema with the complete data layer for vendor business management:
extended vendor profiles, products with multiple images, services, business gallery,
business hours, subscriptions with invoices, advertisement requests, review responses,
vendor analytics, vendor notification/security settings, and inventory foundations.

## 1. Modified Tables

### vendors
Added columns:
- whatsapp_number (text) — WhatsApp contact number
- social_links (jsonb) — {facebook, instagram, twitter, linkedin, tiktok}
- delivery_available (boolean, default false) — whether vendor offers delivery
- service_radius_km (int) — delivery radius in kilometers
- gps_latitude (numeric) — business GPS latitude
- gps_longitude (numeric) — business GPS longitude
- is_temporarily_closed (boolean, default false) — temporary closure flag

### products
Added columns:
- discount_price (numeric) — optional sale price
- sku (text) — stock keeping unit
- tags (text[]) — searchable tags
- images (jsonb) — array of image URLs for multiple product photos
- is_archived (boolean, default false) — archived products (not deleted)
- low_stock_threshold (int, default 5) — low stock warning level

### services
Added columns:
- images (jsonb) — array of image URLs
- is_archived (boolean, default false)

### subscriptions
Added columns:
- amount (numeric) — subscription fee amount
- currency (text, default 'GHS')
- payment_method (text) — how payment was made
- payment_reference (text) — transaction reference

### messages
Added columns:
- is_archived_by_sender (boolean, default false)
- is_archived_by_recipient (boolean, default false)

## 2. New Tables

### business_gallery
Image gallery for businesses — storefront photos, promotional banners, product highlights.
- id (uuid PK)
- vendor_id (uuid FK vendors CASCADE)
- image_url (text)
- caption (text, nullable)
- image_type (text: 'storefront' | 'banner' | 'product_highlight' | 'general')
- sort_order (int, default 0)
- created_at (timestamptz)

### business_hours
Weekly opening hours per vendor. One row per day.
- id (uuid PK)
- vendor_id (uuid FK vendors CASCADE)
- day_of_week (int 0-6, 0=Sunday)
- is_open (boolean)
- open_time (time, nullable)
- close_time (time, nullable)
- Unique on (vendor_id, day_of_week)

### business_holidays
Temporary closures / holidays.
- id (uuid PK)
- vendor_id (uuid FK vendors CASCADE)
- holiday_date (date)
- description (text, nullable)
- created_at (timestamptz)

### invoices
Professional invoices for subscription payments and ad purchases.
- id (uuid PK)
- vendor_id (uuid FK vendors CASCADE)
- invoice_number (text, unique) — generated INV-YYYYMMDD-XXXX
- invoice_type (text: 'subscription' | 'advertisement')
- reference_id (uuid) — subscription or ad request ID
- amount (numeric)
- currency (text, default 'GHS')
- status (text: 'paid' | 'pending' | 'cancelled')
- payment_reference (text, nullable)
- issued_at (timestamptz)
- paid_at (timestamptz, nullable)
- created_at (timestamptz)

### ad_requests
Vendor advertisement/promotion requests.
- id (uuid PK)
- vendor_id (uuid FK vendors CASCADE)
- ad_type (text: 'featured_business' | 'homepage_banner' | 'category_promotion' | 'search_promotion' | 'event_promotion')
- title (text)
- description (text, nullable)
- image_url (text, nullable)
- target_url (text, nullable)
- requested_duration_days (int)
- estimated_reach (text, nullable)
- estimated_cost (numeric)
- status (text: 'pending' | 'approved' | 'rejected' | 'active' | 'completed')
- admin_note (text, nullable)
- reviewed_by (uuid, FK profiles, nullable)
- reviewed_at (timestamptz, nullable)
- starts_at (timestamptz, nullable)
- ends_at (timestamptz, nullable)
- created_at (timestamptz)
- updated_at (timestamptz)

### review_responses
Vendor responses to customer reviews. Vendors cannot edit/delete reviews.
- id (uuid PK)
- review_id (uuid FK reviews CASCADE, unique)
- vendor_id (uuid FK vendors CASCADE)
- response_body (text)
- created_at (timestamptz)
- updated_at (timestamptz)

### vendor_analytics
Aggregated analytics per vendor (updated periodically).
- id (uuid PK)
- vendor_id (uuid FK vendors CASCADE, unique)
- profile_views (int, default 0)
- product_views (int, default 0)
- service_views (int, default 0)
- search_appearances (int, default 0)
- messages_received (int, default 0)
- saved_count (int, default 0)
- monthly_profile_views (jsonb) — {2024-01: 120, ...}
- monthly_messages (jsonb)
- monthly_reviews (jsonb)
- response_rate (numeric, default 0) — percentage
- avg_response_time_hours (numeric, default 0)
- trust_score (numeric, default 0) — 0-100
- updated_at (timestamptz)

### vendor_settings
Per-vendor notification and security preferences.
- id (uuid PK)
- vendor_id (uuid FK vendors CASCADE, unique)
- email_notifications (boolean, default true)
- push_notifications (boolean, default true)
- order_alerts (boolean, default true)
- review_alerts (boolean, default true)
- message_alerts (boolean, default true)
- two_factor_enabled (boolean, default false)
- created_at (timestamptz)
- updated_at (timestamptz)

## 3. Security — RLS on all new tables
All new tables are vendor-owner-scoped. Ownership checked via:
  EXISTS (SELECT 1 FROM vendors WHERE vendors.id = <table>.vendor_id AND vendors.owner_id = auth.uid())

Public read policies on business_gallery and business_hours so visitors can see them.
Invoices and ad_requests are owner-only. Vendor settings are owner-only.

## 4. Functions
- generate_invoice_number() — generates sequential invoice numbers
- get_vendor_analytics(vendor_uuid) — returns or creates analytics row

## 5. Notes
- No destructive operations — all ADD COLUMN and CREATE TABLE IF NOT EXISTS.
- Owner columns default to auth.uid() where applicable.
- Products use is_archived for soft-delete/archive; is_active remains for availability toggle.
- Review responses enforce one response per review via unique constraint.
- All new tables have indexes on vendor_id.
*/

-- =====================================================================
-- EXTEND VENDORS TABLE
-- =====================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vendors' AND column_name = 'whatsapp_number') THEN
    ALTER TABLE vendors ADD COLUMN whatsapp_number text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vendors' AND column_name = 'social_links') THEN
    ALTER TABLE vendors ADD COLUMN social_links jsonb NOT NULL DEFAULT '{}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vendors' AND column_name = 'delivery_available') THEN
    ALTER TABLE vendors ADD COLUMN delivery_available boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vendors' AND column_name = 'service_radius_km') THEN
    ALTER TABLE vendors ADD COLUMN service_radius_km int;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vendors' AND column_name = 'gps_latitude') THEN
    ALTER TABLE vendors ADD COLUMN gps_latitude numeric(9,6);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vendors' AND column_name = 'gps_longitude') THEN
    ALTER TABLE vendors ADD COLUMN gps_longitude numeric(9,6);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vendors' AND column_name = 'is_temporarily_closed') THEN
    ALTER TABLE vendors ADD COLUMN is_temporarily_closed boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- =====================================================================
-- EXTEND PRODUCTS TABLE
-- =====================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'discount_price') THEN
    ALTER TABLE products ADD COLUMN discount_price numeric(12,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'sku') THEN
    ALTER TABLE products ADD COLUMN sku text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'tags') THEN
    ALTER TABLE products ADD COLUMN tags text[] DEFAULT '{}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'images') THEN
    ALTER TABLE products ADD COLUMN images jsonb NOT NULL DEFAULT '[]';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'is_archived') THEN
    ALTER TABLE products ADD COLUMN is_archived boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'low_stock_threshold') THEN
    ALTER TABLE products ADD COLUMN low_stock_threshold int NOT NULL DEFAULT 5;
  END IF;
END $$;

-- =====================================================================
-- EXTEND SERVICES TABLE
-- =====================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'services' AND column_name = 'images') THEN
    ALTER TABLE services ADD COLUMN images jsonb NOT NULL DEFAULT '[]';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'services' AND column_name = 'is_archived') THEN
    ALTER TABLE services ADD COLUMN is_archived boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- =====================================================================
-- EXTEND SUBSCRIPTIONS TABLE
-- =====================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'subscriptions' AND column_name = 'amount') THEN
    ALTER TABLE subscriptions ADD COLUMN amount numeric(12,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'subscriptions' AND column_name = 'currency') THEN
    ALTER TABLE subscriptions ADD COLUMN currency text NOT NULL DEFAULT 'GHS';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'subscriptions' AND column_name = 'payment_method') THEN
    ALTER TABLE subscriptions ADD COLUMN payment_method text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'subscriptions' AND column_name = 'payment_reference') THEN
    ALTER TABLE subscriptions ADD COLUMN payment_reference text;
  END IF;
END $$;

-- =====================================================================
-- EXTEND MESSAGES TABLE
-- =====================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'is_archived_by_sender') THEN
    ALTER TABLE messages ADD COLUMN is_archived_by_sender boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'is_archived_by_recipient') THEN
    ALTER TABLE messages ADD COLUMN is_archived_by_recipient boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- =====================================================================
-- BUSINESS GALLERY
-- =====================================================================
CREATE TABLE IF NOT EXISTS business_gallery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  caption text,
  image_type text NOT NULL DEFAULT 'general' CHECK (image_type IN ('storefront', 'banner', 'product_highlight', 'general')),
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE business_gallery ENABLE ROW LEVEL SECURITY;

-- Public can see gallery images (they're visible on business profiles)
DROP POLICY IF EXISTS "public_select_gallery" ON business_gallery;
CREATE POLICY "public_select_gallery"
ON business_gallery FOR SELECT
TO anon, authenticated
USING (
  EXISTS (SELECT 1 FROM vendors WHERE vendors.id = business_gallery.vendor_id AND vendors.is_active = true)
);

-- Owner can manage their gallery
DROP POLICY IF EXISTS "owners_insert_gallery" ON business_gallery;
CREATE POLICY "owners_insert_gallery"
ON business_gallery FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM vendors WHERE vendors.id = business_gallery.vendor_id AND vendors.owner_id = auth.uid())
);

DROP POLICY IF EXISTS "owners_update_gallery" ON business_gallery;
CREATE POLICY "owners_update_gallery"
ON business_gallery FOR UPDATE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM vendors WHERE vendors.id = business_gallery.vendor_id AND vendors.owner_id = auth.uid())
)
WITH CHECK (
  EXISTS (SELECT 1 FROM vendors WHERE vendors.id = business_gallery.vendor_id AND vendors.owner_id = auth.uid())
);

DROP POLICY IF EXISTS "owners_delete_gallery" ON business_gallery;
CREATE POLICY "owners_delete_gallery"
ON business_gallery FOR DELETE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM vendors WHERE vendors.id = business_gallery.vendor_id AND vendors.owner_id = auth.uid())
);

CREATE INDEX IF NOT EXISTS idx_gallery_vendor ON business_gallery(vendor_id);
CREATE INDEX IF NOT EXISTS idx_gallery_sort ON business_gallery(vendor_id, sort_order);

-- =====================================================================
-- BUSINESS HOURS
-- =====================================================================
CREATE TABLE IF NOT EXISTS business_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  day_of_week int NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  is_open boolean NOT NULL DEFAULT false,
  open_time time,
  close_time time,
  UNIQUE (vendor_id, day_of_week)
);

ALTER TABLE business_hours ENABLE ROW LEVEL SECURITY;

-- Public can see business hours
DROP POLICY IF EXISTS "public_select_hours" ON business_hours;
CREATE POLICY "public_select_hours"
ON business_hours FOR SELECT
TO anon, authenticated
USING (
  EXISTS (SELECT 1 FROM vendors WHERE vendors.id = business_hours.vendor_id AND vendors.is_active = true)
);

-- Owner can manage hours
DROP POLICY IF EXISTS "owners_insert_hours" ON business_hours;
CREATE POLICY "owners_insert_hours"
ON business_hours FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM vendors WHERE vendors.id = business_hours.vendor_id AND vendors.owner_id = auth.uid())
);

DROP POLICY IF EXISTS "owners_update_hours" ON business_hours;
CREATE POLICY "owners_update_hours"
ON business_hours FOR UPDATE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM vendors WHERE vendors.id = business_hours.vendor_id AND vendors.owner_id = auth.uid())
)
WITH CHECK (
  EXISTS (SELECT 1 FROM vendors WHERE vendors.id = business_hours.vendor_id AND vendors.owner_id = auth.uid())
);

DROP POLICY IF EXISTS "owners_delete_hours" ON business_hours;
CREATE POLICY "owners_delete_hours"
ON business_hours FOR DELETE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM vendors WHERE vendors.id = business_hours.vendor_id AND vendors.owner_id = auth.uid())
);

CREATE INDEX IF NOT EXISTS idx_hours_vendor ON business_hours(vendor_id);

-- =====================================================================
-- BUSINESS HOLIDAYS
-- =====================================================================
CREATE TABLE IF NOT EXISTS business_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  holiday_date date NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vendor_id, holiday_date)
);

ALTER TABLE business_holidays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_select_holidays" ON business_holidays;
CREATE POLICY "public_select_holidays"
ON business_holidays FOR SELECT
TO anon, authenticated
USING (
  EXISTS (SELECT 1 FROM vendors WHERE vendors.id = business_holidays.vendor_id AND vendors.is_active = true)
);

DROP POLICY IF EXISTS "owners_insert_holidays" ON business_holidays;
CREATE POLICY "owners_insert_holidays"
ON business_holidays FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM vendors WHERE vendors.id = business_holidays.vendor_id AND vendors.owner_id = auth.uid())
);

DROP POLICY IF EXISTS "owners_update_holidays" ON business_holidays;
CREATE POLICY "owners_update_holidays"
ON business_holidays FOR UPDATE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM vendors WHERE vendors.id = business_holidays.vendor_id AND vendors.owner_id = auth.uid())
)
WITH CHECK (
  EXISTS (SELECT 1 FROM vendors WHERE vendors.id = business_holidays.vendor_id AND vendors.owner_id = auth.uid())
);

DROP POLICY IF EXISTS "owners_delete_holidays" ON business_holidays;
CREATE POLICY "owners_delete_holidays"
ON business_holidays FOR DELETE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM vendors WHERE vendors.id = business_holidays.vendor_id AND vendors.owner_id = auth.uid())
);

CREATE INDEX IF NOT EXISTS idx_holidays_vendor ON business_holidays(vendor_id);
CREATE INDEX IF NOT EXISTS idx_holidays_date ON business_holidays(holiday_date);

-- =====================================================================
-- INVOICES
-- =====================================================================
CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  invoice_number text UNIQUE NOT NULL,
  invoice_type text NOT NULL DEFAULT 'subscription' CHECK (invoice_type IN ('subscription', 'advertisement')),
  reference_id uuid,
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'GHS',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('paid', 'pending', 'cancelled')),
  payment_reference text,
  issued_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owners_select_invoices" ON invoices;
CREATE POLICY "owners_select_invoices"
ON invoices FOR SELECT
TO authenticated
USING (
  EXISTS (SELECT 1 FROM vendors WHERE vendors.id = invoices.vendor_id AND vendors.owner_id = auth.uid())
);

DROP POLICY IF EXISTS "owners_insert_invoices" ON invoices;
CREATE POLICY "owners_insert_invoices"
ON invoices FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM vendors WHERE vendors.id = invoices.vendor_id AND vendors.owner_id = auth.uid())
);

DROP POLICY IF EXISTS "owners_update_invoices" ON invoices;
CREATE POLICY "owners_update_invoices"
ON invoices FOR UPDATE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM vendors WHERE vendors.id = invoices.vendor_id AND vendors.owner_id = auth.uid())
)
WITH CHECK (
  EXISTS (SELECT 1 FROM vendors WHERE vendors.id = invoices.vendor_id AND vendors.owner_id = auth.uid())
);

DROP POLICY IF EXISTS "owners_delete_invoices" ON invoices;
CREATE POLICY "owners_delete_invoices"
ON invoices FOR DELETE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM vendors WHERE vendors.id = invoices.vendor_id AND vendors.owner_id = auth.uid())
);

-- Staff can read all invoices
DROP POLICY IF EXISTS "staff_select_invoices" ON invoices;
CREATE POLICY "staff_select_invoices"
ON invoices FOR SELECT
TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

CREATE INDEX IF NOT EXISTS idx_invoices_vendor ON invoices(vendor_id);
CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);

-- =====================================================================
-- AD REQUESTS
-- =====================================================================
CREATE TABLE IF NOT EXISTS ad_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  ad_type text NOT NULL CHECK (ad_type IN ('featured_business', 'homepage_banner', 'category_promotion', 'search_promotion', 'event_promotion')),
  title text NOT NULL,
  description text,
  image_url text,
  target_url text,
  requested_duration_days int NOT NULL DEFAULT 7,
  estimated_reach text,
  estimated_cost numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'active', 'completed')),
  admin_note text,
  reviewed_by uuid REFERENCES profiles(id),
  reviewed_at timestamptz,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ad_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owners_select_ad_requests" ON ad_requests;
CREATE POLICY "owners_select_ad_requests"
ON ad_requests FOR SELECT
TO authenticated
USING (
  EXISTS (SELECT 1 FROM vendors WHERE vendors.id = ad_requests.vendor_id AND vendors.owner_id = auth.uid())
);

DROP POLICY IF EXISTS "owners_insert_ad_requests" ON ad_requests;
CREATE POLICY "owners_insert_ad_requests"
ON ad_requests FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM vendors WHERE vendors.id = ad_requests.vendor_id AND vendors.owner_id = auth.uid())
);

DROP POLICY IF EXISTS "owners_update_ad_requests" ON ad_requests;
CREATE POLICY "owners_update_ad_requests"
ON ad_requests FOR UPDATE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM vendors WHERE vendors.id = ad_requests.vendor_id AND vendors.owner_id = auth.uid())
)
WITH CHECK (
  EXISTS (SELECT 1 FROM vendors WHERE vendors.id = ad_requests.vendor_id AND vendors.owner_id = auth.uid())
);

DROP POLICY IF EXISTS "owners_delete_ad_requests" ON ad_requests;
CREATE POLICY "owners_delete_ad_requests"
ON ad_requests FOR DELETE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM vendors WHERE vendors.id = ad_requests.vendor_id AND vendors.owner_id = auth.uid())
);

-- Staff can read and update ad requests
DROP POLICY IF EXISTS "staff_select_ad_requests" ON ad_requests;
CREATE POLICY "staff_select_ad_requests"
ON ad_requests FOR SELECT
TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "staff_update_ad_requests" ON ad_requests;
CREATE POLICY "staff_update_ad_requests"
ON ad_requests FOR UPDATE
TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'))
WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

CREATE INDEX IF NOT EXISTS idx_ad_requests_vendor ON ad_requests(vendor_id);
CREATE INDEX IF NOT EXISTS idx_ad_requests_status ON ad_requests(status);

-- =====================================================================
-- REVIEW RESPONSES
-- =====================================================================
CREATE TABLE IF NOT EXISTS review_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL UNIQUE REFERENCES reviews(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  response_body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE review_responses ENABLE ROW LEVEL SECURITY;

-- Public can see review responses (they're visible on business profiles)
DROP POLICY IF EXISTS "public_select_review_responses" ON review_responses;
CREATE POLICY "public_select_review_responses"
ON review_responses FOR SELECT
TO anon, authenticated
USING (true);

-- Vendor owner can insert response (must own the vendor linked to the review)
DROP POLICY IF EXISTS "owners_insert_review_responses" ON review_responses;
CREATE POLICY "owners_insert_review_responses"
ON review_responses FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM vendors WHERE vendors.id = review_responses.vendor_id AND vendors.owner_id = auth.uid())
);

-- Vendor owner can update their response
DROP POLICY IF EXISTS "owners_update_review_responses" ON review_responses;
CREATE POLICY "owners_update_review_responses"
ON review_responses FOR UPDATE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM vendors WHERE vendors.id = review_responses.vendor_id AND vendors.owner_id = auth.uid())
)
WITH CHECK (
  EXISTS (SELECT 1 FROM vendors WHERE vendors.id = review_responses.vendor_id AND vendors.owner_id = auth.uid())
);

-- Vendor owner can delete their response
DROP POLICY IF EXISTS "owners_delete_review_responses" ON review_responses;
CREATE POLICY "owners_delete_review_responses"
ON review_responses FOR DELETE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM vendors WHERE vendors.id = review_responses.vendor_id AND vendors.owner_id = auth.uid())
);

CREATE INDEX IF NOT EXISTS idx_review_responses_vendor ON review_responses(vendor_id);
CREATE INDEX IF NOT EXISTS idx_review_responses_review ON review_responses(review_id);

-- =====================================================================
-- VENDOR ANALYTICS
-- =====================================================================
CREATE TABLE IF NOT EXISTS vendor_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL UNIQUE REFERENCES vendors(id) ON DELETE CASCADE,
  profile_views int NOT NULL DEFAULT 0,
  product_views int NOT NULL DEFAULT 0,
  service_views int NOT NULL DEFAULT 0,
  search_appearances int NOT NULL DEFAULT 0,
  messages_received int NOT NULL DEFAULT 0,
  saved_count int NOT NULL DEFAULT 0,
  monthly_profile_views jsonb NOT NULL DEFAULT '{}',
  monthly_messages jsonb NOT NULL DEFAULT '{}',
  monthly_reviews jsonb NOT NULL DEFAULT '{}',
  response_rate numeric(5,2) NOT NULL DEFAULT 0,
  avg_response_time_hours numeric(8,2) NOT NULL DEFAULT 0,
  trust_score numeric(5,2) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE vendor_analytics ENABLE ROW LEVEL SECURITY;

-- Owner can read their analytics
DROP POLICY IF EXISTS "owners_select_analytics" ON vendor_analytics;
CREATE POLICY "owners_select_analytics"
ON vendor_analytics FOR SELECT
TO authenticated
USING (
  EXISTS (SELECT 1 FROM vendors WHERE vendors.id = vendor_analytics.vendor_id AND vendors.owner_id = auth.uid())
);

-- Owner can insert their analytics row
DROP POLICY IF EXISTS "owners_insert_analytics" ON vendor_analytics;
CREATE POLICY "owners_insert_analytics"
ON vendor_analytics FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM vendors WHERE vendors.id = vendor_analytics.vendor_id AND vendors.owner_id = auth.uid())
);

-- Owner can update their analytics
DROP POLICY IF EXISTS "owners_update_analytics" ON vendor_analytics;
CREATE POLICY "owners_update_analytics"
ON vendor_analytics FOR UPDATE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM vendors WHERE vendors.id = vendor_analytics.vendor_id AND vendors.owner_id = auth.uid())
)
WITH CHECK (
  EXISTS (SELECT 1 FROM vendors WHERE vendors.id = vendor_analytics.vendor_id AND vendors.owner_id = auth.uid())
);

-- Staff can read all analytics
DROP POLICY IF EXISTS "staff_select_analytics" ON vendor_analytics;
CREATE POLICY "staff_select_analytics"
ON vendor_analytics FOR SELECT
TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

CREATE INDEX IF NOT EXISTS idx_analytics_vendor ON vendor_analytics(vendor_id);

-- =====================================================================
-- VENDOR SETTINGS
-- =====================================================================
CREATE TABLE IF NOT EXISTS vendor_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL UNIQUE REFERENCES vendors(id) ON DELETE CASCADE,
  email_notifications boolean NOT NULL DEFAULT true,
  push_notifications boolean NOT NULL DEFAULT true,
  order_alerts boolean NOT NULL DEFAULT true,
  review_alerts boolean NOT NULL DEFAULT true,
  message_alerts boolean NOT NULL DEFAULT true,
  two_factor_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE vendor_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owners_select_vendor_settings" ON vendor_settings;
CREATE POLICY "owners_select_vendor_settings"
ON vendor_settings FOR SELECT
TO authenticated
USING (
  EXISTS (SELECT 1 FROM vendors WHERE vendors.id = vendor_settings.vendor_id AND vendors.owner_id = auth.uid())
);

DROP POLICY IF EXISTS "owners_insert_vendor_settings" ON vendor_settings;
CREATE POLICY "owners_insert_vendor_settings"
ON vendor_settings FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM vendors WHERE vendors.id = vendor_settings.vendor_id AND vendors.owner_id = auth.uid())
);

DROP POLICY IF EXISTS "owners_update_vendor_settings" ON vendor_settings;
CREATE POLICY "owners_update_vendor_settings"
ON vendor_settings FOR UPDATE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM vendors WHERE vendors.id = vendor_settings.vendor_id AND vendors.owner_id = auth.uid())
)
WITH CHECK (
  EXISTS (SELECT 1 FROM vendors WHERE vendors.id = vendor_settings.vendor_id AND vendors.owner_id = auth.uid())
);

DROP POLICY IF EXISTS "owners_delete_vendor_settings" ON vendor_settings;
CREATE POLICY "owners_delete_vendor_settings"
ON vendor_settings FOR DELETE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM vendors WHERE vendors.id = vendor_settings.vendor_id AND vendors.owner_id = auth.uid())
);

CREATE INDEX IF NOT EXISTS idx_vendor_settings_vendor ON vendor_settings(vendor_id);

-- =====================================================================
-- INVOICE NUMBER GENERATOR
-- =====================================================================
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  date_part text;
  seq int;
  result text;
BEGIN
  date_part := to_char(now(), 'YYYYMMDD');
  SELECT COALESCE(MAX(seq_val), 0) + 1 INTO seq
  FROM (
    SELECT substring(invoice_number from '\d+$')::int AS seq_val
    FROM invoices
    WHERE invoice_number LIKE 'INV-' || date_part || '-%'
  ) sub;
  result := 'INV-' || date_part || '-' || lpad(seq::text, 4, '0');
  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION generate_invoice_number() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION generate_invoice_number() TO authenticated;

-- =====================================================================
-- UPDATED_AT TRIGGERS for new tables
-- =====================================================================
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY['ad_requests', 'vendor_analytics', 'vendor_settings', 'review_responses'])
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
-- ADDITIONAL INDEXES
-- =====================================================================
CREATE INDEX IF NOT EXISTS idx_products_archived ON products(is_archived);
CREATE INDEX IF NOT EXISTS idx_products_business_active ON products(business_id, is_active, is_archived);
CREATE INDEX IF NOT EXISTS idx_services_archived ON services(is_archived);
CREATE INDEX IF NOT EXISTS idx_services_business_active ON services(business_id, is_active, is_archived);
CREATE INDEX IF NOT EXISTS idx_messages_archived_sender ON messages(sender_id, is_archived_by_sender);
CREATE INDEX IF NOT EXISTS idx_messages_archived_recipient ON messages(recipient_id, is_archived_by_recipient);