import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { testModules } from './helpers/load-typescript.mjs';

const university = { id: 'school-a', slug: 'school-a', name: 'Test College', short_name: 'Test College', city: 'Sunyani', region: 'Bono' };
const product = { id: 'product-a', name: 'Campus lunch', price: 25, discount_price: null, currency: 'GHS', stock: 3, vendor: { id: 'vendor-a', business_name: 'Campus Kitchen' }, category: 'Food & Drinks' };

async function catalogue(data, error = null) {
  const calls = [];
  const query = {};
  for (const method of ['select', 'eq', 'gt', 'order', 'abortSignal']) query[method] = (...args) => { calls.push([method, ...args]); return query; };
  query.limit = value => { calls.push(['limit', value]); return Promise.resolve({ data, error }); };
  const { getCampusMateProducts } = testModules({
    'server-only': {},
    '@/lib/supabase/public-server': { createPublicServerClient: () => ({ from: table => { assert.equal(table, 'products'); return query; } }) },
  })('lib/data/campus-mate-products.ts');
  return { result: await getCampusMateProducts(university.id), calls };
}

test('Campus Mate product discovery is bounded, campus-scoped, public and orderable', async () => {
  const { vendor, category, ...item } = product;
  const { result, calls } = await catalogue([{ ...item, business: [{ category, vendor: [vendor] }] }]);
  assert.deepEqual(result, { products: [product], unavailable: false });
  for (const pair of [
    ['is_active', true], ['is_archived', false], ['business.is_active', true],
    ['business.vendor.is_active', true], ['business.vendor.is_verified', true],
    ['business.vendor.is_temporarily_closed', false], ['business.vendor.university_id', university.id],
  ]) assert.ok(calls.some(call => call[0] === 'eq' && call[1] === pair[0] && call[2] === pair[1]), pair[0]);
  assert.ok(calls.some(call => call[0] === 'gt' && call[1] === 'stock' && call[2] === 0));
  assert.deepEqual(calls.at(-1), ['limit', 12]);
  assert.doesNotMatch(calls.find(call => call[0] === 'select')[1], /gps|latitude|longitude|email|phone|\*/i);
});

test('catalogue failures remain distinct from an empty campus and invalid prices are not advertised', async () => {
  assert.deepEqual((await catalogue(null, { message: 'database failed' })).result, { products: [], unavailable: true });
  assert.deepEqual((await catalogue([])).result, { products: [], unavailable: false });
  const rows = [NaN, -1, Infinity].map(price => ({ ...product, price, business: { category: product.category, vendor: product.vendor } }));
  assert.deepEqual((await catalogue(rows)).result.products, []);
});

function renderExperience({ selected = false, activeFilter = 'all', items = [product], places = [], preview = false, onSearch } = {}) {
  let state = 0;
  const supplied = { 1: activeFilter, 2: selected ? 'shop-a' : null, 13: preview };
  const hooks = { ...React, useEffect() {}, useMemo: callback => callback(), useRef: value => ({ current: value }),
    useState: value => [Object.hasOwn(supplied, state) ? supplied[state++] : (state++, value), () => {}] };
  const { CampusMateExperience } = testModules({
    react: hooks,
    'next/link': ({ children, ...props }) => React.createElement('a', props, children),
    '@/components/ui/button': { Button: ({ children, asChild, ...props }) => asChild ? children : React.createElement('button', props, children) },
    '@/components/universities/university-media': { UniversityLogo: () => null },
    '@/components/marketplace/catalog-photo': { CatalogPhoto: () => null },
    '@/components/marketplace/product-card': { ProductCard: ({ product: item }) => React.createElement('article', null, item.name + ' GH₵' + item.price) },
    '@/lib/data/marketplace-client': { searchProducts: async options => { onSearch?.(options); return { products: [], total: 0, error: false }; } },
    '@tanstack/react-query': { useQuery: options => {
      if (options.enabled && onSearch) void options.queryFn({ signal: 'test-abort-signal' });
      return { data: options.initialData || { products: [], total: 0, error: false }, isPending: false, isError: false };
    } },
    '@/components/campus-mate/campus-place-card': { CampusPlaceCard: ({ name }) => React.createElement('article', null, name) },
    '@/components/campus-mate/campus-journey-planner': { CampusJourneyPlanner: () => React.createElement('div', null, 'route-preview-mounted') },
  })('components/campus-mate/campus-mate-experience.tsx');
  return renderToStaticMarkup(CampusMateExperience({ university, universities: [university], places,
    products: items, routingEnabled: false }));
}

test('shopping is the landing experience, with genuine products and existing cart, orders and messaging routes', () => {
  const page = renderExperience();
  for (const text of ['What do you need today?', 'Explore by category', 'Shop your campus', 'Campus lunch GH₵25', 'Shops &amp; services']) assert.ok(page.includes(text), text);
  for (const path of ['/cart', '/dashboard/orders', '/dashboard/messages', '/marketplace']) assert.ok(page.includes(`href="${path}"`), path);
  assert.doesNotMatch(page, /route-preview-mounted|Try animation|route access|DEMO|Optional route preview/);
});

test('product categories filter campus stock without inventing replacement offers', () => {
  const page = renderExperience({ activeFilter: 'Pharmacy' });
  assert.doesNotMatch(page, /Campus lunch GH₵25/);
  assert.match(page, /No products match this selection/);
});

test('category discovery queries the full campus catalogue, not just the featured items', () => {
  const calls = [];
  renderExperience({ activeFilter: 'Pharmacy', onSearch: options => calls.push(options) });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { universityId: university.id, category: 'Pharmacy', query: '', limit: 12, signal: 'test-abort-signal' });
});

test('selected shops offer their shop and map directions first; unavailable route previews stay optional', () => {
  const places = [{ id: 'shop-a', kind: 'business', name: 'Campus Kitchen', category: 'Food & Drinks',
    address: 'Public shop street', city: 'Sunyani', region: 'Bono', latitude: 7.34, longitude: -2.33, href: '/business/campus-kitchen' }];
  const page = renderExperience({ selected: true, places });
  assert.match(page, /Your selected place/);
  assert.match(page, /href="\/business\/campus-kitchen"/);
  assert.match(page, /Get directions/);
  assert.match(page, /Travel by/);
  for (const mode of ['walking', 'bicycling', 'two-wheeler', 'driving']) assert.ok(page.includes(`value="${mode}"`), mode);
  assert.match(page, /destination=7\.34%2C-2\.33&amp;travelmode=walking/);
  assert.match(page, /https:\/\/www\.google\.com\/maps\/dir\//);
  assert.doesNotMatch(page, /Optional route preview|route-preview-mounted|Try animation|Recheck route access/);
});

test('empty campuses still offer campus directions and a nearby search before the catalogue', () => {
  const page = renderExperience({ items: [] });
  assert.match(page, /To campus/);
  assert.match(page, /destination=Test\+College%2C\+Sunyani%2C\+Bono%2C\+Ghana/);
  assert.match(page, /Find nearby food/);
  assert.ok(page.indexOf('Find nearby food') < page.indexOf('Shop your campus'));
  assert.doesNotMatch(page, /Discover everyday essentials|Travel by/);
});

test('map-only places never display a stock shop photo, verified badge or an ordering action', () => {
  const { CampusPlaceCard } = testModules({
    'next/link': ({ children, ...props }) => React.createElement('a', props, children),
    '@/components/marketplace/catalog-photo': { CatalogPhoto: () => { throw Error('A map-only place must not display a stock shop photo'); } },
  })('components/campus-mate/campus-place-card.tsx');
  const page = renderToStaticMarkup(React.createElement(CampusPlaceCard, { name: 'Map pharmacy', category: 'Pharmacy',
    source: 'community', verified: true, backdrop: '/assets/campus-mate/pharmacy.webp', onJourney() {} }));
  assert.match(page, /Nearby map listing/);
  assert.match(page, /Directions/);
  assert.doesNotMatch(page, /<img|Verified|Open shop|Order now|Category photo/);
});
