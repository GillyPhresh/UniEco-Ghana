/*
# UniEco Ghana — IAM Schema Extension

## Purpose
Extends the core schema with a complete Identity & Access Management system:
account statuses, enhanced student profiles, vendor profiles, verification
requests, audit logging, and a flexible role-permission system.

## 1. Modified Tables

### profiles
Added columns:
- status (text, default 'active') — active | suspended | pending
  Controls account-level access independent of role.
- preferences (jsonb, default '{}') — user UI/notification preferences
- notification_settings (jsonb, default '{}') — granular notification toggles

### student_profiles
Added columns to match the student onboarding spec:
- profile_id (uuid, references profiles) — denormalized link for convenience
- faculty (text)
- department (text)
- admission_year (int)
- verification_status (text, default 'pending') — pending | verified | rejected | alumni | suspended
- student_id_document_url (text) — uploaded student ID image path
- rejection_reason (text) — set when verification is rejected

## 2. New Tables

### vendor_profiles
Vendor-specific profile data for student_vendor and external_vendor roles.
- id (uuid, PK)
- profile_id (uuid, FK profiles, unique)
- vendor_type (text) — student_vendor | external_vendor
- verification_status (text, default 'pending') — pending | active | suspended | expired | rejected
- subscription_status (text, default 'none') — none | active | expired | cancelled
- business_category (text)
- location_address (text)
- location_city (text)
- location_region (text)
- product_service_type (text)
- verification_document_url (text)
- rejection_reason (text)
- approved_at (timestamptz)
- approved_by (uuid, FK profiles) — admin who approved
- created_at (timestamptz)

### verification_requests
All verification submissions (student ID, vendor docs, etc.) go here.
- id (uuid, PK)
- user_id (uuid, FK profiles, ON DELETE CASCADE)
- request_type (text) — student_id | vendor_business | address | identity
- documents (jsonb) — array of {url, label} objects
- status (text, default 'pending') — pending | approved | rejected
- admin_note (text)
- reviewed_by (uuid, FK profiles)
- reviewed_at (timestamptz)
- created_at (timestamptz)

### audit_logs
Immutable audit trail for sensitive actions (role changes, verifications,
suspensions, etc.). Append-only.
- id (uuid, PK)
- actor_id (uuid, FK profiles) — who performed the action
- target_id (uuid) — who was acted upon
- action (text) — e.g. role_changed, verification_approved, user_suspended
- entity_type (text) — profiles | vendors | verification_requests
- entity_id (uuid)
- metadata (jsonb) — before/after values, notes
- created_at (timestamptz)

### role_permissions
Flexible permission mapping. Each role has a set of named permissions.
- id (uuid, PK)
- role (text) — matches user_roles.name
- permission (text) — e.g. can_purchase, can_sell, can_moderate
- created_at (timestamptz)
Unique on (role, permission).

### index_number_verifications
Tracks index-number-to-user mappings to detect duplicates and suspicious
registrations. One row per (university_id, index_number) pair.
- id (uuid, PK)
- university_id (uuid, FK universities)
- index_number (text) — normalized (uppercased, trimmed)
- student_profile_id (uuid, FK student_profiles)
- status (text, default 'pending') — pending | verified | rejected
- is_duplicate (boolean, default false) — flagged when same index appears again
- created_at (timestamptz)
Unique on (university_id, index_number).

## 3. Security — RLS
- vendor_profiles: owner can read/update own; admins can read all and update
  verification/subscription status.
- verification_requests: user can read own and create; moderators/admins can
  read all and update status.
- audit_logs: only admins can read; anyone can insert (actor = self).
- role_permissions: public read (reference data); no write from client.
- index_number_verifications: user can read own; admins/moderators can read all.

## 4. Functions
- is_staff() — returns true if caller is moderator or super_admin (jwt role)
- has_permission(perm text) — checks role_permissions for caller's role
- can_manage_user(target_id uuid) — true if admin or self

## 5. Seed
- role_permissions seeded with the full permission matrix from the spec.

## 6. Notes
- No destructive operations on existing columns — only ADD COLUMN and new tables.
- Owner columns default to auth.uid() where applicable.
*/

-- =====================================================================
-- PROFILES: add status, preferences, notification_settings
-- =====================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'status') THEN
    ALTER TABLE profiles ADD COLUMN status text NOT NULL DEFAULT 'active';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'preferences') THEN
    ALTER TABLE profiles ADD COLUMN preferences jsonb NOT NULL DEFAULT '{}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'notification_settings') THEN
    ALTER TABLE profiles ADD COLUMN notification_settings jsonb NOT NULL DEFAULT '{}';
  END IF;
END $$;

-- =====================================================================
-- STUDENT_PROFILES: add faculty, department, admission_year, verification fields
-- =====================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'student_profiles' AND column_name = 'profile_id') THEN
    ALTER TABLE student_profiles ADD COLUMN profile_id uuid REFERENCES profiles(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'student_profiles' AND column_name = 'faculty') THEN
    ALTER TABLE student_profiles ADD COLUMN faculty text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'student_profiles' AND column_name = 'department') THEN
    ALTER TABLE student_profiles ADD COLUMN department text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'student_profiles' AND column_name = 'admission_year') THEN
    ALTER TABLE student_profiles ADD COLUMN admission_year int;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'student_profiles' AND column_name = 'verification_status') THEN
    ALTER TABLE student_profiles ADD COLUMN verification_status text NOT NULL DEFAULT 'pending';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'student_profiles' AND column_name = 'student_id_document_url') THEN
    ALTER TABLE student_profiles ADD COLUMN student_id_document_url text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'student_profiles' AND column_name = 'rejection_reason') THEN
    ALTER TABLE student_profiles ADD COLUMN rejection_reason text;
  END IF;
END $$;

-- Backfill profile_id from user_id where null
UPDATE student_profiles SET profile_id = user_id WHERE profile_id IS NULL;

-- =====================================================================
-- VENDOR_PROFILES
-- =====================================================================
CREATE TABLE IF NOT EXISTS vendor_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid UNIQUE NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  vendor_type text NOT NULL DEFAULT 'student_vendor',
  verification_status text NOT NULL DEFAULT 'pending',
  subscription_status text NOT NULL DEFAULT 'none',
  business_category text,
  location_address text,
  location_city text,
  location_region text,
  product_service_type text,
  verification_document_url text,
  rejection_reason text,
  approved_at timestamptz,
  approved_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE vendor_profiles ENABLE ROW LEVEL SECURITY;

-- Owner can read own vendor profile
DROP POLICY IF EXISTS "owners_read_vendor_profiles" ON vendor_profiles;
CREATE POLICY "owners_read_vendor_profiles"
ON vendor_profiles FOR SELECT
TO authenticated
USING (auth.uid() = profile_id);

-- Staff can read all vendor profiles
DROP POLICY IF EXISTS "staff_read_vendor_profiles" ON vendor_profiles;
CREATE POLICY "staff_read_vendor_profiles"
ON vendor_profiles FOR SELECT
TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

-- Owner can insert own vendor profile
DROP POLICY IF EXISTS "owners_insert_vendor_profiles" ON vendor_profiles;
CREATE POLICY "owners_insert_vendor_profiles"
ON vendor_profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = profile_id);

-- Owner can update own vendor profile (but NOT verification/subscription status)
DROP POLICY IF EXISTS "owners_update_vendor_profiles" ON vendor_profiles;
CREATE POLICY "owners_update_vendor_profiles"
ON vendor_profiles FOR UPDATE
TO authenticated
USING (auth.uid() = profile_id)
WITH CHECK (
  auth.uid() = profile_id
  AND verification_status IS NOT DISTINCT FROM (
    SELECT vp2.verification_status FROM vendor_profiles vp2 WHERE vp2.id = vendor_profiles.id
  )
  AND subscription_status IS NOT DISTINCT FROM (
    SELECT vp3.subscription_status FROM vendor_profiles vp3 WHERE vp3.id = vendor_profiles.id
  )
);

-- Staff can update verification/subscription status
DROP POLICY IF EXISTS "staff_update_vendor_profiles" ON vendor_profiles;
CREATE POLICY "staff_update_vendor_profiles"
ON vendor_profiles FOR UPDATE
TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'))
WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

-- =====================================================================
-- VERIFICATION_REQUESTS
-- =====================================================================
CREATE TABLE IF NOT EXISTS verification_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  request_type text NOT NULL,
  documents jsonb NOT NULL DEFAULT '[]',
  status text NOT NULL DEFAULT 'pending',
  admin_note text,
  reviewed_by uuid REFERENCES profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE verification_requests ENABLE ROW LEVEL SECURITY;

-- User can read own requests
DROP POLICY IF EXISTS "users_read_own_verification_requests" ON verification_requests;
CREATE POLICY "users_read_own_verification_requests"
ON verification_requests FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Staff can read all verification requests
DROP POLICY IF EXISTS "staff_read_verification_requests" ON verification_requests;
CREATE POLICY "staff_read_verification_requests"
ON verification_requests FOR SELECT
TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

-- User can create own verification requests
DROP POLICY IF EXISTS "users_insert_verification_requests" ON verification_requests;
CREATE POLICY "users_insert_verification_requests"
ON verification_requests FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Staff can update verification requests (approve/reject)
DROP POLICY IF EXISTS "staff_update_verification_requests" ON verification_requests;
CREATE POLICY "staff_update_verification_requests"
ON verification_requests FOR UPDATE
TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'))
WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

-- =====================================================================
-- AUDIT_LOGS
-- =====================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES profiles(id),
  target_id uuid,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can read audit logs
DROP POLICY IF EXISTS "admins_read_audit_logs" ON audit_logs;
CREATE POLICY "admins_read_audit_logs"
ON audit_logs FOR SELECT
TO authenticated
USING (auth.jwt() ->> 'role' = 'super_admin');

-- Any authenticated user can insert audit logs (actor = self)
DROP POLICY IF EXISTS "users_insert_audit_logs" ON audit_logs;
CREATE POLICY "users_insert_audit_logs"
ON audit_logs FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = actor_id OR actor_id IS NULL);

-- =====================================================================
-- ROLE_PERMISSIONS
-- =====================================================================
CREATE TABLE IF NOT EXISTS role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL,
  permission text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role, permission)
);

ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_role_permissions" ON role_permissions;
CREATE POLICY "public_read_role_permissions"
ON role_permissions FOR SELECT
TO anon, authenticated
USING (true);

-- =====================================================================
-- INDEX_NUMBER_VERIFICATIONS
-- =====================================================================
CREATE TABLE IF NOT EXISTS index_number_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id uuid NOT NULL REFERENCES universities(id),
  index_number text NOT NULL,
  student_profile_id uuid REFERENCES student_profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  is_duplicate boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (university_id, index_number)
);

ALTER TABLE index_number_verifications ENABLE ROW LEVEL SECURITY;

-- User can read own index verification rows
DROP POLICY IF EXISTS "users_read_own_index_verifications" ON index_number_verifications;
CREATE POLICY "users_read_own_index_verifications"
ON index_number_verifications FOR SELECT
TO authenticated
USING (
  student_profile_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM student_profiles sp
    WHERE sp.id = index_number_verifications.student_profile_id
    AND sp.user_id = auth.uid()
  )
);

-- Staff can read all index verifications
DROP POLICY IF EXISTS "staff_read_index_verifications" ON index_number_verifications;
CREATE POLICY "staff_read_index_verifications"
ON index_number_verifications FOR SELECT
TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

-- User can insert own index verification
DROP POLICY IF EXISTS "users_insert_index_verifications" ON index_number_verifications;
CREATE POLICY "users_insert_index_verifications"
ON index_number_verifications FOR INSERT
TO authenticated
WITH CHECK (
  student_profile_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM student_profiles sp
    WHERE sp.id = index_number_verifications.student_profile_id
    AND sp.user_id = auth.uid()
  )
);

-- Staff can update index verification status
DROP POLICY IF EXISTS "staff_update_index_verifications" ON index_number_verifications;
CREATE POLICY "staff_update_index_verifications"
ON index_number_verifications FOR UPDATE
TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'))
WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

-- =====================================================================
-- HELPER FUNCTIONS
-- =====================================================================
CREATE OR REPLACE FUNCTION is_staff()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(auth.jwt() ->> 'role' IN ('moderator', 'super_admin'), false);
$$;

REVOKE EXECUTE ON FUNCTION is_staff() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_staff() TO authenticated;

CREATE OR REPLACE FUNCTION has_permission(perm text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role = auth.jwt() ->> 'role'
    AND rp.permission = perm
  );
$$;

REVOKE EXECUTE ON FUNCTION has_permission(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION has_permission(text) TO authenticated;

-- =====================================================================
-- INDEXES
-- =====================================================================
CREATE INDEX IF NOT EXISTS idx_profiles_status ON profiles(status);
CREATE INDEX IF NOT EXISTS idx_vendor_profiles_profile ON vendor_profiles(profile_id);
CREATE INDEX IF NOT EXISTS idx_vendor_profiles_verification ON vendor_profiles(verification_status);
CREATE INDEX IF NOT EXISTS idx_verification_requests_user ON verification_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_verification_requests_status ON verification_requests(status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs(target_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role);
CREATE INDEX IF NOT EXISTS idx_index_verifications_university ON index_number_verifications(university_id);

-- =====================================================================
-- SEED: ROLE PERMISSIONS
-- Full RBAC matrix from the IAM spec
-- =====================================================================
INSERT INTO role_permissions (role, permission) VALUES
  -- Visitor: browse only
  ('visitor', 'can_browse'),
  ('visitor', 'can_view_businesses'),
  ('visitor', 'can_view_products'),
  ('visitor', 'can_view_events'),

  -- Student: browse + purchase + message + review + save
  ('student', 'can_browse'),
  ('student', 'can_view_businesses'),
  ('student', 'can_view_products'),
  ('student', 'can_view_events'),
  ('student', 'can_manage_profile'),
  ('student', 'can_save_businesses'),
  ('student', 'can_review_businesses'),
  ('student', 'can_message_vendors'),
  ('student', 'can_purchase'),
  ('student', 'can_register_business'),

  -- Student Vendor: student permissions + sell
  ('student_vendor', 'can_browse'),
  ('student_vendor', 'can_view_businesses'),
  ('student_vendor', 'can_view_products'),
  ('student_vendor', 'can_view_events'),
  ('student_vendor', 'can_manage_profile'),
  ('student_vendor', 'can_save_businesses'),
  ('student_vendor', 'can_review_businesses'),
  ('student_vendor', 'can_message_vendors'),
  ('student_vendor', 'can_purchase'),
  ('student_vendor', 'can_manage_business'),
  ('student_vendor', 'can_add_products'),
  ('student_vendor', 'can_add_services'),
  ('student_vendor', 'can_receive_orders'),
  ('student_vendor', 'can_view_analytics'),

  -- External Vendor: full business management
  ('external_vendor', 'can_browse'),
  ('external_vendor', 'can_view_businesses'),
  ('external_vendor', 'can_view_products'),
  ('external_vendor', 'can_view_events'),
  ('external_vendor', 'can_manage_profile'),
  ('external_vendor', 'can_manage_business'),
  ('external_vendor', 'can_manage_products'),
  ('external_vendor', 'can_manage_services'),
  ('student_vendor', 'can_manage_products'),
  ('student_vendor', 'can_manage_services'),
  ('external_vendor', 'can_manage_customers'),
  ('external_vendor', 'can_manage_promotions'),

  -- Moderator: content moderation
  ('moderator', 'can_browse'),
  ('moderator', 'can_view_businesses'),
  ('moderator', 'can_view_products'),
  ('moderator', 'can_view_events'),
  ('moderator', 'can_review_reports'),
  ('moderator', 'can_moderate_content'),
  ('moderator', 'can_review_verifications'),

  -- Super Admin: full access
  ('super_admin', 'can_browse'),
  ('super_admin', 'can_view_businesses'),
  ('super_admin', 'can_view_products'),
  ('super_admin', 'can_view_events'),
  ('super_admin', 'can_manage_users'),
  ('super_admin', 'can_manage_universities'),
  ('super_admin', 'can_manage_vendors'),
  ('super_admin', 'can_manage_businesses'),
  ('super_admin', 'can_manage_payments'),
  ('super_admin', 'can_manage_system_settings'),
  ('super_admin', 'can_view_analytics'),
  ('super_admin', 'can_review_reports'),
  ('super_admin', 'can_moderate_content'),
  ('super_admin', 'can_review_verifications'),
  ('super_admin', 'can_view_audit_logs')
ON CONFLICT (role, permission) DO NOTHING;

-- =====================================================================
-- TRIGGER: log profile status changes to audit_logs
-- =====================================================================
CREATE OR REPLACE FUNCTION log_profile_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.audit_logs (actor_id, target_id, action, entity_type, entity_id, metadata)
    VALUES (
      auth.uid(),
      NEW.id,
      'profile_status_changed',
      'profiles',
      NEW.id,
      jsonb_build_object('from', OLD.status, 'to', NEW.status)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profile_status_change ON profiles;
CREATE TRIGGER trg_profile_status_change
  AFTER UPDATE OF status ON profiles
  FOR EACH ROW EXECUTE FUNCTION log_profile_status_change();