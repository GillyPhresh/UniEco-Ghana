/*
# UniEco Ghana — Marketplace, Orders & Transactions System

## Purpose
Builds the complete data layer for the marketplace: shopping carts, extended orders,
order status history, service bookings, receipts, coupons, wishlists, and order messages.
Extends existing orders/order_items tables with marketplace-specific columns.

## 1. Modified Tables

### orders
Added columns:
- order_number (text, unique) — human-readable order number ORD-YYYYMMDD-XXXX
- order_type (text) — 'product' | 'service' | 'mixed'
- delivery_method (text) — 'pickup' | 'delivery'
- delivery_address (jsonb) — {line1, city, region, landmark, instructions}
- delivery_fee (numeric, default 0) — delivery cost
- delivery_instructions (text) — notes for delivery
- estimated_completion (timestamptz) — expected ready/delivery time
- coupon_code (text) — applied coupon code
- coupon_discount (numeric, default 0) — discount amount from coupon
- accepted_at (timestamptz) — when vendor accepted
- completed_at (timestamptz) — when order completed
- cancelled_at (timestamptz) — when order cancelled
- cancellation_reason (text) — why cancelled
- vendor_notes (text) — vendor's notes on the order

### order_items
Added columns:
- unit_name (text) — snapshot of product/service name at time of order
- unit_image_url (text) — snapshot image URL
- item_name (text) — same as unit_name (for convenience queries)
- booking_date (date) — for service bookings, preferred date
- booking_time (time) — for service bookings, preferred time
- booking_notes (text) — notes for the booking
- booking_status (text) — 'pending' | 'confirmed' | 'rescheduled' | 'declined'
- rescheduled_to (timestamptz) — rescheduled date/time

## 2. New Tables

### carts
Shopping cart per user. One active cart per user.
- id (uuid PK)
- user_id (uuid FK profiles, unique)
- coupon_code (text, nullable)
- created_at, updated_at (timestamptz)

### cart_items
Items in a cart.
- id (uuid PK)
- cart_id (uuid FK carts CASCADE)
- product_id (uuid FK products, nullable)
- service_id (uuid FK services, nullable)
- quantity (int, default 1)
- save_for_later (boolean, default false)
- created_at (timestamptz)
- Unique on (cart_id, product_id) WHERE product_id IS NOT NULL
- Unique on (cart_id, service_id) WHERE service_id IS NOT NULL

### order_status_history
Audit trail of order status changes.
- id (uuid PK)
- order_id (uuid FK orders CASCADE)
- previous_status (text)
- new_status (text)
- changed_by (uuid FK profiles) — who made the change
- note (text) — optional note about the change
- created_at (timestamptz)

### receipts
Generated receipts for orders.
- id (uuid PK)
- order_id (uuid FK orders, unique)
- receipt_number (text, unique) — RCP-YYYYMMDD-XXXX
- generated_at (timestamptz)
- data (jsonb) — full receipt snapshot for archival

### coupons
Discount codes for the marketplace.
- id (uuid PK)
- code (text, unique, uppercase)
- description (text)
- discount_type (text) — 'percentage' | 'fixed'
- discount_value (numeric) — percentage (1-100) or fixed amount
- min_order_amount (numeric, default 0)
- max_discount_amount (numeric, nullable) — cap for percentage discounts
- student_only (boolean, default false)
- vendor_id (uuid, nullable) — vendor-specific coupon
- university_id (uuid, nullable) — university-specific
- usage_limit (int, nullable) — total uses allowed
- usage_count (int, default 0)
- per_user_limit (int, default 1)
- starts_at (timestamptz)
- ends_at (timestamptz)
- is_active (boolean, default true)
- created_at (timestamptz)

### coupon_redemptions
Tracks coupon usage per user.
- id (uuid PK)
- coupon_id (uuid FK coupons CASCADE)
- user_id (uuid FK profiles)
- order_id (uuid FK orders, nullable)
- redeemed_at (timestamptz)
- Unique on (coupon_id, user_id)

### wishlists
User wishlist items — extends saved_items for marketplace products/services.
- id (uuid PK)
- user_id (uuid FK profiles, default auth.uid())
- item_type (text) — 'product' | 'service'
- item_id (uuid)
- collection (text, default 'Favorites')
- created_at (timestamptz)
- Unique on (user_id, item_type, item_id)

### order_messages
Messages between buyer and vendor within an order context.
- id (uuid PK)
- order_id (uuid FK orders CASCADE)
- sender_id (uuid FK profiles)
- recipient_id (uuid FK profiles)
- body (text)
- is_read (boolean, default false)
- created_at (timestamptz)

## 3. Security — RLS

### carts / cart_items
- Owner-scoped: user can only access their own cart and cart items.
- Cart items scoped through cart ownership.

### orders
- Buyers can see/manage their own orders (auth.uid() = buyer_id).
- Vendors can see/manage orders for their business (EXISTS vendors WHERE owner_id = auth.uid()).
- Staff can read all orders.

### order_items
- Scoped through order ownership: buyer or vendor of the order.

### order_status_history
- Read: buyer or vendor of the order.
- Insert: buyer or vendor of the order.
- No update/delete — immutable audit trail.

### receipts
- Read: buyer or vendor of the order.
- Insert: buyer or vendor (auto-generated on completion).

### coupons
- Public read (active, within date range).
- Insert/update/delete: staff only.

### coupon_redemptions
- Owner-scoped: user sees their own redemptions.

### wishlists
- Owner-scoped: user manages their own wishlist.

### order_messages
- Sender and recipient can read.
- Sender can insert.
- Sender can update is_read on their own messages.

## 4. Functions
- generate_order_number() — sequential order numbers
- generate_receipt_number() — sequential receipt numbers

## 5. Indexes
- orders: buyer_id, vendor_id, status, order_number
- order_items: order_id, product_id, service_id
- order_status_history: order_id
- carts: user_id (unique)
- cart_items: cart_id
- receipts: order_id (unique), receipt_number
- coupons: code (unique), is_active
- coupon_redemptions: coupon_id, user_id
- wishlists: user_id, (user_id, item_type, item_id) unique
- order_messages: order_id, recipient_id+is_read

## 6. Notes
- No destructive operations — all ADD COLUMN and CREATE TABLE IF NOT EXISTS.
- Orders table already had RLS enabled in the core schema.
- We extend it with marketplace columns and add new policies.
- The existing saved_items table continues to work for businesses/events.
- Wishlists are marketplace-specific (products/services).
- Order status history is immutable — no UPDATE or DELETE policies.
*/

-- =====================================================================
-- EXTEND ORDERS TABLE
-- =====================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'order_number') THEN
    ALTER TABLE orders ADD COLUMN order_number text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'order_type') THEN
    ALTER TABLE orders ADD COLUMN order_type text NOT NULL DEFAULT 'product';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'delivery_method') THEN
    ALTER TABLE orders ADD COLUMN delivery_method text DEFAULT 'pickup';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'delivery_address') THEN
    ALTER TABLE orders ADD COLUMN delivery_address jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'delivery_fee') THEN
    ALTER TABLE orders ADD COLUMN delivery_fee numeric(12,2) NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'delivery_instructions') THEN
    ALTER TABLE orders ADD COLUMN delivery_instructions text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'estimated_completion') THEN
    ALTER TABLE orders ADD COLUMN estimated_completion timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'coupon_code') THEN
    ALTER TABLE orders ADD COLUMN coupon_code text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'coupon_discount') THEN
    ALTER TABLE orders ADD COLUMN coupon_discount numeric(12,2) NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'accepted_at') THEN
    ALTER TABLE orders ADD COLUMN accepted_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'completed_at') THEN
    ALTER TABLE orders ADD COLUMN completed_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'cancelled_at') THEN
    ALTER TABLE orders ADD COLUMN cancelled_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'cancellation_reason') THEN
    ALTER TABLE orders ADD COLUMN cancellation_reason text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'vendor_notes') THEN
    ALTER TABLE orders ADD COLUMN vendor_notes text;
  END IF;
END $$;

-- Add unique constraint on order_number if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_order_number_key') THEN
    ALTER TABLE orders ADD CONSTRAINT orders_order_number_key UNIQUE (order_number);
  END IF;
END $$;

-- Add check constraint for order_type
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_order_type_check') THEN
    ALTER TABLE orders ADD CONSTRAINT orders_order_type_check CHECK (order_type IN ('product', 'service', 'mixed'));
  END IF;
END $$;

-- Add check constraint for delivery_method
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_delivery_method_check') THEN
    ALTER TABLE orders ADD CONSTRAINT orders_delivery_method_check CHECK (delivery_method IN ('pickup', 'delivery'));
  END IF;
END $$;

-- =====================================================================
-- EXTEND ORDER_ITEMS TABLE
-- =====================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_items' AND column_name = 'unit_name') THEN
    ALTER TABLE order_items ADD COLUMN unit_name text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_items' AND column_name = 'unit_image_url') THEN
    ALTER TABLE order_items ADD COLUMN unit_image_url text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_items' AND column_name = 'item_name') THEN
    ALTER TABLE order_items ADD COLUMN item_name text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_items' AND column_name = 'booking_date') THEN
    ALTER TABLE order_items ADD COLUMN booking_date date;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_items' AND column_name = 'booking_time') THEN
    ALTER TABLE order_items ADD COLUMN booking_time time;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_items' AND column_name = 'booking_notes') THEN
    ALTER TABLE order_items ADD COLUMN booking_notes text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_items' AND column_name = 'booking_status') THEN
    ALTER TABLE order_items ADD COLUMN booking_status text DEFAULT 'pending';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_items' AND column_name = 'rescheduled_to') THEN
    ALTER TABLE order_items ADD COLUMN rescheduled_to timestamptz;
  END IF;
END $$;

-- =====================================================================
-- CARTS
-- =====================================================================
CREATE TABLE IF NOT EXISTS carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  coupon_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE carts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_cart" ON carts;
CREATE POLICY "select_own_cart"
ON carts FOR SELECT TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_cart" ON carts;
CREATE POLICY "insert_own_cart"
ON carts FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_cart" ON carts;
CREATE POLICY "update_own_cart"
ON carts FOR UPDATE TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_cart" ON carts;
CREATE POLICY "delete_own_cart"
ON carts FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- =====================================================================
-- CART_ITEMS
-- =====================================================================
CREATE TABLE IF NOT EXISTS cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id uuid NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  service_id uuid REFERENCES services(id) ON DELETE CASCADE,
  quantity int NOT NULL DEFAULT 1,
  save_for_later boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_cart_items" ON cart_items;
CREATE POLICY "select_own_cart_items"
ON cart_items FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM carts WHERE carts.id = cart_items.cart_id AND carts.user_id = auth.uid())
);

DROP POLICY IF EXISTS "insert_own_cart_items" ON cart_items;
CREATE POLICY "insert_own_cart_items"
ON cart_items FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM carts WHERE carts.id = cart_items.cart_id AND carts.user_id = auth.uid())
);

DROP POLICY IF EXISTS "update_own_cart_items" ON cart_items;
CREATE POLICY "update_own_cart_items"
ON cart_items FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM carts WHERE carts.id = cart_items.cart_id AND carts.user_id = auth.uid())
)
WITH CHECK (
  EXISTS (SELECT 1 FROM carts WHERE carts.id = cart_items.cart_id AND carts.user_id = auth.uid())
);

DROP POLICY IF EXISTS "delete_own_cart_items" ON cart_items;
CREATE POLICY "delete_own_cart_items"
ON cart_items FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM carts WHERE carts.id = cart_items.cart_id AND carts.user_id = auth.uid())
);

CREATE INDEX IF NOT EXISTS idx_cart_items_cart ON cart_items(cart_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_product ON cart_items(product_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_service ON cart_items(service_id);

-- =====================================================================
-- ORDER_STATUS_HISTORY
-- =====================================================================
CREATE TABLE IF NOT EXISTS order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  previous_status text,
  new_status text NOT NULL,
  changed_by uuid REFERENCES profiles(id),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;

-- Buyer can read status history of their orders
DROP POLICY IF EXISTS "buyer_select_status_history" ON order_status_history;
CREATE POLICY "buyer_select_status_history"
ON order_status_history FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM orders WHERE orders.id = order_status_history.order_id AND orders.buyer_id = auth.uid())
);

-- Vendor can read status history of their orders
DROP POLICY IF EXISTS "vendor_select_status_history" ON order_status_history;
CREATE POLICY "vendor_select_status_history"
ON order_status_history FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM orders
    JOIN vendors ON vendors.id = orders.vendor_id
    WHERE orders.id = order_status_history.order_id AND vendors.owner_id = auth.uid()
  )
);

-- Buyer can insert status changes (e.g., cancel)
DROP POLICY IF EXISTS "buyer_insert_status_history" ON order_status_history;
CREATE POLICY "buyer_insert_status_history"
ON order_status_history FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM orders WHERE orders.id = order_status_history.order_id AND orders.buyer_id = auth.uid())
);

-- Vendor can insert status changes (accept, process, complete)
DROP POLICY IF EXISTS "vendor_insert_status_history" ON order_status_history;
CREATE POLICY "vendor_insert_status_history"
ON order_status_history FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM orders
    JOIN vendors ON vendors.id = orders.vendor_id
    WHERE orders.id = order_status_history.order_id AND vendors.owner_id = auth.uid()
  )
);

-- Staff can read all status history
DROP POLICY IF EXISTS "staff_select_status_history" ON order_status_history;
CREATE POLICY "staff_select_status_history"
ON order_status_history FOR SELECT TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

CREATE INDEX IF NOT EXISTS idx_status_history_order ON order_status_history(order_id);

-- =====================================================================
-- RECEIPTS
-- =====================================================================
CREATE TABLE IF NOT EXISTS receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  receipt_number text NOT NULL UNIQUE,
  generated_at timestamptz NOT NULL DEFAULT now(),
  data jsonb NOT NULL DEFAULT '{}'
);

ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;

-- Buyer can read their receipts
DROP POLICY IF EXISTS "buyer_select_receipts" ON receipts;
CREATE POLICY "buyer_select_receipts"
ON receipts FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM orders WHERE orders.id = receipts.order_id AND orders.buyer_id = auth.uid())
);

-- Vendor can read receipts for their orders
DROP POLICY IF EXISTS "vendor_select_receipts" ON receipts;
CREATE POLICY "vendor_select_receipts"
ON receipts FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM orders
    JOIN vendors ON vendors.id = orders.vendor_id
    WHERE orders.id = receipts.order_id AND vendors.owner_id = auth.uid()
  )
);

-- Buyer can create receipt for their order
DROP POLICY IF EXISTS "buyer_insert_receipts" ON receipts;
CREATE POLICY "buyer_insert_receipts"
ON receipts FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM orders WHERE orders.id = receipts.order_id AND orders.buyer_id = auth.uid())
);

-- Vendor can create receipt for their order
DROP POLICY IF EXISTS "vendor_insert_receipts" ON receipts;
CREATE POLICY "vendor_insert_receipts"
ON receipts FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM orders
    JOIN vendors ON vendors.id = orders.vendor_id
    WHERE orders.id = receipts.order_id AND vendors.owner_id = auth.uid()
  )
);

CREATE INDEX IF NOT EXISTS idx_receipts_order ON receipts(order_id);
CREATE INDEX IF NOT EXISTS idx_receipts_number ON receipts(receipt_number);

-- =====================================================================
-- COUPONS
-- =====================================================================
CREATE TABLE IF NOT EXISTS coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  description text,
  discount_type text NOT NULL DEFAULT 'percentage' CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value numeric(12,2) NOT NULL DEFAULT 0,
  min_order_amount numeric(12,2) NOT NULL DEFAULT 0,
  max_discount_amount numeric(12,2),
  student_only boolean NOT NULL DEFAULT false,
  vendor_id uuid REFERENCES vendors(id) ON DELETE CASCADE,
  university_id uuid REFERENCES universities(id) ON DELETE CASCADE,
  usage_limit int,
  usage_count int NOT NULL DEFAULT 0,
  per_user_limit int NOT NULL DEFAULT 1,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;

-- Public can read active coupons within date range
DROP POLICY IF EXISTS "public_select_coupons" ON coupons;
CREATE POLICY "public_select_coupons"
ON coupons FOR SELECT TO anon, authenticated
USING (is_active = true AND starts_at <= now() AND ends_at >= now());

-- Staff can manage coupons
DROP POLICY IF EXISTS "staff_insert_coupons" ON coupons;
CREATE POLICY "staff_insert_coupons"
ON coupons FOR INSERT TO authenticated
WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "staff_update_coupons" ON coupons;
CREATE POLICY "staff_update_coupons"
ON coupons FOR UPDATE TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'))
WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "staff_delete_coupons" ON coupons;
CREATE POLICY "staff_delete_coupons"
ON coupons FOR DELETE TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);
CREATE INDEX IF NOT EXISTS idx_coupons_active ON coupons(is_active);
CREATE INDEX IF NOT EXISTS idx_coupons_vendor ON coupons(vendor_id);

-- =====================================================================
-- COUPON_REDEMPTIONS
-- =====================================================================
CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (coupon_id, user_id)
);

ALTER TABLE coupon_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_redemptions" ON coupon_redemptions;
CREATE POLICY "select_own_redemptions"
ON coupon_redemptions FOR SELECT TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_redemptions" ON coupon_redemptions;
CREATE POLICY "insert_own_redemptions"
ON coupon_redemptions FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "staff_select_redemptions" ON coupon_redemptions;
CREATE POLICY "staff_select_redemptions"
ON coupon_redemptions FOR SELECT TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

CREATE INDEX IF NOT EXISTS idx_redemptions_coupon ON coupon_redemptions(coupon_id);
CREATE INDEX IF NOT EXISTS idx_redemptions_user ON coupon_redemptions(user_id);

-- =====================================================================
-- WISHLISTS (Marketplace-specific saved items)
-- =====================================================================
CREATE TABLE IF NOT EXISTS wishlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (item_type IN ('product', 'service')),
  item_id uuid NOT NULL,
  collection text NOT NULL DEFAULT 'Favorites',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, item_type, item_id)
);

ALTER TABLE wishlists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_wishlist" ON wishlists;
CREATE POLICY "select_own_wishlist"
ON wishlists FOR SELECT TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_wishlist" ON wishlists;
CREATE POLICY "insert_own_wishlist"
ON wishlists FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_wishlist" ON wishlists;
CREATE POLICY "delete_own_wishlist"
ON wishlists FOR DELETE TO authenticated
USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_wishlist_user ON wishlists(user_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_user_type ON wishlists(user_id, item_type);

-- =====================================================================
-- ORDER_MESSAGES
-- =====================================================================
CREATE TABLE IF NOT EXISTS order_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE order_messages ENABLE ROW LEVEL SECURITY;

-- Sender and recipient can read messages
DROP POLICY IF EXISTS "select_order_messages" ON order_messages;
CREATE POLICY "select_order_messages"
ON order_messages FOR SELECT TO authenticated
USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

-- Authenticated user can send message if they are sender
DROP POLICY IF EXISTS "insert_order_messages" ON order_messages;
CREATE POLICY "insert_order_messages"
ON order_messages FOR INSERT TO authenticated
WITH CHECK (auth.uid() = sender_id);

-- Recipient can mark as read
DROP POLICY IF EXISTS "update_order_messages_read" ON order_messages;
CREATE POLICY "update_order_messages_read"
ON order_messages FOR UPDATE TO authenticated
USING (auth.uid() = recipient_id)
WITH CHECK (auth.uid() = recipient_id);

CREATE INDEX IF NOT EXISTS idx_order_messages_order ON order_messages(order_id);
CREATE INDEX IF NOT EXISTS idx_order_messages_recipient_unread ON order_messages(recipient_id, is_read);

-- =====================================================================
-- UPDATE ORDERS RLS POLICIES (extend existing)
-- =====================================================================
-- Drop old policies and recreate with marketplace-aware predicates

-- Buyer policies
DROP POLICY IF EXISTS "buyer_select_orders" ON orders;
CREATE POLICY "buyer_select_orders"
ON orders FOR SELECT TO authenticated
USING (auth.uid() = buyer_id);

DROP POLICY IF EXISTS "buyer_insert_orders" ON orders;
CREATE POLICY "buyer_insert_orders"
ON orders FOR INSERT TO authenticated
WITH CHECK (auth.uid() = buyer_id);

DROP POLICY IF EXISTS "buyer_update_orders" ON orders;
CREATE POLICY "buyer_update_orders"
ON orders FOR UPDATE TO authenticated
USING (auth.uid() = buyer_id)
WITH CHECK (auth.uid() = buyer_id);

DROP POLICY IF EXISTS "buyer_delete_orders" ON orders;
CREATE POLICY "buyer_delete_orders"
ON orders FOR DELETE TO authenticated
USING (auth.uid() = buyer_id);

-- Vendor policies
DROP POLICY IF EXISTS "vendor_select_orders" ON orders;
CREATE POLICY "vendor_select_orders"
ON orders FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM vendors WHERE vendors.id = orders.vendor_id AND vendors.owner_id = auth.uid())
);

DROP POLICY IF EXISTS "vendor_update_orders" ON orders;
CREATE POLICY "vendor_update_orders"
ON orders FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM vendors WHERE vendors.id = orders.vendor_id AND vendors.owner_id = auth.uid())
)
WITH CHECK (
  EXISTS (SELECT 1 FROM vendors WHERE vendors.id = orders.vendor_id AND vendors.owner_id = auth.uid())
);

-- Staff policies
DROP POLICY IF EXISTS "staff_select_orders" ON orders;
CREATE POLICY "staff_select_orders"
ON orders FOR SELECT TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

-- =====================================================================
-- UPDATE ORDER_ITEMS RLS POLICIES
-- =====================================================================
DROP POLICY IF EXISTS "buyer_select_order_items" ON order_items;
CREATE POLICY "buyer_select_order_items"
ON order_items FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND orders.buyer_id = auth.uid())
);

DROP POLICY IF EXISTS "vendor_select_order_items" ON order_items;
CREATE POLICY "vendor_select_order_items"
ON order_items FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM orders
    JOIN vendors ON vendors.id = orders.vendor_id
    WHERE orders.id = order_items.order_id AND vendors.owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "buyer_insert_order_items" ON order_items;
CREATE POLICY "buyer_insert_order_items"
ON order_items FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND orders.buyer_id = auth.uid())
);

-- Staff can read all order items
DROP POLICY IF EXISTS "staff_select_order_items" ON order_items;
CREATE POLICY "staff_select_order_items"
ON order_items FOR SELECT TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_order_items_service ON order_items(service_id);
CREATE INDEX IF NOT EXISTS idx_orders_buyer ON orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_orders_vendor ON orders(vendor_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_number ON orders(order_number);

-- =====================================================================
-- ORDER NUMBER GENERATOR
-- =====================================================================
CREATE OR REPLACE FUNCTION generate_order_number()
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
    SELECT substring(order_number from '\d+$')::int AS seq_val
    FROM orders
    WHERE order_number LIKE 'ORD-' || date_part || '-%'
  ) sub;
  result := 'ORD-' || date_part || '-' || lpad(seq::text, 4, '0');
  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION generate_order_number() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION generate_order_number() TO authenticated;

-- =====================================================================
-- RECEIPT NUMBER GENERATOR
-- =====================================================================
CREATE OR REPLACE FUNCTION generate_receipt_number()
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
    SELECT substring(receipt_number from '\d+$')::int AS seq_val
    FROM receipts
    WHERE receipt_number LIKE 'RCP-' || date_part || '-%'
  ) sub;
  result := 'RCP-' || date_part || '-' || lpad(seq::text, 4, '0');
  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION generate_receipt_number() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION generate_receipt_number() TO authenticated;

-- =====================================================================
-- UPDATED_AT TRIGGERS
-- =====================================================================
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['carts', 'cart_items']) LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%s_updated ON %s;
       CREATE TRIGGER trg_%s_updated BEFORE UPDATE ON %s
       FOR EACH ROW EXECUTE FUNCTION set_updated_at();',
      t, t, t, t
    );
  END LOOP;
END $$;