import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('registration alerts are private, deduplicated, and include completed and stalled follow-ups', async () => {
  const migration = await read('supabase/migrations/20261109150000_0192_super_admin_registration_followups.sql');
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON public\.admin_registration_alerts FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /UNIQUE \(user_id, alert_type\)/);
  assert.match(migration, /role\.name = 'super_admin'/);
  assert.match(migration, /current_app_role\(\) <> 'super_admin'/);
  assert.match(migration, /ARRAY\['push'\]::text\[\]/);
  assert.match(migration, /at least 30 minutes/);
  assert.match(migration, /'\*\/15 \* \* \* \*'/);
  assert.match(migration, /student_completed/);
  assert.match(migration, /vendor_completed/);
  assert.match(migration, /notify_admin_of_cash_registration_completion/);
  assert.match(migration, /profile\.status IN \('active','pending','pending_payment'\)/);
});

test('Super Admin dashboard exposes follow-up contacts without putting them in push previews', async () => {
  const [migration, page, nav] = await Promise.all([
    read('supabase/migrations/20261109150000_0192_super_admin_registration_followups.sql'),
    read('app/admin/registration-alerts/page.tsx'),
    read('lib/types/admin.ts'),
  ]);
  assert.match(migration, /profile\.full_name, profile\.email, profile\.phone/);
  assert.match(migration, /Open Registration Follow-ups to view available contact details/);
  assert.doesNotMatch(migration, /jsonb_build_object\('body',\s*recipient\.(email|phone)/);
  assert.match(page, /mailto:/);
  assert.match(page, /tel:/);
  assert.match(page, /Super Admin/);
  assert.match(nav, /Registration Follow-ups.*\/admin\/registration-alerts/);
});
