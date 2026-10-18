import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('core directions do not depend on a Google Maps API key', () => {
  const source = read('lib/maps.ts');
  assert.doesNotMatch(source, /NEXT_PUBLIC_GOOGLE_MAPS_API_KEY/);
  assert.doesNotMatch(source, /maps\.googleapis\.com/);
  assert.match(source, /getGoogleMapsSearchUrl/);
});

test('directions use the official Maps URL format and encoded destinations', () => {
  const source = read('lib/maps.ts');
  assert.match(source, /https:\/\/www\.google\.com\/maps\/dir\/\?\$\{params\.toString\(\)\}/);
  assert.match(source, /new URLSearchParams\(\{ api: '1', destination: destinationValue \}\)/);
  assert.match(source, /encodeURIComponent\(destination\.placeId\)/);
});

test('vendor locations distinguish owner submission from UniEco verification', () => {
  const source = read('supabase/migrations/20261018130000_0110_external_maps_location_workflow.sql');
  assert.match(source, /location_verification_status/);
  assert.match(source, /pending_review/);
  assert.match(source, /p_latitude NOT BETWEEN -90 AND 90/);
  assert.match(source, /p_longitude NOT BETWEEN -180 AND 180/);
  assert.match(source, /owner_id=auth\.uid\(\)/);
  assert.match(read('supabase/migrations/20261018120000_0109_google_maps_vendor_locations.sql'), /review_vendor_location/);
});

test('vendor link validation accepts only supported Google hosts', () => {
  const source = read('lib/maps.ts');
  assert.match(source, /isSupportedGoogleMapsUrl/);
  assert.match(source, /maps\.app\.goo\.gl/);
  assert.match(source, /parseGoogleMapsLinkCoordinates/);
});

test('related vendor discovery remains institution-scoped', () => {
  const source = read('lib/data/public-queries.ts');
  assert.match(source, /\.eq\('university_id', vendor\.university_id\)/);
});
