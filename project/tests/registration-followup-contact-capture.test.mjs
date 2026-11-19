import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const read = async (path) => (await readFile(new URL(path, root), 'utf8')).replace(/\r\n/g, '\n');

test('signup contacts are saved privately at the earliest registration contact step', async () => {
  const [migration, student, vendor, admin] = await Promise.all([
    read('supabase/migrations/20261119120000_0212_registration_followup_contacts.sql'),
    read('app/onboarding/student/page.tsx'),
    read('app/onboarding/vendor/page.tsx'),
    read('app/admin/registration-alerts/page.tsx'),
  ]);

  assert.match(migration, /registration_contact_steps[\s\S]*ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON public\.registration_contact_steps FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(migration, /auth\.uid\(\)/);
  assert.match(migration, /current_app_role\(\) IS DISTINCT FROM 'super_admin'/);
  assert.match(migration, /interval '90 days'/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.save_my_registration_contact_step[\s\S]*TO authenticated/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.save_my_registration_contact_step[\s\S]*public\.registration_contact_page[\s\S]*TO authenticated/);

  assert.match(student, /rpc\('save_my_registration_contact_step'[\s\S]*p_lane: 'student'[\s\S]*normalizeGhanaPhone\(form\.phone\)/);
  assert.match(student, /Your number was not saved[\s\S]*tap Continue to retry/);
  assert.match(vendor, /rpc\('save_my_registration_contact_step'[\s\S]*p_lane: 'external_vendor'[\s\S]*normalizeGhanaPhone\(form\.contact_phone\)/);
  assert.match(vendor, /Your contacts were not saved[\s\S]*tap Continue to retry/);

  assert.match(admin, /rpc\('registration_contact_page'/);
  assert.match(admin, /Signup email/);
  assert.match(admin, /Account phone/);
  assert.match(admin, /Business phone/);
  assert.match(admin, /Business email/);
  assert.match(admin, /mailto:/);
  assert.match(admin, /tel:/);
  assert.match(admin, /user\?\.role !== 'super_admin'/);
});
