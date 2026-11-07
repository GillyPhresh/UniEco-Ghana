import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (file) => readFile(new URL(file, root), 'utf8');

test('university administrator programme is database-authoritative and scoped', async () => {
  const migration = await read('supabase/migrations/20261029200000_0154_university_admin_applications.sql');
  assert.match(migration, /Only an active student account may apply/);
  assert.match(migration, /Super administrator access required/);
  assert.match(migration, /review_university_admin_application/);
  assert.match(migration, /university_id <> p_university_id/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public.review_university_admin_application/);
});

test('appointment and score workflow protects payment and referral attribution', async () => {
  const [referrals, appointments, onboarding, tokenRoute, emailFunction, dispatcher] = await Promise.all([
    read('supabase/migrations/20261029190000_0153_university_admin_referrals_and_payroll.sql'),
    read('supabase/migrations/20261029210000_0155_university_admin_appointments_and_scores.sql'),
    read('app/onboarding/student/page.tsx'),
    read('app/signup/page.tsx'),
    read('supabase/functions/send-email/index.ts'),
    read('supabase/functions/dispatch-communication-queue/index.ts'),
  ]);
  assert.match(referrals, /token_digest/);
  assert.match(referrals, /qualify_university_admin_registration_internal/);
  assert.match(referrals, /student_registration_payments/);
  assert.match(referrals, /No money is sent by this migration|No money is sent by this migration/i);
  assert.match(appointments, /issue_university_admin_appointment_letter/);
  assert.match(appointments, /get_my_university_admin_score/);
  assert.match(appointments, /Qualified registrations are the only events/);
  assert.match(appointments, /enqueue_trusted_communication_event/);
  assert.match(appointments, /ARRAY\['email','push'\]/);
  assert.match(appointments, /'template', 'university_admin_appointment'/);
  assert.match(appointments, /'body', 'Congratulations/);
  assert.match(emailFunction, /template === 'university_admin_appointment'/);
  assert.match(dispatcher, /metadata\.body/);
  assert.match(onboarding, /claim_university_admin_registration/);
  assert.match(tokenRoute, /unieco_pending_university_admin_token/);
  assert.match(referrals, /\/signup\?university_admin_token/);
});

test('forward migration replaces UUID min aggregates without rewriting applied migrations', async () => {
  const migration = await read('supabase/migrations/20261101120000_0170_fix_university_admin_uuid_selection.sql');
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.get_my_university_admin_dashboard/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.get_my_university_admin_score/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.get_my_university_admin_earnings/);
  assert.match(migration, /array_agg\(university_id ORDER BY university_id\)/);
  assert.doesNotMatch(migration, /min\s*\(\s*university_id\s*\)/i);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.get_my_university_admin_score\(uuid\) FROM PUBLIC, anon, service_role/);
});

test('marketplace category search filters through the business category and offers retry', async () => {
  const [client, page] = await Promise.all([
    read('lib/data/marketplace-client.ts'),
    read('app/marketplace/page.tsx'),
  ]);
  assert.match(client, /business:businesses!inner\([\s\S]*category,[\s\S]*vendor:vendors!inner\(/);
  assert.match(client, /query\.eq\('business\.category', params\.category\)/);
  assert.doesNotMatch(client, /query\.eq\('business\.business_type', params\.category\)/);
  assert.match(page, /Marketplace search is temporarily unavailable[\s\S]*Try again/);
});

test('super-admin opening changes require an explicit status selection', async () => {
  const page = await read('app/admin/university-administrators/page.tsx');
  assert.match(page, /useState\(''\);[\s\S]*openingStatus/);
  assert.match(page, /placeholder="Choose status"/);
  assert.match(page, /disabled=\{[^}]*!openingStatus/);
  assert.match(page, /value="draft">Draft/);
  assert.match(page, /openingClosesOn/);
  assert.match(page, /closes at 11:59 pm Ghana time/i);
  assert.match(page, /p_closes_at: closesAt\?\.toISOString\(\) \?\? null/);
});

test('mobile administrator screens keep touch targets and safe disclosure', async () => {
  const [apply, review, workspace] = await Promise.all([
    read('app/university-admin/apply/page.tsx'),
    read('app/admin/university-administrators/page.tsx'),
    read('components/admin/university-admin-workspace-content.tsx'),
  ]);
  assert.match(apply, /min-h-11/);
  assert.match(apply, /never request passwords or payment PINs/i);
  assert.match(review, /items-end/);
  assert.match(review, /Approve & appoint/);
  assert.match(workspace, /Your link is private to your signed-in administrator account/);
  assert.match(workspace, /required payment and verification conditions are complete/);
});

test('university admin application prevents availability constraint errors and hides database details', async () => {
  const [apply, migration] = await Promise.all([
    read('app/university-admin/apply/page.tsx'),
    read('supabase/migrations/20261029200000_0154_university_admin_applications.sql'),
  ]);
  assert.match(migration, /availability text NOT NULL CHECK \(length\(trim\(availability\)\) BETWEEN 2 AND 120\)/);
  assert.match(apply, /availabilityLength > 120/);
  assert.match(apply, /maxLength=\{120\}/);
  assert.match(apply, /10–120 characters/);
  assert.match(apply, /Your answers are still here; please try again/);
  assert.doesNotMatch(apply, /setError\(submitError\.message\)/);
});

test('university admin applications accept ordinary Ghana phone numbers and survive notification outages', async () => {
  const migration = await read('supabase/migrations/20261102130000_0178_fix_university_admin_application_submission.sql');
  const apply = await read('app/university-admin/apply/page.tsx');
  assert.match(migration, /DROP CONSTRAINT IF EXISTS university_admin_applications_phone_check/);
  assert.match(migration, /phone ~ '\^\[\+\]\?\[0-9 \(\)-\]\{7,20\}\$'/);
  assert.match(migration, /regexp_replace\(phone, '\[\^0-9\]', '', 'g'\)\) BETWEEN 7 AND 15/);
  assert.match(migration, /\) NOT VALID;/);
  assert.match(migration, /EXCEPTION WHEN OTHERS THEN[\s\S]*RAISE WARNING 'University administrator application notification was not queued/);
  assert.match(apply, /submitError\.code === '23514'/);
  assert.match(apply, /application\.university_id === opening\.university_id[\s\S]*'under_review'[\s\S]*already on file/);
  assert.doesNotMatch(apply, /setError\(openingError\.message\)/);
});

test('mobile navigation exposes a prominent university administrator application entry', async () => {
  const header = await read('components/layout/site-header.tsx');
  assert.match(header, /aria-label="Mobile primary"/);
  assert.match(header, /href="\/university-admin\/apply"[\s\S]*University Administrator Programme[\s\S]*Apply for a role on your campus[\s\S]*>Apply</);
  assert.match(header, /min-h-16[\s\S]*GraduationCap/);
});

test('university administrators cannot open the super-admin application review queue', async () => {
  const middleware = await read('lib/supabase/middleware.ts');
  assert.match(middleware, /role === 'university_admin' && pathname === '\/admin\/university-admin'/);
  assert.match(middleware, /workspaceUrl\.pathname = '\/university-admin'/);
  assert.match(middleware, /isUniversityWorkspaceRoute \? !isAuthorizedUniversityWorkspace : !isPlatformStaff/);
});
