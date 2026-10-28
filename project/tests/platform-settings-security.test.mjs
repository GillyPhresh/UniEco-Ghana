import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261028190000_0148_super_admin_platform_settings.sql'), 'utf8');
const page = fs.readFileSync(path.join(root, 'app/admin/settings/page.tsx'), 'utf8');

test('platform settings are super-admin-only and audited', () => {
  assert.match(migration, /NOT public\.is_super_admin\(\)/g);
  assert.match(migration, /platform_setting_changes/);
  assert.match(migration, /record_trusted_admin_action\('platform_setting\.update'/);
  assert.match(migration, /record_trusted_admin_action\('platform_setting\.rollback'/);
  assert.match(migration, /REVOKE ALL ON public\.platform_settings/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.get_admin_platform_settings/);
});

test('settings UI requires reasons and exposes rollback without a destructive editor', () => {
  assert.match(page, /AdminRouteGuard/);
  assert.match(page, /reason\.trim\(\)\.length < 10/);
  assert.match(page, /Roll back/);
  assert.match(page, /Flags only affect modules that explicitly consume them/);
  assert.doesNotMatch(page, /dangerouslySetInnerHTML/);
});
