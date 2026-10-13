import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('..', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const baseline = await read('supabase/staging-bootstrap/migrations/20260911000000_0000_clean_staging_baseline.sql');
const a1Compatible = await read('supabase/migrations/20260911224000_0029_phase_a1_identity_authorization_hardening_direct_policies.sql');
const a1GrantCorrection = await read('supabase/migrations/20260911225000_0029_phase_a1_function_grant_correction.sql');
const a2PaymentReferencePrerequisite = await read('supabase/migrations/20260911226000_0029_phase_a2_payment_reference_prerequisite.sql');
const a2InvoiceReceiptPrerequisites = await read('supabase/migrations/20260911227000_0029_phase_a2_invoice_receipt_prerequisites.sql');
const a2PrivilegeCorrection = await read('supabase/migrations/20260911230500_0030_phase_a2_financial_privilege_correction.sql');
const a2 = await read('supabase/migrations/20260911230000_0030_phase_a2_financial_authority.sql');
const a3 = await read('supabase/migrations/20260911231000_0031_private_message_attachments.sql');
const a3GrantCorrection = await read('supabase/migrations/20260911232000_0031_message_attachment_function_grant_correction.sql');
const messagingWritePath = await read('supabase/migrations/20260911233000_0032_secure_messaging_write_path.sql');
const messagingRecipientScope = await read('supabase/migrations/20260911234000_0032_student_recipient_search_university_scope.sql');

assert.match(baseline, /^BEGIN;/m);
assert.match(baseline, /COMMIT;\s*$/);
assert.doesNotMatch(baseline, /\b(referral_rewards|wallet_transactions|CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(?:public\.)?(?:referrals|wallets))\b/i);
assert.doesNotMatch(baseline, /INSERT\s+INTO\s+auth\.users/i);

const requiredBeforeA1 = ['user_roles', 'universities', 'profiles', 'vendors', 'vendor_profiles', 'student_profiles', 'role_permissions', 'audit_logs', 'university_admin_memberships'];
const requiredBeforeA2 = ['businesses', 'products', 'services', 'orders', 'order_items', 'payments', 'subscriptions', 'invoices', 'invoice_items', 'receipts', 'payment_providers', 'coupons', 'coupon_redemptions'];
const requiredBeforeA3 = ['conversations', 'messages'];
const activeStructuralDomains = [
  'saved_items', 'recently_viewed', 'student_preferences', 'wishlists',
  'business_gallery', 'business_hours', 'business_holidays', 'vendor_analytics', 'vendor_settings', 'review_responses',
  'ad_requests', 'advertisements', 'featured_listings',
  'message_reads', 'communication_events', 'communication_deliveries', 'communication_logs', 'push_subscriptions',
  'blocked_users', 'message_reports', 'business_announcements', 'admin_broadcasts', 'university_announcements', 'event_reminders',
  'ticket_replies', 'announcements', 'admin_actions',
  'content_quality_flags', 'moderation_cases', 'moderation_case_links', 'moderation_case_events', 'user_trust_badges',
  'risk_signals', 'risk_score_history', 'verification_history', 'document_access_logs', 'review_moderation',
  'category_safety_policies', 'business_duplicate_flags',
];
for (const table of [...requiredBeforeA1, ...requiredBeforeA2, ...requiredBeforeA3, ...activeStructuralDomains]) {
  assert.match(baseline, new RegExp(`CREATE TABLE public\\.${table}\\b`), `baseline is missing ${table}`);
  assert.match(baseline, new RegExp(`'${table}'`), `${table} is not included in the baseline RLS enablement list`);
}
for (const column of ['payment_reference', 'user_id', 'vendor_id', 'payment_type', 'idempotency_key']) {
  assert.match(baseline, new RegExp(`CREATE TABLE public\\.payments[\\s\\S]*?\\b${column}\\b`), `payments is missing ${column}`);
}
for (const source of [a1Compatible, a2, a3]) assert.match(source, /BEGIN;/);
assert.doesNotMatch(a1Compatible, /pg_get_policydef\([^)]*,\s*true\)/, 'A1 direct-policy successor must not call the unsupported two-argument signature');
assert.doesNotMatch(a1Compatible, /pg_get_policydef/i, 'A1 direct-policy successor must not depend on policy-definition introspection');
for (const requiredA1Control of [
  'current_app_role', 'has_app_role', 'is_super_admin', 'is_staff', 'has_permission', 'can_manage_university',
  'assign_application_role', 'set_profile_status', 'request_vendor_role', 'review_student_verification',
  'review_vendor_verification', 'set_vendor_active', 'assign_university_administrator', 'role_transition_audit',
  'users_update_safe_profile_fields', 'users_insert_authorized_locations', 'university_admin_memberships_select_own',
]) {
  assert.match(a1Compatible, new RegExp(requiredA1Control), `A1 successor is missing ${requiredA1Control}`);
}
assert.match(a1GrantCorrection, /^BEGIN;/m);
assert.match(a1GrantCorrection, /COMMIT;\s*$/);
assert.doesNotMatch(a1GrantCorrection, /pg_get_policydef/i, 'A1 grant correction must not introspect policies');
for (const functionName of ['current_app_role', 'assign_application_role', 'assign_university_administrator', 'handle_new_user', 'log_profile_status_change']) {
  assert.match(a1GrantCorrection, new RegExp(`REVOKE ALL ON FUNCTION public\\.${functionName}`), `A1 grant correction must revoke ${functionName}`);
}
assert.match(a1GrantCorrection, /GRANT EXECUTE ON FUNCTION public\.assign_application_role\(uuid, smallint, text\) TO authenticated/, 'privileged A1 RPC must be available only to authenticated callers');
assert.match(a2PaymentReferencePrerequisite, /^BEGIN;/m);
assert.match(a2PaymentReferencePrerequisite, /COMMIT;\s*$/);
assert.match(a2PaymentReferencePrerequisite, /CREATE OR REPLACE FUNCTION public\.generate_payment_reference\(\)\s+RETURNS text/s, 'A2 prerequisite must provide the exact zero-argument text helper required by 0030');
assert.match(a2PaymentReferencePrerequisite, /gen_random_uuid\(\)/, 'A2 payment reference prerequisite must be collision-resistant under concurrent generation');
assert.match(a2PaymentReferencePrerequisite, /REVOKE ALL ON FUNCTION public\.generate_payment_reference\(\) FROM PUBLIC, anon, authenticated, service_role/, 'A2 payment helper must not be a public/browser RPC');
assert.match(a2InvoiceReceiptPrerequisites, /^BEGIN;/m);
assert.match(a2InvoiceReceiptPrerequisites, /COMMIT;\s*$/);
for (const helper of ['generate_invoice_number', 'generate_receipt_number']) {
  assert.match(a2InvoiceReceiptPrerequisites, new RegExp(`CREATE OR REPLACE FUNCTION public\\.${helper}\\(\\)\\s+RETURNS text`, 's'), `A2 prerequisite must provide ${helper}() → text`);
  assert.match(a2InvoiceReceiptPrerequisites, new RegExp(`REVOKE ALL ON FUNCTION public\\.${helper}\\(\\) FROM PUBLIC, anon, authenticated, service_role`), `${helper} must not be a public/browser RPC`);
}
assert.doesNotMatch(a2InvoiceReceiptPrerequisites, /CREATE TABLE|payment_intents|wallet|referral/i, 'A2 helper prerequisite must not introduce schema or product scope');
assert.match(a2PrivilegeCorrection, /^BEGIN;/m);
assert.match(a2PrivilegeCorrection, /COMMIT;\s*$/);
assert.doesNotMatch(a2PrivilegeCorrection, /CREATE TABLE|ALTER TABLE|CREATE OR REPLACE FUNCTION/i, 'A2 privilege correction must not alter financial schema or logic');
for (const functionName of ['financial_reference', 'enforce_financial_rate_limit', 'create_marketplace_checkout', 'apply_verified_payment_webhook']) {
  assert.match(a2PrivilegeCorrection, new RegExp(`REVOKE ALL ON FUNCTION public\\.${functionName}`), `A2 privilege correction must revoke ${functionName}`);
}
assert.match(a2PrivilegeCorrection, /GRANT EXECUTE ON FUNCTION public\.apply_verified_payment_webhook[\s\S]*?TO service_role/, 'webhook transition must be service-role-only');
assert.match(a2PrivilegeCorrection, /REVOKE ALL ON TABLE public\.payment_webhook_events FROM PUBLIC, anon, authenticated/, 'webhook events must be server-only');
assert.match(baseline, /CREATE TRIGGER on_auth_user_created[\s\S]*public\.handle_new_user\(\)/, 'baseline is missing the auth profile trigger required by A1');
assert.match(a3, /message-attachments/, '0031 must own the private message attachment bucket');
assert.doesNotMatch(baseline, /message-attachments/i, 'baseline must leave private message attachments to 0031');
assert.match(a3GrantCorrection, /^BEGIN;/m);
assert.match(a3GrantCorrection, /COMMIT;\s*$/);
assert.doesNotMatch(a3GrantCorrection, /CREATE TABLE|ALTER TABLE|CREATE OR REPLACE FUNCTION|CREATE POLICY|DROP POLICY/i, '0031 grant correction must not alter schema, helper logic, or storage policies');
assert.match(a3GrantCorrection, /REVOKE ALL ON FUNCTION public\.message_attachment_conversation_id\(text\)[\s\S]*?FROM PUBLIC, anon, authenticated, service_role/, '0031 grant correction must remove inherited API-role execution');
assert.match(a3GrantCorrection, /GRANT EXECUTE ON FUNCTION public\.message_attachment_conversation_id\(text\)[\s\S]*?TO authenticated/, '0031 attachment helper must remain available for authenticated policy evaluation');
assert.match(messagingWritePath, /^BEGIN;/m);
assert.match(messagingWritePath, /COMMIT;\s*$/);
assert.doesNotMatch(messagingWritePath, /CREATE POLICY[\s\S]*(?:conversations|messages)[\s\S]*FOR (?:INSERT|UPDATE|DELETE)/i, 'messaging writes must not be opened through broad table policies');
for (const rpc of ['get_or_create_direct_conversation', 'search_message_recipients', 'send_direct_message', 'mark_direct_messages_read', 'soft_delete_direct_message', 'clear_direct_message_attachment']) {
  assert.match(messagingWritePath, new RegExp(`FUNCTION public\\.${rpc}`), `messaging successor must provide ${rpc}`);
  assert.match(messagingWritePath, new RegExp(`REVOKE ALL ON FUNCTION public\\.${rpc}`), `messaging successor must revoke inherited API-role execution for ${rpc}`);
}
assert.match(messagingRecipientScope, /v_university_id IS NULL/, 'recipient search must reject unaffiliated students');
assert.match(messagingRecipientScope, /p\.university_id = v_university_id/, 'recipient search must be university scoped');
for (const bucket of ['avatars', 'student-documents', 'vendor-documents', 'university-branding']) {
  assert.match(baseline, new RegExp(`'${bucket}'`), `baseline is missing ${bucket} storage bucket`);
}
for (const forbidden of ['referrals', 'referral_rewards', 'wallets', 'wallet_transactions', 'payment_intents', 'financial_audit', 'payment_history']) {
  assert.doesNotMatch(baseline, new RegExp(`CREATE TABLE\\s+(?:IF NOT EXISTS\\s+)?(?:public\\.)?${forbidden}\\b`, 'i'), `baseline must not recreate ${forbidden}`);
}
console.log('Staging bootstrap dependency validation passed: baseline → 0029 → 0030 → 0031.');
