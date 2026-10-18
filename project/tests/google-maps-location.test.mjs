import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Google Maps integration fails safely without claiming configuration', () => {
  const source = read('components/maps/google-map.tsx');
  const config = read('lib/maps.ts');
  assert.match(config, /NEXT_PUBLIC_GOOGLE_MAPS_API_KEY/);
  assert.match(source, /Google Maps is not configured for this deployment/);
  assert.match(source, /libraries=places/);
  assert.match(source, /places\.Autocomplete/);
});

test('directions use the official Maps URL format and encoded destinations', () => {
  const source = read('lib/maps.ts');
  assert.match(source, /https:\/\/www\.google\.com\/maps\/dir\/\?\$\{params\.toString\(\)\}/);
  assert.match(source, /new URLSearchParams\(\{ api: '1', destination: destinationValue \}\)/);
  assert.match(source, /encodeURIComponent\(destination\.placeId\)/);
});

test('vendor locations distinguish owner submission from UniEco verification', () => {
  const source = read('supabase/migrations/20261018120000_0109_google_maps_vendor_locations.sql');
  assert.match(source, /location_verification_status/);
  assert.match(source, /pending_review/);
  assert.match(source, /p_latitude NOT BETWEEN -90 AND 90/);
  assert.match(source, /p_longitude NOT BETWEEN -180 AND 180/);
  assert.match(source, /owner_id=auth\.uid\(\)/);
  assert.match(source, /review_vendor_location/);
});

test('related vendor discovery remains institution-scoped', () => {
  const source = read('lib/data/public-queries.ts');
  assert.match(source, /\.eq\('university_id', vendor\.university_id\)/);
});
