import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFileSync(path.join(projectRoot, relativePath), 'utf8');

test('customer dashboard reloads for the current user and ignores stale results', () => {
  const dashboard = read('app/dashboard/page.tsx');
  assert.match(dashboard, /const loadDashboardData = useCallback/);
  assert.match(dashboard, /\}, \[user\]\);/);
  assert.match(dashboard, /\[loadDashboardData\]/);
  assert.match(dashboard, /requestVersion\.current !== version/);
  assert.match(dashboard, /return \(\) => \{ requestVersion\.current \+= 1; \}/);
});

test('customer orders refetch on filter changes and discard out-of-order responses', () => {
  const orders = read('app/orders/page.tsx');
  assert.match(orders, /const loadOrders = useCallback/);
  assert.match(orders, /\}, \[filter\]\);/);
  assert.match(orders, /\[loadOrders\]/);
  assert.match(orders, /requestVersion\.current !== version/);
  assert.match(orders, /return \(\) => \{ requestVersion\.current \+= 1; \}/);
});
