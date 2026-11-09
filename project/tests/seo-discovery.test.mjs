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

test('search engines and installed apps use the current black-cap UniEco icon', async () => {
  const metadata = read('app/layout.tsx');
  const manifest = read('app/manifest.ts');
  const icon = read('public/unieco-search-icon.svg');
  assert.match(metadata, /unieco-search-icon\.svg/);
  assert.match(metadata, /type: 'image\/svg\+xml', sizes: 'any'/);
  assert.match(manifest, /unieco-search-icon\.svg/);
  assert.match(icon, /<path d="M15 31[^>]+fill="#101820"\/>/);
  assert.ok(fs.statSync(path.join(root, 'public/unieco-search-icon.svg')).size < 2_000);
});

test('the sitemap advertises useful public pages and omits account/search URLs', () => {
  const sitemap = read('app/sitemap.ts');
  for (const pathPart of ['/updates', '/universities', '/for-students', '/for-vendors', '/for-universities']) {
    assert.ok(sitemap.includes(pathPart), `${pathPart} is missing from sitemap`);
  }
  assert.match(sitemap, /getIndexableProductIds/);
  assert.match(sitemap, /getIndexableServiceIds/);
  assert.match(sitemap, /staticIndexableEntries/);
  assert.match(sitemap, /path === '\/discover' \|\| path === '\/categories'[\s\S]*vendors\.length > 0/);
  assert.match(sitemap, /path === '\/marketplace'[\s\S]*products\.length > 0 \|\| services\.length > 0/);
  assert.match(sitemap, /path === '\/events'[\s\S]*events\.length > 0/);
  assert.doesNotMatch(sitemap, /\/signin|\/signup|\/search/);
});

test('empty public directories are crawlable for users but noindexed until they contain real listings', () => {
  const categories = read('app/categories/page.tsx');
  const events = read('app/events/page.tsx');
  const discover = read('app/discover/layout.tsx');
  const marketplace = read('app/marketplace/layout.tsx');
  assert.match(categories, /generateMetadata[\s\S]*hasBusinesses[\s\S]*index: false/);
  assert.match(events, /generateMetadata[\s\S]*events\.length === 0[\s\S]*index: false/);
  assert.match(discover, /getIndexableVendorSlugs\(1\)[\s\S]*index: false/);
  assert.match(marketplace, /getIndexableProductIds\(1\)[\s\S]*getIndexableServiceIds\(1\)[\s\S]*index: false/);
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

test('public audience landing pages remain linked from the discovery hub, not the social home feed', () => {
  for (const route of ['for-students', 'for-vendors', 'for-universities']) {
    const page = read(`app/${route}/page.tsx`);
    assert.match(page, /createPublicPageMetadata/);
    assert.match(page, /SeoLandingPage/);
  }
  const home = read('app/page.tsx');
  const discovery = read('app/discover/page.tsx');
  assert.match(home, /<h1/);
  assert.match(home, /<CampusCommunityFeed\s*\/>/);
  assert.doesNotMatch(home, /Discover Ghana|Browse the marketplace|Explore UniEco Ghana/);
  assert.match(discovery, /href="\/for-students"/);
  assert.match(discovery, /href="\/for-vendors"/);
  assert.match(discovery, /href="\/for-universities"/);
});

test('role-specific footer links lead to indexable landing pages rather than missing homepage anchors', () => {
  const site = read('lib/constants/site.ts');
  for (const path of ['/for-students', '/for-vendors', '/for-universities']) {
    assert.ok(site.includes(`href: '${path}'`), `${path} should be used by site navigation`);
  }
  assert.doesNotMatch(site, /href: '\/#(?:universities|student-benefits|vendor-benefits|university-benefits|faq)'/);
});
