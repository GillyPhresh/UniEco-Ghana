import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
const route = fs.readFileSync(path.join(root, 'app/api/admin/ai/route.ts'), 'utf8');
const page = fs.readFileSync(path.join(root, 'app/admin/ai/page.tsx'), 'utf8');
const sources = fs.readFileSync(path.join(root, 'lib/ai/trusted-sources.ts'), 'utf8');
const assistant = fs.readFileSync(path.join(root, 'lib/ai/assistant.ts'), 'utf8');

test('UniEco AI route is super-admin gated and never accepts arbitrary source URLs', () => {
  assert.match(route, /current_app_role/);
  assert.match(route, /role !== 'super_admin'/);
  assert.match(route, /fetchTrustedUniEcoAiUpdates\(sourceId, sources\)/);
  assert.doesNotMatch(route, /fetch\(sourceUpdate\.url/);
  assert.match(route, /source\.label !== sourceUpdate\.sourceLabel/);
  assert.match(route, /sourceUpdate\.url\.length > 650/);
  assert.match(route, /updateHost\.endsWith\(`\.\$\{sourceHost\}`\)/);
  assert.match(sources, /UNIECO_AI_TRUSTED_SOURCES/);
  assert.match(sources, /url\.protocol === 'https:'/);
  assert.match(sources, /universities\.flatMap/);
  assert.match(sources, /slice\(0, 150\)/);
  assert.match(sources, /redirect: 'manual'/);
  assert.match(route, /schoolCoverage/);
  assert.match(route, /action === 'test'/);
  assert.match(page, /Check assistant/);
  assert.match(assistant, /metered token use/);
  assert.doesNotMatch(assistant, /process\.env|fetch\(/);
  assert.match(page, /No paid AI service is contacted/);
  assert.doesNotMatch(page, /Search the live web for this chat/);
});

test('private AI UI is mounted only in the management area and drafts are not auto-published', () => {
  assert.match(page, /AdminRouteGuard/);
  assert.match(page, /\/api\/admin\/ai/);
  assert.match(page, /Queue for review/);
  assert.match(page, /Campus feed review/);
  assert.match(route, /rpc\('prepare_admin_ai_update'/);
  assert.match(route, /queue_public_update_review/);
  assert.doesNotMatch(route, /begin_admin_broadcast_delivery/);
});

test('existing source-linked broadcasts can enter public review without creating or sending a duplicate', () => {
  assert.match(route, /action === 'queue_existing_broadcast'/);
  assert.match(route, /broadcast\.broadcast_type !== 'update'/);
  assert.match(route, /broadcast\.status === 'cancelled'/);
  assert.match(route, /Only an active source-linked update/);
  assert.match(route, /getTrustedUniEcoAiSources/);
  assert.match(route, /rpc\('prepare_admin_ai_update'/);
  assert.match(route, /No public post or additional broadcast was sent/);
  assert.doesNotMatch(route, /begin_admin_broadcast_delivery/);
  const broadcasts = fs.readFileSync(path.join(root, 'app/admin/broadcasts/page.tsx'), 'utf8');
  assert.match(broadcasts, /Queue public review/);
  assert.match(broadcasts, /action: 'queue_existing_broadcast'/);
  assert.match(broadcasts, /label: 'Queued'/);
  assert.match(broadcasts, /Recipients queued:/);
});

test('built-in AI drafts are source-grounded and always submitted for human review', () => {
  assert.match(route, /rpc\('prepare_admin_ai_update'/);
  assert.match(route, /queue_public_update_review/);
  assert.match(assistant, /For \$\{audienceLabel\}/);
  assert.match(assistant, /Source: \$\{url\.toString\(\)\}/);
  assert.match(assistant, /900 - prefix\.length - suffix\.length/);
  assert.match(assistant, /mode: 'safe-fallback'/);
  assert.match(route, /rpc\('prepare_admin_ai_update'/);
  assert.doesNotMatch(route, /begin_admin_broadcast_delivery/);
});

test('AI route health check is provider-free and never performs metered model calls', () => {
  assert.match(route, /mode: 'provider-free'/);
  assert.match(route, /providerFree: true/);
  assert.doesNotMatch(assistant, /api\.openai\.com|chat\/completions|\/responses/);
  assert.match(page, /Built-in · no paid AI provider/);
});

test('trusted source scans reject generic navigation and duplicate or source-home links', () => {
  assert.match(sources, /genericNavigation/);
  assert.match(sources, /words\.length < 4/);
  assert.match(sources, /canonicalLeadUrl/);
  assert.match(sources, /seenUrls\.has\(canonicalUrl\)/);
  assert.match(sources, /canonicalUrl === sourcePath/);
  assert.doesNotMatch(sources, /headings\.map\(\(title\) => \(\{ title, url: source\.url \}\)\)/);
});
