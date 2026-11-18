import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { testModules } from './helpers/load-typescript.mjs';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const { campusMateCategories, findCampusMateCategory, secureCampusPhoto, campusPlaceTelephone, campusPlaceWebsite } =
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

test('community contact actions accept HTTPS sites and clean telephone numbers only', () => {
  assert.equal(campusPlaceWebsite('https://example.com/info'), 'https://example.com/info');
  assert.equal(campusPlaceWebsite('https://member:secret@example.com/'), null);
  assert.equal(campusPlaceWebsite('javascript:alert(1)'), null);
  assert.equal(campusPlaceTelephone('+233 (24) 123-4567'), 'tel:+233241234567');
  assert.equal(campusPlaceTelephone('0241234567;ext=4'), null);
  assert.equal(campusPlaceTelephone('0123'), null);
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
  const [route, experience, planner] = await Promise.all([read('app/campus-mate/page.tsx'), read('components/campus-mate/campus-mate-experience.tsx'),
    read('components/campus-mate/campus-journey-planner.tsx')]);
  assert.match(route, /location_public_visibility === 'business_location' && vendor\.location_verification_status === 'verified'/);
  for (const field of ['address', 'latitude', 'longitude']) {
    assert.match(route, new RegExp(field + ': publicLocation \\?'));
  }
  assert.doesNotMatch(experience, /<iframe|output=embed/);
  assert.match(experience, /<CampusJourneyPlanner/);
  assert.match(planner, /onClick=\{onLocate\}/);
  assert.match(planner, /onClick=\{\(\) => void plan\(\)\}/);
  assert.match(experience, /label: 'Near me', icon: LocateFixed, action: requestLocation/);
  assert.match(experience, /onClick=\{item\.action\}/);
  assert.doesNotMatch(experience, /watchPosition/);
  assert.match(experience, /nearbyRequest\.current\?\.abort\(\)/);
  assert.match(experience, /signal: controller\.signal/);
});
