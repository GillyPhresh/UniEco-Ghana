import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('sign-in accepts only safe same-origin relative destinations', async () => {
  const source = await read('app/signin/page.tsx');
  assert.match(source, /safeInternalPath\(requestedNext\)/);
  assert.match(source, /router\.replace\(withNext\('\/onboarding', next\)\)/);
  assert.match(source, /withNext\('\/signup', next\)/);
  assert.doesNotMatch(source, /const next = searchParams\.get\('next'\) \|\| '\/'/);
});

test('canonical metadata uses the configured UniEco Ghana public URL', async () => {
  const [site, dockerfile] = await Promise.all([
    read('lib/constants/site.ts'),
    read('Dockerfile'),
  ]);
  assert.ok(site.includes(String.raw`process.env.UNIECO_PUBLIC_APP_URL?.replace(/\/+$/, '')`));
  assert.match(site, /https:\/\/www\.uniecoghana\.com/);
  assert.doesNotMatch(site, /\|\| 'https:\/\/uniecoghana\.com'/);
  assert.match(dockerfile, /ARG UNIECO_PUBLIC_APP_URL/);
  assert.match(dockerfile, /ENV UNIECO_PUBLIC_APP_URL=\$UNIECO_PUBLIC_APP_URL/);
});

test('robots excludes private user and administration routes', async () => {
  const [robots, serviceWorker] = await Promise.all([
    read('app/robots.ts'),
    read('public/sw.js'),
  ]);
  for (const route of ['/api', '/auth', '/admin', '/dashboard', '/vendor-dashboard', '/profile', '/orders', '/cart', '/checkout', '/payments', '/wishlist', '/onboarding']) {
    assert.ok(robots.includes(`'${route}'`), `robots.txt should disallow ${route}`);
  }
  assert.match(serviceWorker, /NEVER_CACHE_PATTERNS = \[[\s\S]*?'\/wishlist'/);
});

test('root traffic is redirected to the canonical www custom domain', async () => {
  const middleware = await read('middleware.ts');
  assert.match(middleware, /hostname === 'uniecoghana\.com'/);
  assert.match(middleware, /canonicalUrl\.hostname = 'www\.uniecoghana\.com'/);
  assert.match(middleware, /canonicalUrl\.port = ''/);
  assert.match(middleware, /NextResponse\.redirect\(canonicalUrl, 308\)/);
});

test('Search Console verification and Organization metadata are configured safely', async () => {
  const [layout, sitemap, robots] = await Promise.all([
    read('app/layout.tsx'),
    read('app/sitemap.ts'),
    read('app/robots.ts'),
  ]);
  assert.match(layout, /process\.env\.GOOGLE_SITE_VERIFICATION\?\.trim\(\)/);
  assert.match(layout, /verification:\s*googleSiteVerification/);
  assert.match(layout, /'@type': 'Organization'/);
  assert.match(layout, /'@type': 'WebSite'/);
  assert.match(layout, /areaServed/);
  assert.match(sitemap, /getIndexableVendorSlugs/);
  assert.match(sitemap, /getIndexableEventSlugs/);
  assert.match(sitemap, /\$\{base}\/marketplace/);
  assert.match(robots, /sitemap\.xml/);
});
