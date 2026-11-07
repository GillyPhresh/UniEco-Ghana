import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFileSync(path.join(projectRoot, relativePath), 'utf8');

test('admin shell and middleware consume the same moderator route policy', () => {
  const policy = read('lib/auth/admin-route-policy.ts');
  const middleware = read('lib/supabase/middleware.ts');
  const layout = read('components/admin/admin-layout.tsx');

  assert.match(policy, /getModeratorPermissionForAdminPath/);
  assert.match(policy, /isModeratorScopedAdminPath/);
  assert.match(middleware, /getModeratorPermissionForAdminPath\(pathname\)/);
  assert.match(layout, /isModeratorScopedAdminPath\(pathname\)/);
  assert.doesNotMatch(middleware, /pathname === '\/admin\/moderation'.*can_review_reports/s);
  assert.doesNotMatch(layout, /pathname === '\/admin\/moderation'/);
});

test('route policy maps only complete moderator module paths to database capabilities', () => {
  const policy = read('lib/auth/admin-route-policy.ts');
  for (const [prefix, permission] of [
    ['/admin/moderation', 'can_review_reports'],
    ['/admin/trust-safety', 'can_review_reports'],
    ['/admin/verification', 'can_review_verifications'],
    ['/admin/support', 'can_manage_support'],
    ['/admin/communication', 'can_manage_communications'],
    ['/admin/advertisements', 'can_moderate_content'],
    ['/admin/reviews', 'can_moderate_content'],
    ['/admin/events', 'can_moderate_content'],
    ['/admin/community-posts', 'can_moderate_content'],
  ]) {
    assert.match(policy, new RegExp(`prefix: '${prefix.replaceAll('/', '\\/')}', permission: '${permission}'`));
  }
  assert.match(policy, /pathname === prefix \|\| pathname\.startsWith\(`\$\{prefix\}\/`\)/);
});
