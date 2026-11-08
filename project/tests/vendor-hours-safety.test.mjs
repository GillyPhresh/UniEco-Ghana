import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vendorClient = readFileSync(path.join(projectRoot, 'lib/data/vendor-client.ts'), 'utf8');
const hoursPage = readFileSync(path.join(projectRoot, 'app/vendor-dashboard/hours/page.tsx'), 'utf8');
const dashboardPage = readFileSync(path.join(projectRoot, 'app/vendor-dashboard/page.tsx'), 'utf8');

test('business schedule saves atomically without deleting the existing schedule first', () => {
  const saveHelper = vendorClient.slice(
    vendorClient.indexOf('export async function upsertBusinessHours('),
    vendorClient.indexOf('export function getBusinessStatus('),
  );
  assert.match(saveHelper, /hours\.length !== 7/);
  assert.match(saveHelper, /days\.size !== 7/);
  assert.match(saveHelper, /\.upsert\(rows, \{ onConflict: 'vendor_id,day_of_week' \}\)/);
  assert.doesNotMatch(saveHelper, /\.delete\(/);
  assert.doesNotMatch(saveHelper, /\.insert\(/);
});

test('hours editor distinguishes failed reads from an empty schedule and prevents unsafe saves', () => {
  assert.match(vendorClient, /getBusinessHours\(vendorId: string, throwOnError = false\)/);
  assert.match(vendorClient, /getHolidays\(vendorId: string, throwOnError = false\)/);
  assert.match(hoursPage, /getBusinessHours\(vendorId, true\)/);
  assert.match(hoursPage, /getHolidays\(vendorId, true\)/);
  assert.match(hoursPage, /Your schedule could not be loaded/);
  assert.match(hoursPage, /disabled=\{saving \|\| dataLoading \|\| loadError\}/);
  assert.match(hoursPage, /requestId !== loadRequestId\.current/);
  assert.match(hoursPage, /return \(\) => \{ loadRequestId\.current \+= 1; \};/);
});

test('vendor overview does not report the business closed when its hours query fails', () => {
  assert.match(vendorClient, /getBusinessHours\(vendorId, true\)\.catch\(\(\) => null\)/);
  assert.match(dashboardPage, /label: 'Schedule unavailable', color: 'warning'/);
});

test('vendor overview reloads by vendor identity, discards stale requests, and shows a retry state on failure', () => {
  assert.match(dashboardPage, /const loadData = useCallback\(async \(\) =>/);
  assert.match(dashboardPage, /requestId !== loadRequestId\.current/);
  assert.match(dashboardPage, /\[vendorLoading, vendorId, loadData\]/);
  assert.match(dashboardPage, /Your dashboard could not be loaded/);
  assert.match(dashboardPage, /onClick=\{\(\) => \{ void loadData\(\); \}\}/);
});
