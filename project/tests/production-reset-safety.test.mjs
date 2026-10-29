import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

test('management user directory does not expose a production-wide delete control', () => {
  const page = fs.readFileSync(path.join(root, 'app/admin/users/page.tsx'), 'utf8');
  const client = fs.readFileSync(path.join(root, 'lib/data/admin-client.ts'), 'utf8');
  assert.doesNotMatch(page, /Delete all non-admin users|admin_reset_non_admin_accounts|resetNonAdminAccounts/);
  assert.doesNotMatch(client, /admin_reset_non_admin_accounts|resetNonAdminAccounts/);
});

test('production database removes the obsolete bulk-delete RPC', () => {
  const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261029240000_0158_remove_production_bulk_reset.sql'), 'utf8');
  assert.match(migration, /DROP FUNCTION IF EXISTS public\.admin_reset_non_admin_accounts\(text, text\)/);
});
