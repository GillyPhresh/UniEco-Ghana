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
  assert.match(route, /fetchTrustedUniEcoAiUpdates\(sourceId, sources\)/);
  assert.doesNotMatch(route, /fetch\(sourceUpdate\.url/);
  assert.match(sources, /UNIECO_AI_TRUSTED_SOURCES/);
  assert.match(sources, /url\.protocol === 'https:'/);
  assert.match(sources, /universities\.flatMap/);
  assert.match(sources, /slice\(0, 150\)/);
  assert.match(sources, /redirect: 'manual'/);
  assert.match(route, /schoolCoverage/);
  assert.match(route, /isUniEcoAiWebSearchAvailable/);
  assert.match(route, /action === 'test'/);
  assert.match(route, /failureReason: result\.failureReason/);
  assert.match(page, /Test AI connection/);
  assert.match(page, /connection not tested/);
  assert.match(page, /Search the live web for this chat/);
  assert.match(page, /opt-in live-web-search checkbox in chat/);
});

test('private AI UI is mounted only in the management area and drafts are not auto-published', () => {
  assert.match(page, /AdminRouteGuard/);
  assert.match(page, /\/api\/admin\/ai/);
  assert.match(page, /Prepare for approval/);
  assert.match(page, /review.*Broadcasts/i);
  assert.match(route, /p_submit_for_approval: true/);
  assert.match(route, /draft\.mode !== 'configured'/);
  assert.match(route, /status: 'pending_approval'/);
  assert.doesNotMatch(route, /begin_admin_broadcast_delivery/);
});

test('trusted source scans reject generic navigation and duplicate or source-home links', () => {
  assert.match(sources, /genericNavigation/);
  assert.match(sources, /words\.length < 4/);
  assert.match(sources, /canonicalLeadUrl/);
  assert.match(sources, /seenUrls\.has\(canonicalUrl\)/);
  assert.match(sources, /canonicalUrl === sourcePath/);
  assert.doesNotMatch(sources, /headings\.map\(\(title\) => \(\{ title, url: source\.url \}\)\)/);
});
