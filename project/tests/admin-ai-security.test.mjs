import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
const route = fs.readFileSync(path.join(root, 'app/api/admin/ai/route.ts'), 'utf8');
const page = fs.readFileSync(path.join(root, 'app/admin/ai/page.tsx'), 'utf8');
const sources = fs.readFileSync(path.join(root, 'lib/ai/trusted-sources.ts'), 'utf8');

test('UniEco AI route is super-admin gated and never accepts arbitrary source URLs', () => {
  assert.match(route, /current_app_role/);
  assert.match(route, /role !== 'super_admin'/);
  assert.match(route, /fetchTrustedUniEcoAiUpdates\(sourceId\)/);
  assert.doesNotMatch(route, /fetch\(sourceUpdate\.url/);
  assert.match(sources, /UNIECO_AI_TRUSTED_SOURCES/);
  assert.match(sources, /url\.protocol === 'https:'/);
});

test('private AI UI is mounted only in the management area and drafts are not auto-published', () => {
  assert.match(page, /AdminRouteGuard/);
  assert.match(page, /\/api\/admin\/ai/);
  assert.match(page, /Prepare draft/);
  assert.match(page, /review.*Broadcasts/i);
  assert.match(route, /p_submit_for_approval: false/);
  assert.doesNotMatch(route, /begin_admin_broadcast_delivery/);
});
