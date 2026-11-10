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
  assert.match(source, /aria-label="Refresh management page"/);
  assert.match(source, /window\.location\.reload\(\)/);
  assert.match(source, /RefreshCw className="h-4 w-4" \/> Refresh/);
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

test('app-like feeds, inboxes, dashboards, and task flows omit the marketing footer', () => {
  const appScreens = [
    'app/page.tsx',
    'app/dashboard/page.tsx',
    'app/dashboard/messages/page.tsx',
    'app/dashboard/notifications/page.tsx',
    'app/dashboard/notifications/preferences/page.tsx',
    'app/dashboard/saved/page.tsx',
    'app/profile/page.tsx',
    'app/campus-mate/page.tsx',
    'app/cart/page.tsx',
    'app/checkout/page.tsx',
    'app/orders/page.tsx',
    'app/orders/[id]/page.tsx',
    'app/wishlist/page.tsx',
    'app/university-admin/page.tsx',
    'app/university-admin/apply/page.tsx',
    'app/vendor-dashboard/page.tsx',
    'app/vendor-dashboard/analytics/page.tsx',
    'app/vendor-dashboard/gallery/page.tsx',
    'app/vendor-dashboard/hours/page.tsx',
    'app/vendor-dashboard/messages/page.tsx',
    'app/vendor-dashboard/orders/page.tsx',
    'app/vendor-dashboard/products/page.tsx',
    'app/vendor-dashboard/profile/page.tsx',
    'app/vendor-dashboard/promotions/page.tsx',
    'app/vendor-dashboard/reviews/page.tsx',
    'app/vendor-dashboard/services/page.tsx',
    'app/vendor-dashboard/settings/page.tsx',
    'app/vendor-dashboard/verification/page.tsx',
  ];

  for (const screen of appScreens) {
    assert.doesNotMatch(read(screen), /SiteFooter/, `${screen} should not add the marketing footer to an app workflow`);
  }

  for (const contentPage of ['app/discover/page.tsx', 'app/marketplace/page.tsx', 'app/universities/page.tsx']) {
    assert.match(read(contentPage), /SiteFooter/, `${contentPage} should retain useful public-site links`);
  }
});

test('the document locks layout width to the device without disabling accessibility zoom', () => {
  const layout = read('app/layout.tsx');
  const styles = read('app/globals.css');
  const tabs = read('components/ui/tabs.tsx');
  assert.match(layout, /width: 'device-width'/);
  assert.match(layout, /initialScale: 1/);
  assert.match(layout, /mobile-viewport-safe/);
  assert.match(styles, /\.mobile-viewport-safe/);
  assert.match(styles, /body\s*\{[\s\S]*?width: 100%;[\s\S]*?max-width: 100%;/);
  assert.doesNotMatch(styles, /\.mobile-viewport-safe\s+div\s*,/);
  assert.doesNotMatch(styles, /overflow-wrap: anywhere/);
  assert.match(tabs, /max-w-full/);
  assert.match(tabs, /overflow-x-auto/);
  assert.doesNotMatch(layout, /maximumScale/);
  assert.doesNotMatch(layout, /userScalable:\s*false/);
});

test('the site uses the new readable Inter font throughout the app', () => {
  const layout = read('app/layout.tsx');
  const tailwind = read('tailwind.config.ts');
  assert.match(layout, /import \{ Inter \} from 'next\/font\/google'/);
  assert.match(layout, /const inter = Inter\(/);
  assert.match(tailwind, /'Inter'/);
  assert.doesNotMatch(layout + tailwind, /Montserrat/i);
});

test('homepage metric labels stay on one line at narrow phone widths', () => {
  const hero = read('components/landing/hero.tsx');
  assert.match(hero, /whitespace-nowrap text-\[9px\].*min-\[380px\]:text-\[10px\]/);
});
