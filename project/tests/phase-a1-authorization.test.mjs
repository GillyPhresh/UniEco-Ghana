import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// Historical 0029 is deliberately quarantined. The direct-policy successor is
// the canonical, deployed Phase A1 authority implementation.
const migrationPath = new URL('../supabase/migrations/20260911224000_0029_phase_a1_identity_authorization_hardening_direct_policies.sql', import.meta.url);
const authContextPath = new URL('../lib/auth/auth-context.tsx', import.meta.url);
const adminClientPath = new URL('../lib/data/admin-client.ts', import.meta.url);

test('Phase A1 keeps application-role authority in the database', async () => {
  const [migration, authContext] = await Promise.all([
    readFile(migrationPath, 'utf8'),
    readFile(authContextPath, 'utf8'),
  ]);

  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.current_app_role\(\)/);
  assert.match(migration, /INSERT INTO public\.profiles[\s\S]*?\n\s*2,/);
  assert.match(migration, /request_vendor_role/);
  assert.doesNotMatch(authContext, /user_metadata\?\.role/);
  assert.doesNotMatch(authContext, /\n\s*role:\s*meta\.role/);
});

test('Phase A1 leaves sensitive transitions server-authoritative', async () => {
  const [migration, adminClient] = await Promise.all([
    readFile(migrationPath, 'utf8'),
    readFile(adminClientPath, 'utf8'),
  ]);

  for (const rpc of [
    'assign_application_role',
    'set_profile_status',
    'review_student_verification',
    'review_vendor_verification',
    'set_vendor_active',
  ]) {
    assert.match(migration, new RegExp('FUNCTION public\\.' + rpc));
    assert.match(adminClient, new RegExp("rpc\\('" + rpc + "'"));
  }
  assert.match(migration, /role_transition_audit/);
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE ON public\.audit_logs FROM authenticated/);
});
