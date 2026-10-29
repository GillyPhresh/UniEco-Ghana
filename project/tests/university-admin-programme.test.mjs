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

test('mobile administrator screens keep touch targets and safe disclosure', async () => {
  const [apply, review, workspace] = await Promise.all([
    read('app/university-admin/apply/page.tsx'),
    read('app/admin/university-administrators/page.tsx'),
    read('app/admin/university-admin/page.tsx'),
  ]);
  assert.match(apply, /min-h-11/);
  assert.match(apply, /never request passwords or payment PINs/i);
  assert.match(review, /items-end/);
  assert.match(review, /Approve & appoint/);
  assert.match(workspace, /private workspace/);
  assert.match(workspace, /Only completed, verified registrations count/);
});

test('university administrators cannot open the super-admin application review queue', async () => {
  const layout = await read('components/admin/admin-layout.tsx');
  assert.match(layout, /pathname === '\/admin\/university-admin'/);
  assert.doesNotMatch(layout, /isScopedUniversityAdmin[^;]+[\s\S]*pathname === '\/admin\/university-administrators'/);
});
