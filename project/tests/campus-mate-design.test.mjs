import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { testModules } from './helpers/load-typescript.mjs';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const { campusMateCategories, findCampusMateCategory, secureCampusPhoto } =
  testModules()('lib/campus-mate/categories.ts');

test('photo categories use local WebP assets and credit the photographer', async () => {
  assert.equal(campusMateCategories.length, 8);
  for (const category of campusMateCategories) {
    assert.match(category.photo.source, /^https:\/\/www\.pexels\.com\/photo\//);
    assert.ok(category.photo.creator);
    const bytes = await readFile(new URL('../public' + category.photo.image, import.meta.url));
    assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WEBP');
  }
  assert.equal(findCampusMateCategory('Bank and ATM')?.id, 'Banks & ATMs');
  assert.equal(findCampusMateCategory('Hostel and accommodation')?.id, 'Accommodation');
  assert.equal(findCampusMateCategory('bus_station')?.id, 'Transport');
  assert.equal(findCampusMateCategory('Fire station')?.id, undefined);
});

test('campus artwork can use real campus photos without accepting non-HTTPS or private-looking URLs', () => {
  assert.equal(secureCampusPhoto('/assets/universities/test/campus.webp'), '/assets/universities/test/campus.webp');
  assert.equal(secureCampusPhoto('https://example.edu.gh/campus.jpg'), 'https://example.edu.gh/campus.jpg');
  assert.equal(secureCampusPhoto('https://admin@example.edu.gh/campus.jpg'), null);
  assert.equal(secureCampusPhoto('//example.edu.gh/campus.jpg'), null);
  assert.equal(secureCampusPhoto('/assets/../private.jpg'), null);
  assert.equal(secureCampusPhoto('data:image/png;base64,xxx'), null);
});

test('Campus Mate prefers actual covers, labels category photos and shows community results separately', async () => {
  const [route, experience, card] = await Promise.all([
    read('app/campus-mate/page.tsx'), read('components/campus-mate/campus-mate-experience.tsx'),
    read('components/campus-mate/campus-place-card.tsx'),
  ]);
  assert.match(route, /presentCampus\(selectedUniversity\)/);
  assert.match(route, /getUpcomingCampusEvents\(selectedUniversity\.id/);
  assert.match(route, /image_url: vendor\.cover_image_url,\s*logo_url: vendor\.logo_url/);
  assert.match(card, /listingPhoto \|\| brandLogo \|\| illustration/);
  assert.match(card, /categoryPhoto && .*Category photo/);
  assert.match(card, /verified && source === 'business'/);
  assert.match(experience, /Community map results, not UniEco-verified businesses/);
  assert.match(experience, /OpenStreetMap contributors/);
});

test('directions respect the public-location setting; maps and geolocation are user-initiated', async () => {
  const [route, experience] = await Promise.all([read('app/campus-mate/page.tsx'), read('components/campus-mate/campus-mate-experience.tsx')]);
  assert.match(route, /location_public_visibility === 'business_location' && vendor\.location_verification_status === 'verified'/);
  for (const field of ['address', 'latitude', 'longitude']) {
    assert.match(route, new RegExp(field + ': publicLocation \\?'));
  }
  assert.match(experience, /const \[mapOpen, setMapOpen\] = useState\(false\)/);
  assert.match(experience, /mapOpen && <div[^]*?<iframe/);
  assert.match(experience, /onClick=\{requestLocation\}/);
  assert.doesNotMatch(experience, /setMapTarget\([^)]*location\.latitude/);
  assert.match(experience, /nearbyRequest\.current\?\.abort\(\)/);
  assert.match(experience, /signal: controller\.signal/);
});
