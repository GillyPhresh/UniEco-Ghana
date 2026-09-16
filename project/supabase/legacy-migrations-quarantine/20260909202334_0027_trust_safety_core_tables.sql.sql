/*
# Trust, Safety, Verification, Reviews & Fraud Prevention — Core Tables

## Overview
Creates the foundational trust and safety infrastructure for UniEco Ghana:
moderation case management, trust badges, appeals, risk scoring, account restrictions,
safety resources, verification history, document access logging, review moderation,
configurable report categories, category safety policies, business duplicate detection.

## New Tables (16 total)
1. report_categories — configurable report categories
2. moderation_cases — centralized case management
3. moderation_case_links — links cases to related entities
4. moderation_case_events — immutable case timeline
5. trust_badges — badge definitions with eligibility rules
6. user_trust_badges — badge awards to users/vendors
7. appeals — appeals for moderation actions
8. risk_signals — internal risk scoring (never exposed to users)
9. risk_score_history — historical risk scores
10. account_restrictions — granular account restrictions
11. safety_resources — safety center content
12. verification_history — audit trail of verification changes
13. document_access_logs — audit trail for private document access
14. review_moderation — review moderation states
15. category_safety_policies — configurable per-category safety rules
16. business_duplicate_flags — duplicate business detection

## Helper Functions (created after all tables)
- is_not_suspended(user_id) — checks if a user is not suspended
- is_not_restricted(restriction_type, user_id) — checks if a user is not restricted

## Security
- RLS enabled on all new tables
- Admin-only access for sensitive tables
- Owner access for appeals
- Public read for trust_badges (active), safety_resources (published), report_categories (active)
*/

-- ============================================================================
-- 1. REPORT CATEGORIES
-- ============================================================================

CREATE TABLE IF NOT EXISTS report_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  applicable_types text[] NOT NULL DEFAULT '{business,product,service,event,review,user,advertisement,message}',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE report_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_report_categories_public" ON report_categories;
CREATE POLICY "select_report_categories_public"
ON report_categories FOR SELECT TO anon, authenticated USING (is_active = true);

DROP POLICY IF EXISTS "insert_report_categories_admin" ON report_categories;
CREATE POLICY "insert_report_categories_admin"
ON report_categories FOR INSERT
TO authenticated WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "update_report_categories_admin" ON report_categories;
CREATE POLICY "update_report_categories_admin"
ON report_categories FOR UPDATE
TO authenticated USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'))
WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "delete_report_categories_admin" ON report_categories;
CREATE POLICY "delete_report_categories_admin"
ON report_categories FOR DELETE
TO authenticated USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

INSERT INTO report_categories (slug, label, description, sort_order) VALUES
  ('scam', 'Scam or Fraud', 'Suspected scam, fraudulent activity, or financial deception', 1),
  ('fake_business', 'Fake Business', 'Business does not exist or is impersonating another entity', 2),
  ('counterfeit_product', 'Counterfeit Product', 'Product appears to be fake or counterfeit', 3),
  ('wrong_information', 'Wrong Information', 'Business listing contains incorrect or misleading information', 4),
  ('harassment', 'Harassment', 'Harassing, threatening, or intimidating behavior', 5),
  ('offensive_content', 'Offensive Content', 'Content that is offensive, hateful, or inappropriate', 6),
  ('unsafe_service', 'Unsafe Service', 'Service poses a safety risk to users', 7),
  ('suspicious_payment', 'Suspicious Payment Request', 'Request for payment outside platform or unusual payment demands', 8),
  ('spam', 'Spam', 'Repeated unsolicited messages or spam content', 9),
  ('impersonation', 'Impersonation', 'Account is impersonating another person or organization', 10),
  ('misleading_claims', 'Misleading Claims', 'Exaggerated or false advertising claims', 11),
  ('prohibited_goods', 'Prohibited Goods or Services', 'Items that are illegal or against platform policy', 12),
  ('other', 'Other', 'Issue does not fit any other category', 99)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- 2. MODERATION CASES
-- ============================================================================

CREATE TABLE IF NOT EXISTS moderation_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number text NOT NULL UNIQUE DEFAULT ('MC-' || upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8))),
  case_type text NOT NULL CHECK (case_type IN (
    'report', 'verification_dispute', 'review_dispute', 'payment_fraud',
    'account_abuse', 'impersonation', 'duplicate_business', 'content_violation',
    'safety_incident', 'appeal_review', 'other'
  )),
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN (
    'open', 'investigating', 'waiting_info', 'resolved', 'dismissed', 'escalated'
  )),
  title text NOT NULL,
  description text,
  reporter_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  subject_type text NOT NULL CHECK (subject_type IN (
    'user', 'vendor', 'business', 'product', 'service', 'event', 'review', 'advertisement', 'message'
  )),
  subject_id text NOT NULL,
  university_id uuid REFERENCES universities(id) ON DELETE SET NULL,
  assigned_to uuid REFERENCES profiles(id) ON DELETE SET NULL,
  priority integer NOT NULL DEFAULT 0,
  resolution text,
  resolved_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE moderation_cases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_moderation_cases_admin" ON moderation_cases;
CREATE POLICY "select_moderation_cases_admin"
ON moderation_cases FOR SELECT
TO authenticated USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "insert_moderation_cases_admin" ON moderation_cases;
CREATE POLICY "insert_moderation_cases_admin"
ON moderation_cases FOR INSERT
TO authenticated WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "update_moderation_cases_admin" ON moderation_cases;
CREATE POLICY "update_moderation_cases_admin"
ON moderation_cases FOR UPDATE
TO authenticated USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'))
WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

CREATE INDEX IF NOT EXISTS idx_mod_cases_status ON moderation_cases (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mod_cases_severity ON moderation_cases (severity, status);
CREATE INDEX IF NOT EXISTS idx_mod_cases_assigned ON moderation_cases (assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mod_cases_subject ON moderation_cases (subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_mod_cases_university ON moderation_cases (university_id) WHERE university_id IS NOT NULL;

-- ============================================================================
-- 3. MODERATION CASE LINKS
-- ============================================================================

CREATE TABLE IF NOT EXISTS moderation_case_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES moderation_cases(id) ON DELETE CASCADE,
  linked_type text NOT NULL CHECK (linked_type IN ('report', 'message_report', 'content_flag', 'review', 'user', 'vendor', 'payment', 'order')),
  linked_id text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE moderation_case_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_case_links_admin" ON moderation_case_links;
CREATE POLICY "select_case_links_admin"
ON moderation_case_links FOR SELECT
TO authenticated USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "insert_case_links_admin" ON moderation_case_links;
CREATE POLICY "insert_case_links_admin"
ON moderation_case_links FOR INSERT
TO authenticated WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

CREATE INDEX IF NOT EXISTS idx_case_links_case ON moderation_case_links (case_id);
CREATE INDEX IF NOT EXISTS idx_case_links_entity ON moderation_case_links (linked_type, linked_id);

-- ============================================================================
-- 4. MODERATION CASE EVENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS moderation_case_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES moderation_cases(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('created', 'status_changed', 'assigned', 'note_added', 'action_taken', 'escalated', 'resolved', 'evidence_added')),
  actor_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE moderation_case_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_case_events_admin" ON moderation_case_events;
CREATE POLICY "select_case_events_admin"
ON moderation_case_events FOR SELECT
TO authenticated USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "insert_case_events_admin" ON moderation_case_events;
CREATE POLICY "insert_case_events_admin"
ON moderation_case_events FOR INSERT
TO authenticated WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

CREATE INDEX IF NOT EXISTS idx_case_events_case ON moderation_case_events (case_id, created_at);

-- ============================================================================
-- 5. TRUST BADGES
-- ============================================================================

CREATE TABLE IF NOT EXISTS trust_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  label text NOT NULL,
  description text NOT NULL,
  icon_name text NOT NULL DEFAULT 'BadgeCheck',
  badge_type text NOT NULL CHECK (badge_type IN ('verification', 'reputation', 'membership', 'achievement', 'safety')),
  eligibility_criteria jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE trust_badges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_trust_badges_public" ON trust_badges;
CREATE POLICY "select_trust_badges_public"
ON trust_badges FOR SELECT TO anon, authenticated USING (is_active = true);

DROP POLICY IF EXISTS "insert_trust_badges_admin" ON trust_badges;
CREATE POLICY "insert_trust_badges_admin"
ON trust_badges FOR INSERT
TO authenticated WITH CHECK (auth.jwt() ->> 'role' = 'super_admin');

DROP POLICY IF EXISTS "update_trust_badges_admin" ON trust_badges;
CREATE POLICY "update_trust_badges_admin"
ON trust_badges FOR UPDATE
TO authenticated USING (auth.jwt() ->> 'role' = 'super_admin')
WITH CHECK (auth.jwt() ->> 'role' = 'super_admin');

DROP POLICY IF EXISTS "delete_trust_badges_admin" ON trust_badges;
CREATE POLICY "delete_trust_badges_admin"
ON trust_badges FOR DELETE
TO authenticated USING (auth.jwt() ->> 'role' = 'super_admin');

INSERT INTO trust_badges (slug, label, description, icon_name, badge_type, eligibility_criteria) VALUES
  ('verified_student', 'Verified Student', 'This user has completed UniEco student verification with a valid student ID and index number.',
   'GraduationCap', 'verification', '{"entity_type": "student_profile", "criteria": {"verification_status": "verified", "is_verified_student": true}}'::jsonb),
  ('verified_vendor', 'Verified Vendor', 'This vendor has completed UniEco vendor verification including business documentation review.',
   'Store', 'verification', '{"entity_type": "vendor_profile", "criteria": {"verification_status": "active"}}'::jsonb),
  ('verified_business', 'Verified Business', 'This business has been verified for identity, location, and contact information.',
   'Building2', 'verification', '{"entity_type": "vendor", "criteria": {"is_verified": true, "is_active": true}}'::jsonb),
  ('verified_event_organizer', 'Verified Event Organizer', 'This organizer is authorized to publish campus events.',
   'CalendarCheck', 'verification', '{"entity_type": "profile", "criteria": {"can_create_events": true}}'::jsonb),
  ('top_rated', 'Top Rated', 'This business consistently receives high ratings from verified customers.',
   'Star', 'reputation', '{"entity_type": "vendor", "criteria": {"min_rating": 4.5, "min_review_count": 20}}'::jsonb),
  ('trusted_seller', 'Trusted Seller', 'This vendor has a track record of successful completed transactions.',
   'ShieldCheck', 'reputation', '{"entity_type": "vendor", "criteria": {"min_completed_orders": 50}}'::jsonb),
  ('student_entrepreneur', 'Student Entrepreneur', 'This vendor is a verified student running a business on campus.',
   'Lightbulb', 'achievement', '{"entity_type": "vendor", "criteria": {"is_student_business": true}}'::jsonb),
  ('early_adopter', 'Early Adopter', 'One of the first businesses to join the UniEco Ghana platform.',
   'Rocket', 'membership', '{"entity_type": "vendor", "criteria": {"joined_before": "2026-12-31"}}'::jsonb)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- 6. USER TRUST BADGES
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_trust_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  badge_id uuid NOT NULL REFERENCES trust_badges(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  vendor_id uuid REFERENCES vendors(id) ON DELETE CASCADE,
  awarded_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  awarded_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  revoked_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  revoked_at timestamptz,
  revocation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT utb_target_not_null CHECK (user_id IS NOT NULL OR vendor_id IS NOT NULL)
);

ALTER TABLE user_trust_badges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_user_trust_badges_public" ON user_trust_badges;
CREATE POLICY "select_user_trust_badges_public"
ON user_trust_badges FOR SELECT TO anon, authenticated USING (is_active = true);

DROP POLICY IF EXISTS "insert_user_trust_badges_admin" ON user_trust_badges;
CREATE POLICY "insert_user_trust_badges_admin"
ON user_trust_badges FOR INSERT
TO authenticated WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "update_user_trust_badges_admin" ON user_trust_badges;
CREATE POLICY "update_user_trust_badges_admin"
ON user_trust_badges FOR UPDATE
TO authenticated USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'))
WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "delete_user_trust_badges_admin" ON user_trust_badges;
CREATE POLICY "delete_user_trust_badges_admin"
ON user_trust_badges FOR DELETE
TO authenticated USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

CREATE INDEX IF NOT EXISTS idx_utb_user ON user_trust_badges (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_utb_vendor ON user_trust_badges (vendor_id) WHERE vendor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_utb_badge ON user_trust_badges (badge_id);

-- ============================================================================
-- 7. APPEALS
-- ============================================================================

CREATE TABLE IF NOT EXISTS appeals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appeal_number text NOT NULL UNIQUE DEFAULT ('AP-' || upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8))),
  appellant_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  appeal_type text NOT NULL CHECK (appeal_type IN (
    'account_suspension', 'vendor_suspension', 'verification_rejection',
    'content_removal', 'listing_suspension', 'review_removal', 'restriction', 'other'
  )),
  original_action_id text,
  original_entity_type text,
  original_entity_id text,
  reason text NOT NULL,
  supporting_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'under_review', 'approved', 'rejected', 'escalated')),
  reviewed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE appeals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_appeals_own" ON appeals;
CREATE POLICY "select_appeals_own"
ON appeals FOR SELECT TO authenticated USING (appellant_id = auth.uid());

DROP POLICY IF EXISTS "select_appeals_admin" ON appeals;
CREATE POLICY "select_appeals_admin"
ON appeals FOR SELECT
TO authenticated USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "insert_appeals_own" ON appeals;
CREATE POLICY "insert_appeals_own"
ON appeals FOR INSERT TO authenticated WITH CHECK (appellant_id = auth.uid());

DROP POLICY IF EXISTS "update_appeals_admin" ON appeals;
CREATE POLICY "update_appeals_admin"
ON appeals FOR UPDATE
TO authenticated USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'))
WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

CREATE INDEX IF NOT EXISTS idx_appeals_status ON appeals (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_appeals_appellant ON appeals (appellant_id);

-- ============================================================================
-- 8. RISK SIGNALS
-- ============================================================================

CREATE TABLE IF NOT EXISTS risk_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type text NOT NULL CHECK (subject_type IN ('user', 'vendor', 'business')),
  subject_id uuid NOT NULL,
  signal_type text NOT NULL CHECK (signal_type IN (
    'repeated_reports', 'unusual_activity', 'suspicious_payment', 'high_cancellation_rate',
    'sudden_listing_changes', 'multiple_accounts', 'repeated_policy_violations',
    'suspicious_review_patterns', 'rapid_registrations', 'failed_payment_attempts',
    'abnormal_order_velocity', 'impersonation_attempt', 'duplicate_business', 'other'
  )),
  signal_weight numeric NOT NULL DEFAULT 1.0 CHECK (signal_weight >= 0 AND signal_weight <= 10),
  description text,
  source text NOT NULL DEFAULT 'auto' CHECK (source IN ('auto', 'manual')),
  is_active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE risk_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_risk_signals_admin" ON risk_signals;
CREATE POLICY "select_risk_signals_admin"
ON risk_signals FOR SELECT
TO authenticated USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "insert_risk_signals_admin" ON risk_signals;
CREATE POLICY "insert_risk_signals_admin"
ON risk_signals FOR INSERT
TO authenticated WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "update_risk_signals_admin" ON risk_signals;
CREATE POLICY "update_risk_signals_admin"
ON risk_signals FOR UPDATE
TO authenticated USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'))
WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "delete_risk_signals_admin" ON risk_signals;
CREATE POLICY "delete_risk_signals_admin"
ON risk_signals FOR DELETE
TO authenticated USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

CREATE INDEX IF NOT EXISTS idx_risk_signals_subject ON risk_signals (subject_type, subject_id, is_active);
CREATE INDEX IF NOT EXISTS idx_risk_signals_active ON risk_signals (is_active, created_at DESC) WHERE is_active = true;

-- ============================================================================
-- 9. RISK SCORE HISTORY
-- ============================================================================

CREATE TABLE IF NOT EXISTS risk_score_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type text NOT NULL CHECK (subject_type IN ('user', 'vendor', 'business')),
  subject_id uuid NOT NULL,
  score integer NOT NULL CHECK (score >= 0 AND score <= 100),
  calculated_at timestamptz NOT NULL DEFAULT now(),
  factors jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE risk_score_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_risk_score_history_admin" ON risk_score_history;
CREATE POLICY "select_risk_score_history_admin"
ON risk_score_history FOR SELECT
TO authenticated USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "insert_risk_score_history_admin" ON risk_score_history;
CREATE POLICY "insert_risk_score_history_admin"
ON risk_score_history FOR INSERT
TO authenticated WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

CREATE INDEX IF NOT EXISTS idx_risk_score_subject ON risk_score_history (subject_type, subject_id, calculated_at DESC);

-- ============================================================================
-- 10. ACCOUNT RESTRICTIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS account_restrictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  restriction_type text NOT NULL CHECK (restriction_type IN (
    'no_new_listings', 'no_messaging', 'no_orders', 'no_reviews',
    'payment_hold', 'listing_suspended', 'limited_visibility', 'no_new_events'
  )),
  reason text NOT NULL,
  restricted_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  lifted_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  lifted_at timestamptz,
  lift_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE account_restrictions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_account_restrictions_admin" ON account_restrictions;
CREATE POLICY "select_account_restrictions_admin"
ON account_restrictions FOR SELECT
TO authenticated USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "insert_account_restrictions_admin" ON account_restrictions;
CREATE POLICY "insert_account_restrictions_admin"
ON account_restrictions FOR INSERT
TO authenticated WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "update_account_restrictions_admin" ON account_restrictions;
CREATE POLICY "update_account_restrictions_admin"
ON account_restrictions FOR UPDATE
TO authenticated USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'))
WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

CREATE INDEX IF NOT EXISTS idx_restrictions_user ON account_restrictions (user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_restrictions_active ON account_restrictions (is_active) WHERE is_active = true;

-- ============================================================================
-- 11. SAFETY RESOURCES
-- ============================================================================

CREATE TABLE IF NOT EXISTS safety_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  content text NOT NULL,
  resource_type text NOT NULL CHECK (resource_type IN ('guide', 'faq', 'emergency_contact', 'safety_tip', 'policy')),
  category text NOT NULL DEFAULT 'general',
  university_id uuid REFERENCES universities(id) ON DELETE CASCADE,
  is_published boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE safety_resources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_safety_resources_public" ON safety_resources;
CREATE POLICY "select_safety_resources_public"
ON safety_resources FOR SELECT TO anon, authenticated USING (is_published = true);

DROP POLICY IF EXISTS "insert_safety_resources_admin" ON safety_resources;
CREATE POLICY "insert_safety_resources_admin"
ON safety_resources FOR INSERT
TO authenticated WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "update_safety_resources_admin" ON safety_resources;
CREATE POLICY "update_safety_resources_admin"
ON safety_resources FOR UPDATE
TO authenticated USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'))
WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "delete_safety_resources_admin" ON safety_resources;
CREATE POLICY "delete_safety_resources_admin"
ON safety_resources FOR DELETE
TO authenticated USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

INSERT INTO safety_resources (slug, title, content, resource_type, category, sort_order) VALUES
  ('how-to-identify-legitimate-vendors', 'How to Identify Legitimate Vendors',
   'Look for the Verified Vendor badge on business profiles. Verified vendors have completed UniEco''s verification process, which includes identity and business documentation review. Check for reviews from verified purchasers, a complete business profile with location and contact information, and consistent positive transaction history.',
   'guide', 'marketplace_safety', 1),
  ('safe-marketplace-practices', 'Safe Marketplace Practices',
   'Always transact through the platform when possible. Keep communication within UniEco''s messaging system. Verify the business location and contact details before placing orders. Read reviews from verified purchasers. Be cautious of deals that seem too good to be true.',
   'guide', 'marketplace_safety', 2),
  ('payment-safety', 'Payment Safety',
   'Never send money outside the UniEco platform. Legitimate vendors will not ask for payment via personal mobile money numbers or direct bank transfers outside the platform. If a vendor insists on off-platform payment, report them immediately. Always verify the order details before completing payment.',
   'guide', 'payment_safety', 3),
  ('how-to-report-scams', 'How to Report Scams',
   'If you encounter a scam or suspicious activity, use the Report button on the business profile, product, or message. Select the appropriate category (Scam, Suspicious Payment Request, etc.) and provide as much detail as possible. Our moderation team reviews all reports and takes appropriate action.',
   'guide', 'reporting', 4),
  ('account-security', 'Account Security',
   'Use a strong, unique password for your UniEco account. Never share your password with anyone. Enable logout from other devices if you suspect unauthorized access. Report any suspicious login activity immediately. UniEco will never ask for your password via email or message.',
   'guide', 'account_security', 5),
  ('messaging-safety', 'Messaging Safety',
   'Keep all communication on the UniEco platform. Do not share personal financial information in messages. If someone sends you suspicious links or asks for off-platform payment, block them and report the conversation. You can block any user from their profile or from the messaging interface.',
   'guide', 'messaging_safety', 6),
  ('what-verification-means', 'What UniEco Verification Means',
   'Verified Student: The user has submitted a valid student ID and index number, confirmed by our verification process. Verified Vendor: The vendor has submitted business documentation that has been reviewed and approved by our team. These badges indicate that the user or business has completed our verification process, but users should still exercise normal caution.',
   'guide', 'verification', 7),
  ('how-to-report-suspicious-activity', 'How to Report Suspicious Activity',
   'Use the Report button available on business profiles, products, services, events, reviews, and messages. Choose the most relevant category and provide detailed information. Reports are confidential — the reported user will not know who reported them. Our team reviews reports promptly and takes appropriate action.',
   'guide', 'reporting', 8)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- 12. VERIFICATION HISTORY
-- ============================================================================

CREATE TABLE IF NOT EXISTS verification_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('student', 'vendor', 'business')),
  entity_id uuid NOT NULL,
  previous_status text,
  new_status text NOT NULL,
  changed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  reason text,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE verification_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_verification_history_admin" ON verification_history;
CREATE POLICY "select_verification_history_admin"
ON verification_history FOR SELECT
TO authenticated USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "insert_verification_history_admin" ON verification_history;
CREATE POLICY "insert_verification_history_admin"
ON verification_history FOR INSERT
TO authenticated WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

CREATE INDEX IF NOT EXISTS idx_verification_history_entity ON verification_history (entity_type, entity_id, created_at DESC);

-- ============================================================================
-- 13. DOCUMENT ACCESS LOGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS document_access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_url text NOT NULL,
  document_type text NOT NULL CHECK (document_type IN ('student_id', 'vendor_business', 'identity', 'address', 'other')),
  accessed_by uuid NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  owner_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  access_reason text,
  verification_request_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE document_access_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_document_access_logs_admin" ON document_access_logs;
CREATE POLICY "select_document_access_logs_admin"
ON document_access_logs FOR SELECT
TO authenticated USING (auth.jwt() ->> 'role' = 'super_admin');

DROP POLICY IF EXISTS "insert_document_access_logs_admin" ON document_access_logs;
CREATE POLICY "insert_document_access_logs_admin"
ON document_access_logs FOR INSERT
TO authenticated WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

CREATE INDEX IF NOT EXISTS idx_doc_access_owner ON document_access_logs (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_doc_access_by ON document_access_logs (accessed_by, created_at DESC);

-- ============================================================================
-- 14. REVIEW MODERATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS review_moderation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  moderation_status text NOT NULL DEFAULT 'published' CHECK (moderation_status IN (
    'published', 'pending_review', 'flagged', 'hidden', 'removed'
  )),
  flag_reason text,
  flagged_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  flagged_at timestamptz,
  moderated_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  moderated_at timestamptz,
  moderation_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(review_id)
);

ALTER TABLE review_moderation ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_review_moderation_admin" ON review_moderation;
CREATE POLICY "select_review_moderation_admin"
ON review_moderation FOR SELECT
TO authenticated USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "insert_review_moderation_admin" ON review_moderation;
CREATE POLICY "insert_review_moderation_admin"
ON review_moderation FOR INSERT
TO authenticated WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "update_review_moderation_admin" ON review_moderation;
CREATE POLICY "update_review_moderation_admin"
ON review_moderation FOR UPDATE
TO authenticated USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'))
WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

CREATE INDEX IF NOT EXISTS idx_review_mod_status ON review_moderation (moderation_status);

-- ============================================================================
-- 15. CATEGORY SAFETY POLICIES
-- ============================================================================

CREATE TABLE IF NOT EXISTS category_safety_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL UNIQUE,
  requires_verification boolean NOT NULL DEFAULT false,
  required_verification_level text DEFAULT 'basic' CHECK (required_verification_level IN ('none', 'basic', 'verified', 'enhanced')),
  documentation_required text[] NOT NULL DEFAULT '{}'::text[],
  advertising_restricted boolean NOT NULL DEFAULT false,
  review_required_before_publish boolean NOT NULL DEFAULT false,
  additional_notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE category_safety_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_category_safety_policies_public" ON category_safety_policies;
CREATE POLICY "select_category_safety_policies_public"
ON category_safety_policies FOR SELECT TO anon, authenticated USING (is_active = true);

DROP POLICY IF EXISTS "insert_category_safety_policies_admin" ON category_safety_policies;
CREATE POLICY "insert_category_safety_policies_admin"
ON category_safety_policies FOR INSERT
TO authenticated WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "update_category_safety_policies_admin" ON category_safety_policies;
CREATE POLICY "update_category_safety_policies_admin"
ON category_safety_policies FOR UPDATE
TO authenticated USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'))
WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "delete_category_safety_policies_admin" ON category_safety_policies;
CREATE POLICY "delete_category_safety_policies_admin"
ON category_safety_policies FOR DELETE
TO authenticated USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

-- ============================================================================
-- 16. BUSINESS DUPLICATE FLAGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS business_duplicate_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id_1 uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  business_id_2 uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  match_signals jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence_score numeric(3,2) NOT NULL DEFAULT 0.5 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'resolved', 'dismissed')),
  resolved_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  resolution text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT different_businesses CHECK (business_id_1 != business_id_2)
);

ALTER TABLE business_duplicate_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_duplicate_flags_admin" ON business_duplicate_flags;
CREATE POLICY "select_duplicate_flags_admin"
ON business_duplicate_flags FOR SELECT
TO authenticated USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "insert_duplicate_flags_admin" ON business_duplicate_flags;
CREATE POLICY "insert_duplicate_flags_admin"
ON business_duplicate_flags FOR INSERT
TO authenticated WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "update_duplicate_flags_admin" ON business_duplicate_flags;
CREATE POLICY "update_duplicate_flags_admin"
ON business_duplicate_flags FOR UPDATE
TO authenticated USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'))
WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

CREATE INDEX IF NOT EXISTS idx_dup_flags_status ON business_duplicate_flags (status, created_at DESC);

-- ============================================================================
-- HELPER FUNCTIONS (created after all tables exist)
-- ============================================================================

CREATE OR REPLACE FUNCTION is_not_suspended(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT status FROM profiles WHERE id = p_user_id),
    'active'
  ) != 'suspended';
$$;

GRANT EXECUTE ON FUNCTION is_not_suspended TO authenticated;

CREATE OR REPLACE FUNCTION is_not_restricted(p_restriction text, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM account_restrictions
    WHERE user_id = p_user_id
      AND restriction_type = p_restriction
      AND is_active = true
      AND (ends_at IS NULL OR ends_at > now())
  );
$$;

GRANT EXECUTE ON FUNCTION is_not_restricted TO authenticated;
