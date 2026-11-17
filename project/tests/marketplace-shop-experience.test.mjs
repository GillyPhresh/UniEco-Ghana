import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const read = (name) => readFileSync(name, 'utf8');
function loadTypeScript(filename, mocks = {}) {
  const code = ts.transpileModule(read(filename), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const mod = { exports: {} };
  const importFrom = (name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name.startsWith('@/')) return loadTypeScript(name.slice(2) + '.ts', mocks);
    if (name.startsWith('.')) return loadTypeScript(path.join(path.dirname(filename), name + '.ts'), mocks);
    throw new Error('Unexpected import: ' + name);
  };
  new Function('module', 'exports', 'require', code)(mod, mod.exports, importFrom);
  return mod.exports;
}

const catalog = loadTypeScript('lib/marketplace/catalog.ts');
const maps = loadTypeScript('lib/maps.ts');
const verifiedStore = {
  id: 'shop', business_name: 'Test Shop',
  gps_latitude: 5.654, gps_longitude: -0.189,
  location_place_id: 'ChIJLocal', location_public_visibility: 'business_location',
  location_verification_status: 'verified', location: { address_line: '1 Test Road', city: 'Accra' },
};

test('catalogue media accepts licensed local assets and public storage, without arbitrary URLs', () => {
  const valid = '/assets/marketplace/fresh/shop.webp';
  const stored = 'https://project.supabase.co/storage/v1/object/public/products/photo.jpg';
  assert.deepEqual(catalog.catalogPhotos(valid, [valid, stored, 'https://bad.example/photo.jpg',
    'javascript:alert(1)', '//foo.example/photo.webp', '/assets/../photos/image.png', '/assets/%2e%2e/x.png',
    'https://project.supabase.co/storage/v1/object/sign/private-photo.jpg', null]), [valid, stored]);
  for (const photo of ['shop', 'food', 'fashion', 'tech', 'beauty', 'print']) {
    assert.ok(readFileSync(`public/assets/marketplace/fresh/${photo}.webp`).subarray(8, 12).equals(Buffer.from('WEBP')));
  }
});

test('display and price sorting honor the discounted amount, including a zero discount price', () => {
  const discounted = { id: 'c', price: 25, discount_price: 15 };
  const regular = { id: 'b', price: 20 };
  const tied = { id: 'a', price: 15 };
  assert.equal(catalog.catalogPrice({ price: 25, discount_price: 0 }), 0);
  assert.equal(catalog.formatCatalogPrice(12.5, 'GHS'), 'GH₵12.50');
  assert.deepEqual([regular, discounted, tied].sort((a,b) => catalog.compareCatalogPrice(a,b)).map(x=>x.id), ['a','c','b']);
  assert.deepEqual([regular, discounted, tied].sort((a,b) => catalog.compareCatalogPrice(a,b,true)).map(x=>x.id), ['b','a','c']);
  assert.deepEqual(catalog.catalogRange(479, 32), { start: 479, end: 479, size: 1 });
});

test('directions use public verified pins and the Google Maps Place ID parameter', () => {
  const destination = catalog.publicShopDestination(verifiedStore);
  const url = new URL(maps.getGoogleMapsDirectionsUrl(destination));
  assert.equal(url.origin, 'https://www.google.com');
  assert.equal(url.searchParams.get('destination_place_id'), 'ChIJLocal');
  assert.equal(url.searchParams.get('destination'), '5.654,-0.189');
  assert.equal(url.searchParams.has('origin'), false);
  for (const visibility of ['private', 'pickup_only', 'service_area', null]) {
    assert.equal(catalog.publicShopDestination({ ...verifiedStore, location_public_visibility: visibility }), null);
  }
  assert.equal(catalog.publicShopDestination({ ...verifiedStore, location_verification_status: 'pending_review' }), null);
  assert.equal(catalog.publicShopDestination({ ...verifiedStore, gps_latitude: 0, gps_longitude: 0, location: null, location_place_id: null }), null);
});

test('nearby results use actual distance, skip private pins and stay within the radius', () => {
  const origin = { latitude: 5.65, longitude: -0.19 };
  const near = { ...verifiedStore, id: 'near', gps_latitude: 5.652 };
  const far = { ...verifiedStore, id: 'far', gps_latitude: 6.5 };
  const pickup = { ...near, id: 'pickup', location_public_visibility: 'pickup_only' };
  const ranked = catalog.findNearbyShops([verifiedStore, far, pickup, near], origin);
  assert.deepEqual(ranked.map(x => x.shop.id), ['near', 'shop']);
  assert.ok(ranked[0].distance < ranked[1].distance);
  assert.deepEqual(catalog.findNearbyShops([near], {latitude:100,longitude:0}), []);
});

function cartFixture(entries = [], stock = 5) {
  const writes = [];
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: 'buyer' } } }) },
    from(table) {
      let operation = 'read';
      const builder = {
        select: () => builder, eq: () => builder,
        update(payload) { operation = 'update'; writes.push({ table, operation, payload }); return builder; },
        insert(payload) { operation = 'insert'; writes.push({ table, operation, payload }); return builder; },
        maybeSingle: () => builder,
        then(resolve) {
          const responses = { carts: { id: 'cart' }, products: { business: { vendor_id: 'shop-a' }, stock },
            services: { business: { vendor_id: 'shop-a' } }, cart_items: entries };
          resolve({ data: operation === 'read' ? responses[table] : null, error: null });
        },
      };
      return builder;
    },
  };
  return { writes, client: loadTypeScript('lib/data/marketplace-client.ts', { '@/lib/supabase/client': { supabase } }) };
}

test('quick add respects stock and existing shop ownership without deleting other items', async () => {
  const line = { id:'item', product_id:'product', quantity:3, save_for_later:false, product: { business:{vendor_id:'shop-a'} } };
  let fixture = cartFixture([{ ...line, product: { business:{vendor_id:'shop-b'} } }]);
  assert.match((await fixture.client.addToCart('product')).error, /one shop at a time/);
  assert.deepEqual(fixture.writes, []);
  fixture = cartFixture([line]);
  assert.match((await fixture.client.addToCart('product', undefined, 3)).error, /stock/);
  assert.deepEqual(fixture.writes, []);
  assert.equal((await fixture.client.addToCart('product', undefined, 2)).error, null);
  assert.deepEqual(fixture.writes[0].payload, { quantity:5, save_for_later:false });
  fixture = cartFixture([{ ...line, save_for_later:true, product:{ business:{vendor_id:'shop-b'} }, product_id:'older' }]);
  assert.equal((await fixture.client.addToCart('product')).error, null);
  assert.equal(fixture.writes[0].operation, 'insert');
});

test('storefront queries are scoped to their seller and reviews are deep-linkable', () => {
  for (const fn of ['getVendorProducts', 'getVendorServices']) {
    const part = read('lib/data/public-queries.ts').split('export async function ' + fn)[1].split('export async function')[0];
    assert.match(part, /business:businesses!inner/);
    assert.match(part, /\.eq\('business\.vendor_id', vendorId\)/);
    assert.match(part, /\.eq\('is_archived', false\)/);
  }
  assert.match(read('components/marketplace/shop-card.tsx'), /\?tab=reviews#shop-sections/);
  assert.match(read('app/business/[slug]/page.tsx'), /canMap \? getVendorLocation\(vendor.id\) : Promise.resolve\(null\)/);
  const service = read('app/marketplace/service/[id]/page.tsx');
  assert.doesNotMatch(service, /type="(?:date|time)"/);
  assert.match(service, /router\.push\('\/checkout'\)/);
});
