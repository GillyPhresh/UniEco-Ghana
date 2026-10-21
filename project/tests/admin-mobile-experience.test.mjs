import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

test('admin shell provides a mobile-first navigation and connectivity contract', () => {
  const source = read('components/admin/admin-layout.tsx');
  assert.match(source, /navigator\.onLine/);
  assert.match(source, /aria-label="Mobile admin shortcuts"/);
  assert.match(source, /pb-24/);
  assert.match(source, /safe-area-inset-bottom/);
  assert.match(source, /aria-current=\{isActive \? 'page' : undefined\}/);
});

test('high-traffic admin records have a mobile card view and a desktop table view', () => {
  const pages = [
    'app/admin/users/page.tsx',
    'app/admin/students/page.tsx',
    'app/admin/businesses/page.tsx',
    'app/admin/orders/page.tsx',
    'app/admin/payments/page.tsx',
    'app/admin/invoices/page.tsx',
    'app/admin/subscriptions/page.tsx',
    'app/admin/refunds/page.tsx',
    'app/admin/delivery/page.tsx',
    'app/admin/audit-logs/page.tsx',
    'app/admin/reviews/page.tsx',
    'app/admin/trust-safety/page.tsx',
  ];

  for (const page of pages) {
    const source = read(page);
    assert.match(source, /lg:hidden/, `${page} is missing its mobile representation`);
    assert.match(source, /hidden[^"\n]*lg:block/, `${page} is missing its desktop representation`);
  }
});

test('admin dialogs are safe for short mobile viewports and device insets', () => {
  const source = read('components/ui/dialog.tsx');
  assert.match(source, /max-h-\[calc\(100dvh-1rem\)\]/);
  assert.match(source, /overscroll-contain/);
  assert.match(source, /safe-area-inset-bottom/);
});
