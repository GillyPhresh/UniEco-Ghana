import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(process.cwd());
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261108110000_0189_tighten_anonymous_rpc_grants.sql'), 'utf8');

test('anonymous RPC hardening removes public grants while retaining authenticated and intentional public workflows', () => {
  const protectedRpcs = [
    'acknowledge_university_admin_appointment(uuid)',
    'claim_university_admin_registration(text,uuid,text)',
    'create_campus_community_comment(uuid,text,uuid)',
    'create_campus_community_post(text,text,text)',
    'create_university_admin_assignment(uuid,uuid,text)',
    'get_campus_community_post_reports(text,integer)',
    'get_campus_community_saved_posts(timestamptz,uuid,integer)',
    'get_my_university_admin_applications()',
    'get_my_university_admin_appointment()',
    'get_university_admin_application_form(uuid)',
    'get_university_admin_leaderboard(uuid)',
    'issue_university_admin_token(uuid,timestamptz)',
    'list_university_admin_applications(text,uuid,integer)',
    'mark_university_admin_month_paid(date,text)',
    'qualify_university_admin_registration(uuid,text)',
    'report_campus_community_post(uuid,text,text)',
    'revoke_university_admin_assignment(uuid,text)',
    'revoke_university_admin_token(uuid)',
    'set_admin_university_launch_status(uuid,text)',
    'set_campus_community_follow(uuid,boolean)',
    'set_campus_community_post_bookmark(uuid,boolean)',
    'set_campus_community_post_like(uuid,boolean)',
    'set_university_admin_opening(uuid,text,text,text,timestamptz,timestamptz)',
    'submit_university_admin_application(uuid,text,text,text,text,text,text,text,text,boolean)',
    'withdraw_university_admin_application(uuid)',
  ];
  const compactMigration = migration.replace(/\s+/g, '').toLowerCase();
  for (const signature of protectedRpcs) {
    const qualified = `public.${signature}`.toLowerCase();
    assert.equal(compactMigration.split(qualified).length - 1, 2, `${signature} is revoked and re-granted only for authenticated callers`);
  }
  assert.match(migration, /FROM PUBLIC, anon;[\s\S]*GRANT EXECUTE ON FUNCTION/);
  assert.match(migration, /TO authenticated;/);

  for (const trigger of [
    'issue_university_admin_appointment_letter', 'qualify_university_admin_student_payment',
    'queue_business_announcement_communication', 'queue_event_published_communication',
    'queue_order_status_communication', 'queue_review_received_communication',
    'queue_role_transition_welcome', 'queue_student_verification_communication',
    'queue_vendor_verification_communication', 'set_student_registration_fee_snapshot',
  ]) assert.equal(compactMigration.split(`public.${trigger}()`).length - 1, 1, `${trigger} is revoked from API roles`);

  for (const publicRpc of [
    'get_campus_community_feed', 'get_campus_community_member_posts',
    'get_campus_community_member_profile', 'get_campus_community_post',
    'get_campus_community_post_comments', 'get_campus_community_post_social_state',
    'get_institution_admin_invite',
  ]) assert.doesNotMatch(migration, new RegExp(`public\\.${publicRpc}\\(`), `${publicRpc} retains intentional anonymous access`);

  assert.doesNotMatch(migration, /DROP\s+(TABLE|COLUMN)|TRUNCATE|DELETE\s+FROM|UPDATE\s+/i);
});
