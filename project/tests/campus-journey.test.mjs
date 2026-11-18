import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { testModules } from './helpers/load-typescript.mjs';

const load = testModules();
const { decodeRouteShape, parseJourneyRequest, parseValhallaRoute, journeyModes } = load('lib/campus-mate/journey.ts');
const { projectJourney, measureDiagram } = load('lib/campus-mate/route-diagram.ts');
const { getGoogleMapsDirectionsUrl } = load('lib/maps.ts');
const from = { latitude: 5.648, longitude: -0.188 };
const to = { latitude: 5.657, longitude: -0.186 };
const shape = [from, { latitude: 5.650, longitude: -0.186 }, to];
const input = { mode: 'walk', from, to };

function polyline(points) {
  let last = [0, 0];
  let encoded = '';
  for (const point of points) {
    const next = [Math.round(point.latitude * 1_000_000), Math.round(point.longitude * 1_000_000)];
    for (let i = 0; i < 2; i++) {
      const delta = next[i] - last[i];
      let n = delta < 0 ? -2 * delta - 1 : 2 * delta;
      while (n >= 32) { encoded += String.fromCharCode((n & 31) + 95); n >>>= 5; }
      encoded += String.fromCharCode(n + 63);
    }
    last = next;
  }
  return encoded;
}

const valhalla = { trip: { units: 'kilometers', summary: { length: 1.4, time: 1100 }, legs: [{
  shape: polyline(shape), maneuvers: [{ instruction: 'Turn left', length: .3 }],
}] } };

test('four exact routing profiles and mode-aware Google handoff', () => {
  assert.deepEqual(Object.values(journeyModes).map(mode => mode.costing), ['pedestrian', 'bicycle', 'motorcycle', 'auto']);
  for (const mode of Object.values(journeyModes)) {
    const href = new URL(getGoogleMapsDirectionsUrl(to, undefined, mode.google));
    assert.equal(href.origin, 'https://www.google.com');
    assert.equal(href.searchParams.get('travelmode'), mode.google);
    assert.equal(href.searchParams.has('origin'), false);
  }
});

test('route inputs are bounded to different local points and cannot choose a provider', () => {
  assert.deepEqual(parseJourneyRequest({ ...input, endpoint: 'https://example.test' }), input);
  for (const invalid of [
    { ...input, mode: '__proto__' }, { ...input, to: from },
    { ...input, to: { latitude: 45, longitude: 20 } },
    { ...input, to: { latitude: 10, longitude: 0 } },
    { ...input, to: { latitude: '5.654', longitude: 0 } },
    { ...input, from: { latitude: Infinity, longitude: 0 } },
  ]) assert.equal(parseJourneyRequest(invalid), null);
});

test('decode provider geometry, reject malformed paths and route endpoints far from the chosen pins', () => {
  assert.deepEqual(decodeRouteShape(polyline(shape)), shape);
  assert.deepEqual(decodeRouteShape(polyline(shape) + '~'), []);
  assert.deepEqual(decodeRouteShape(polyline([{ latitude: 25, longitude: 0 }])), []);
  assert.deepEqual(parseValhallaRoute(valhalla, input), { shape, metres: 1400, seconds: 1100, steps: [{ metres: 300, instruction: 'Turn left' }] });
  assert.equal(parseValhallaRoute(valhalla, { ...input, to: { ...to, longitude: to.longitude + 0.1 } }), null);
  assert.equal(parseValhallaRoute({ trip: { ...valhalla.trip, units: 'miles' } }, input), null);
});

test('avatar follows cumulative path length, including an uneven path and exact endpoints', () => {
  const points = projectJourney(shape);
  assert.ok(points.every(({ x, y }) => x >= 70 && x <= 570 && y >= 75 && y <= 265));
  const measured = measureDiagram([{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 7 }]);
  assert.deepEqual(measured.at(-2), { x: 0, y: 0 });
  assert.deepEqual(measured.at(0.5), { x: 3, y: 2 });
  assert.deepEqual(measured.at(2), { x: 3, y: 7 });
});

test('the route API rejects unsigned and cross-site callers and sends only bounded trip data', async () => {
  let member = false;
  let activeProvider = true;
  let upstream;
  const api = testModules({
    '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: member ? { id: 'test-member' } : null } }) } }) },
    '@/lib/campus-mate/routing-config.server': { getCampusRoutingEndpoint: () => activeProvider ? new URL('https://example.test/route') : null },
  })('app/api/maps/journey/route.ts');
  const request = (origin = 'https://www.uniecoghana.com', body = input) => Object.assign(new Request('https://www.uniecoghana.com/api/maps/journey', {
    method: 'POST', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }), { nextUrl: new URL('https://www.uniecoghana.com/api/maps/journey') });
  assert.equal((await api.POST(request('https://external.test'))).status, 403);
  assert.equal((await api.POST(request())).status, 401);
  member = true;
  activeProvider = false;
  assert.equal((await api.POST(request())).status, 503);
  activeProvider = true;
  assert.equal((await api.POST(request(undefined, { ...input, from: to }))).status, 400);
  const actualFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    upstream = { url: String(url), options, body: JSON.parse(options.body) };
    return Response.json(valhalla);
  };
  try {
    const res = await api.POST(request(undefined, { ...input, mode: 'motor', provider: 'https://attacker.test' }));
    assert.equal(res.status, 200);
    assert.match(res.headers.get('cache-control'), /no-store/);
    assert.equal(upstream.url, 'https://example.test/route');
    assert.equal(upstream.options.redirect, 'error');
    assert.equal(upstream.body.costing, 'motorcycle');
    assert.deepEqual(Object.keys(upstream.body).sort(), ['costing', 'language', 'locations', 'units']);
  } finally { globalThis.fetch = actualFetch; }
});

test('item-to-store navigation and route animation do not expose private place coordinates', async () => {
  const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
  const [product, campus, planner] = await Promise.all([read('app/marketplace/product/[id]/page.tsx'), read('app/campus-mate/page.tsx'), read('components/campus-mate/campus-journey-planner.tsx')]);
  assert.match(product, /location_public_visibility === 'business_location'[\s\S]*location_verification_status === 'verified'/);
  assert.match(product, /#campus-journey/);
  assert.match(campus, /latitude: publicLocation \?/);
  assert.match(planner, /prefers-reduced-motion/);
  assert.match(planner, /method: 'POST', cache: 'no-store'/);
});
