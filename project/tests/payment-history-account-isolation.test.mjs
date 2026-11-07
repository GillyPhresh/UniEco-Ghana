import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFileSync(path.join(projectRoot, relativePath), 'utf8');

test('payment history clears on identity/filter changes and ignores stale requests', () => {
  const hook = read('hooks/use-user-payment-history.ts');
  assert.match(hook, /const userId = user\?\.id/);
  assert.match(hook, /setPayments\(\[\]\);[\s\S]*?setError\(null\)/);
  assert.match(hook, /if \(active\) setPayments\(rows\)/);
  assert.match(hook, /return \(\) => \{ active = false; \};/);
  assert.match(hook, /\[userId, search, status, reloadKey\]/);
});

test('payment history surfaces load failures and prevents stale exports on both pages', () => {
  const hook = read('hooks/use-user-payment-history.ts');
  assert.match(hook, /Could not load your payment history/);
  for (const page of [
    'app/dashboard/payment-history/page.tsx',
    'app/vendor-dashboard/payment-history/page.tsx',
  ]) {
    const source = read(page);
    assert.match(source, /useUserPaymentHistory\(search, statusFilter\)/);
    assert.match(source, /error \? \(/);
    assert.match(source, /disabled=\{loading \|\| !!error \|\| payments\.length === 0\}/);
  }
});

test('payment history query reports auth and database errors instead of empty success', () => {
  const source = read('lib/data/payment-client.ts');
  const functionSource = source.slice(source.indexOf('export async function getUserPayments'), source.indexOf('// Payments — Admin'));
  assert.match(functionSource, /if \(authError\) throw new Error/);
  assert.match(functionSource, /if \(error\) throw new Error/);
  assert.match(functionSource, /\.eq\('user_id', user\.id\)/);
});
