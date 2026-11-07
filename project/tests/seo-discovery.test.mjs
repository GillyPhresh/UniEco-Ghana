import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('root metadata does not apply the homepage canonical URL to every route', () => {
  const layout = read('app/layout.tsx');
  const helper = read('lib/seo/metadata.ts');
  assert.doesNotMatch(layout, /alternates:\s*\{\s*canonical:/);
  assert.match(helper, /alternates:\s*\{\s*canonical\s*\}/);
  assert.match(helper, /openGraph:\s*\{/);
  assert.match(helper, /twitter:\s*\{/);
});

test('social previews reference an existing image asset', () => {
  const metadata = read('app/layout.tsx');
  assert.match(metadata, /unieco-ghana-dark-logo\.png/);
  assert.ok(fs.existsSync(path.join(root, 'public/unieco-ghana-dark-logo.png')));
  assert.doesNotMatch(metadata, /og-image\.png/);
});

test('the sitemap advertises useful public pages and omits account/search URLs', () => {
  const sitemap = read('app/sitemap.ts');
  for (const pathPart of ['/updates', '/for-students', '/for-vendors', '/for-universities']) {
    assert.ok(sitemap.includes(pathPart), `${pathPart} is missing from sitemap`);
  }
  assert.match(sitemap, /getIndexableProductIds/);
  assert.match(sitemap, /getIndexableServiceIds/);
  assert.doesNotMatch(sitemap, /\/signin|\/signup|\/search/);
});

test('anonymous visitors can crawl public discovery pages while account workspaces stay protected', () => {
  const middleware = read('lib/supabase/middleware.ts');
  const memberRoutes = middleware.match(/const memberRoutePrefixes = \[([\s\S]*?)\];/)?.[1] ?? '';
  for (const route of ['/business', '/categories', '/discover', '/events', '/marketplace', '/universities', '/university']) {
    assert.ok(!memberRoutes.includes(`'${route}'`), `${route} should be publicly crawlable`);
  }
  for (const route of ['/dashboard', '/orders', '/profile', '/vendor-dashboard', '/community/saved']) {
    assert.ok(memberRoutes.includes(`'${route}'`), `${route} should remain protected`);
  }
  assert.match(middleware, /X-Robots-Tag', 'noindex, nofollow, noarchive'/);
});

test('account, onboarding, search, and offline pages are excluded from search results', () => {
  const privateMetadata = read('lib/seo/private-metadata.ts');
  assert.match(privateMetadata, /index: false/);
  for (const route of ['signin', 'signup', 'forgot-password', 'verify-email', 'onboarding', 'search', 'community/saved', 'payments/callback', 'auth/reset-password']) {
    assert.ok(fs.existsSync(path.join(root, `app/${route}/layout.tsx`)), `${route} noindex layout is missing`);
  }
  assert.match(read('app/offline/page.tsx'), /robots: \{ index: false/);
  assert.match(read('app/university-admin/page.tsx'), /robots: \{ index: false/);
});

test('product and service listings receive route-specific metadata and structured data', () => {
  const product = read('app/marketplace/product/[id]/layout.tsx');
  const service = read('app/marketplace/service/[id]/layout.tsx');
  assert.match(product, /getPublicProductSeoById/);
  assert.match(product, /'@type': 'Product'/);
  assert.match(product, /priceCurrency/);
  assert.match(service, /getPublicServiceSeoById/);
  assert.match(service, /'@type': 'Service'/);
  assert.match(service, /createPublicPageMetadata/);
  assert.match(read('app/marketplace/product/[id]/page.tsx'), /event_type: 'product_view'/);
  assert.match(read('app/marketplace/service/[id]/page.tsx'), /event_type: 'service_view'/);
  assert.match(read('app/business/[slug]/page.tsx'), /eventType="business_view"/);
  assert.match(read('app/events/[slug]/page.tsx'), /eventType="event_view"/);
  assert.match(read('app/university/[slug]/page.tsx'), /eventType="university_view"/);
});

test('public audience landing pages use distinct, useful copy and remain linked from the homepage', () => {
  for (const route of ['for-students', 'for-vendors', 'for-universities']) {
    const page = read(`app/${route}/page.tsx`);
    assert.match(page, /createPublicPageMetadata/);
    assert.match(page, /SeoLandingPage/);
  }
  const home = read('app/page.tsx');
  assert.match(home, /<h1/);
  assert.match(home, /href="\/for-students"/);
  assert.match(home, /href="\/for-vendors"/);
});
