import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('legacy verified students can retry only when every registration charge is terminally unpaid', async () => {
  const migration = await read('supabase/migrations/20261109140000_0191_unpaid_verified_student_payment_retry.sql');
  assert.match(migration, /status NOT IN \('failed', 'cancelled'\)/);
  assert.match(migration, /registration_status IS DISTINCT FROM 'paid'/);
  assert.match(migration, /status = 'pending_payment'/);
  assert.match(migration, /verification_status = 'pending', is_verified_student = false/);
  assert.match(migration, /begin_student_registration_payment_pre_0191\(/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.begin_student_registration_payment_pre_0191/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.begin_student_registration_payment[\s\S]*TO authenticated, service_role/);
});

test('successful, pending, and ambiguous charges are never automatically reset for another payment', async () => {
  const migration = await read('supabase/migrations/20261109140000_0191_unpaid_verified_student_payment_retry.sql');
  const guard = migration.slice(migration.indexOf("IF verified_student AND registration_status"), migration.indexOf('IF NOT unresolved_charge'));
  assert.match(guard, /registration_status IS DISTINCT FROM 'paid'/);
  assert.match(migration, /IF NOT unresolved_charge THEN/);
  assert.match(migration, /payment\.status NOT IN \('failed', 'cancelled'\)/);
  assert.doesNotMatch(migration, /UPDATE public\.payments[\s\S]*SET status/);
});
