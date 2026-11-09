import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (file) => readFile(new URL(file, root), 'utf8');

test('administrator earnings are fixed at GH₵2 and accrue only from qualified registrations', async () => {
  const migration = await read('supabase/migrations/20261109170000_0194_university_admin_weekly_compensation.sql');
  assert.match(migration, /SET rate_per_qualified_registration = 2\.00/);
  assert.match(migration, /CHECK \(rate_per_qualified_registration = 2\.00\)/);
  assert.match(migration, /p_rate IS DISTINCT FROM 2\.00/);
  assert.match(migration, /referral\.status='qualified'/);
  assert.match(migration, /count\(\*\)::integer AS qualified_count/);
  assert.match(migration, /weekly\.qualified_count\*2\.00/);
  assert.match(migration, /registration_type IN \('student','student_vendor'\)/);
  assert.match(migration, /registration_type IN \('vendor','student_vendor'\)/);
  assert.match(migration, /weekly\.last_qualified_at \+ interval '7 days'/);
  assert.match(migration, /weekly\.period_start \+ 7 <= p_period_start/);
  assert.match(migration, /ON CONFLICT \(assignment_id,period_start,period_end\) DO NOTHING/);
  assert.match(migration, /WHERE status = 'approved'[\s\S]*ON CONFLICT DO NOTHING/);
  assert.doesNotMatch(migration, /UPDATE public\.university_admin_monthly_earnings[\s\S]*SET status = 'approved'/);
});

test('weekly administrator earnings use the existing secured referral payout queue', async () => {
  const [migration, worker, settingsApi, payoutUi, adminPage, workspace, appointment] = await Promise.all([
    read('supabase/migrations/20261109170000_0194_university_admin_weekly_compensation.sql'),
    read('app/api/internal/referral-payouts/route.ts'),
    read('app/api/referrals/payout-settings/route.ts'),
    read('components/referrals/referral-payout-settings.tsx'),
    read('app/admin/university-admin-payroll/page.tsx'),
    read('components/admin/university-admin-workspace-content.tsx'),
    read('supabase/functions/send-email/university-admin-documents.ts'),
  ]);
  assert.match(migration, /university_admin_earning_id uuid/);
  assert.match(migration, /num_nonnulls\(student_reward_id, vendor_reward_id, university_admin_earning_id\) = 1/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.reserve_weekly_referral_payouts\(date,text\) TO service_role/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.get_my_university_admin_weekly_earnings\(uuid\) TO authenticated/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.get_university_admin_weekly_payroll\(date\) TO authenticated/);
  assert.match(migration, /'minimum_payout',COALESCE\(threshold,10\)/);
  assert.match(worker, /reason: 'UniEco Ghana referral reward'/);
  assert.match(worker, /liveReady\(\)/);
  assert.match(settingsApi, /'university_admin'/);
  assert.match(payoutUi, /program\?: 'referrals' \| 'university_admin'/);
  assert.match(payoutUi, /seven-day review period/);
  assert.match(workspace, /get_my_university_admin_weekly_earnings/);
  assert.match(workspace, /ReferralPayoutSettings program="university_admin"/);
  assert.match(adminPage, /get_university_admin_weekly_payroll/);
  assert.doesNotMatch(adminPage, /mark_university_admin_earning_paid|finalize_university_admin_month|approve_university_admin_month/);
  assert.match(appointment, /GH₵2 for each qualified student or vendor registration/);
});
