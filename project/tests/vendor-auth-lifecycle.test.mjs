import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(path.join(projectRoot, 'hooks/use-vendor.ts'), 'utf8');
const verification = readFileSync(path.join(projectRoot, 'app/vendor-dashboard/verification/page.tsx'), 'utf8');
const analytics = readFileSync(path.join(projectRoot, 'app/vendor-dashboard/analytics/page.tsx'), 'utf8');
const settingsPage = readFileSync(path.join(projectRoot, 'app/vendor-dashboard/settings/page.tsx'), 'utf8');
const vendorClient = readFileSync(path.join(projectRoot, 'lib/data/vendor-client.ts'), 'utf8');
const productsPage = readFileSync(path.join(projectRoot, 'app/vendor-dashboard/products/page.tsx'), 'utf8');
const servicesPage = readFileSync(path.join(projectRoot, 'app/vendor-dashboard/services/page.tsx'), 'utf8');

test('vendor profile loader clears old account data and ignores stale requests', () => {
  assert.match(source, /const requestSequence = useRef\(0\)/);
  assert.match(source, /setVendor\(null\);\s*setLoading\(true\)/);
  assert.match(source, /const v = await getVendorProfile\(\);\s*if \(requestSequence\.current !== requestId\) return;/);
  assert.match(source, /if \(requestSequence\.current === requestId\) setLoading\(false\)/);
  assert.match(source, /return \(\) => \{ requestSequence\.current \+= 1; \};/);
});

test('vendor service filters discard stale responses and surface catalogue read failures', () => {
  assert.match(servicesPage, /const loadServices = useCallback/);
  assert.match(servicesPage, /\}, \[vendor\?\.id, showArchived\]\);/);
  assert.match(servicesPage, /requestId === loadRequestId\.current/);
  assert.match(servicesPage, /getVendorServices\(vendor\.id, showArchived, true\)/);
  assert.match(servicesPage, /Services could not be loaded/);
  assert.match(servicesPage, /onClick=\{loadServices\}/);
  assert.match(vendorClient, /throwOnError = false/);
  assert.match(vendorClient, /if \(error && throwOnError\) throw new Error\('Could not load vendor services'\)/);
});

test('vendor product filters discard stale responses and show read failures separately from an empty catalogue', () => {
  assert.match(productsPage, /const loadProducts = useCallback/);
  assert.match(productsPage, /\}, \[vendor\?\.id, showArchived\]\);/);
  assert.match(productsPage, /requestId === loadRequestId\.current/);
  assert.match(productsPage, /getVendorProducts\(vendor\.id, showArchived, true\)/);
  assert.match(productsPage, /Products could not be loaded/);
  assert.match(productsPage, /onClick=\{loadProducts\}/);
  assert.match(vendorClient, /throwOnError = false/);
  assert.match(vendorClient, /if \(error && throwOnError\) throw new Error\('Could not load vendor products'\)/);
});

test('vendor settings reads distinguish missing rows from read errors and block saving until verified', () => {
  assert.match(vendorClient, /export async function getVendorSettings[\s\S]*?if \(error\) throw new Error\('Could not load vendor settings'\)/);
  assert.match(settingsPage, /const loadSettings = useCallback/);
  assert.match(settingsPage, /\}, \[vendor\?\.id\]\);/);
  assert.match(settingsPage, /requestId !== loadRequestId\.current/);
  assert.match(settingsPage, /setSettings\(null\)/);
  assert.match(settingsPage, /loadSettings\(\);\s*return \(\) => \{ loadRequestId\.current \+= 1; \};/);
  assert.match(settingsPage, /saving is disabled until they can be verified/);
  assert.match(settingsPage, /disabled=\{saving \|\| dataLoading \|\| loadError\}/);
  assert.match(settingsPage, /onClick=\{loadSettings\}/);
});

test('vendor analytics reloads by vendor identity and discards stale responses', () => {
  assert.match(analytics, /const loadAnalytics = useCallback/);
  assert.match(analytics, /\}, \[vendor\?\.id\]\);/);
  assert.match(analytics, /requestId === requestSequence\.current/);
  assert.match(analytics, /return \(\) => \{ requestSequence\.current \+= 1; \};/);
  assert.match(analytics, /Analytics could not be loaded/);
  assert.match(analytics, /onClick=\{loadAnalytics\}/);
});

test('vendor verification history clears on identity changes and distinguishes read errors from empty history', () => {
  assert.match(verification, /const loadVerificationRequests = useCallback/);
  assert.match(verification, /\.eq\('user_id', userId\)/);
  assert.match(verification, /requestId !== historyRequestId\.current/);
  assert.match(verification, /setVerificationRequests\(\[\]\);\s*loadVerificationRequests\(\)/);
  assert.match(verification, /Verification history could not be loaded/);
  assert.match(verification, /onClick=\{loadVerificationRequests\}/);
  assert.match(verification, /\}, \[loadVerificationRequests\]\);/);
});
