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

test('product and service listings receive route-specific metadata and structured data', () => {
  const product = read('app/marketplace/product/[id]/layout.tsx');
  const service = read('app/marketplace/service/[id]/layout.tsx');
  assert.match(product, /getPublicProductSeoById/);
  assert.match(product, /'@type': 'Product'/);
  assert.match(product, /priceCurrency/);
  assert.match(service, /getPublicServiceSeoById/);
  assert.match(service, /'@type': 'Service'/);
  assert.match(service, /createPublicPageMetadata/);
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
