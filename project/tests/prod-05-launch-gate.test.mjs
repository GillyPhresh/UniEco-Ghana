import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('sign-in accepts only safe same-origin relative destinations', async () => {
  const source = await read('app/signin/page.tsx');
  assert.match(source, /requestedNext\?\.startsWith\('\/'\)/);
  assert.match(source, /!requestedNext\.startsWith\('\/\/'\)/);
  assert.match(source, /!requestedNext\.includes\('\\\\'\)/);
  assert.match(source, /router\.push\(next\)/);
  assert.doesNotMatch(source, /const next = searchParams\.get\('next'\) \|\| '\/'/);
});

test('canonical metadata uses the configured UniEco Ghana public URL', async () => {
  const [site, dockerfile] = await Promise.all([
    read('lib/constants/site.ts'),
    read('Dockerfile'),
  ]);
  assert.ok(site.includes(String.raw`process.env.UNIECO_PUBLIC_APP_URL?.replace(/\/+$/, '')`));
  assert.match(site, /\|\| 'https:\/\/uniecoghana\.com'/);
  assert.doesNotMatch(site, /https:\/\/uniecghana\.com|https:\/\/www\.uniecoghana\.com/);
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

test('www traffic is redirected to the canonical custom domain', async () => {
  const middleware = await read('middleware.ts');
  assert.match(middleware, /hostname === 'www\.uniecoghana\.com'/);
  assert.match(middleware, /canonicalUrl\.hostname = 'uniecoghana\.com'/);
  assert.match(middleware, /NextResponse\.redirect\(canonicalUrl, 308\)/);
});
