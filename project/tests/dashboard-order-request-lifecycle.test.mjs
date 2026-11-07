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

test('order detail reloads for identity changes and ignores stale route responses', () => {
  const orderDetail = read('app/orders/[id]/page.tsx');
  assert.match(orderDetail, /const loadOrder = useCallback/);
  assert.match(orderDetail, /\}, \[orderId, user\]\);/);
  assert.match(orderDetail, /requestId !== loadRequestId\.current/);
  assert.match(orderDetail, /return \(\) => \{\s*loadRequestId\.current \+= 1;/);
});

test('vendor order filters discard stale responses and distinguish read failures from empty queues', () => {
  const vendorOrdersPage = read('app/vendor-dashboard/orders/page.tsx');
  const marketplaceClient = read('lib/data/marketplace-client.ts');
  assert.match(vendorOrdersPage, /const loadOrders = useCallback/);
  assert.match(vendorOrdersPage, /\}, \[filter\]\);/);
  assert.match(vendorOrdersPage, /\[loadOrders, vendor\?\.id\]/);
  assert.match(vendorOrdersPage, /requestId === loadRequestId\.current/);
  assert.match(vendorOrdersPage, /Could not load orders/);
  assert.match(vendorOrdersPage, /onClick=\{loadOrders\}/);
  assert.match(marketplaceClient, /if \(vendorError\) throw new Error\('Could not load vendor orders'\)/);
  assert.match(marketplaceClient, /if \(error\) throw new Error\('Could not load vendor orders'\)/);
});
