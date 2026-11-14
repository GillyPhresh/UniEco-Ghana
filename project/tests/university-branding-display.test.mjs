import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
const directory = fs.readFileSync(path.join(root, 'components/universities/university-directory.tsx'), 'utf8');
const landing = fs.readFileSync(path.join(root, 'components/landing/university-section.tsx'), 'utf8');
const detail = fs.readFileSync(path.join(root, 'app/university/[slug]/page.tsx'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'data/university-branding.json'), 'utf8'));
const showcase = fs.readFileSync(path.join(root, 'components/universities/university-media.tsx'), 'utf8');

test('verified local university branding takes priority over stale remote wordmarks', () => {
  assert.match(directory, /localBranding\.logoUrl \|\| university\.logo_url/);
  assert.match(landing, /localBranding\.logoUrl \|\| uni\.logo_url/);
  assert.match(detail, /localBranding\.logoUrl \|\| university\.logo_url/);
});

test('visible problematic universities use square official asset records', () => {
  const slugs = {
    'academic-city-university': 'academic-city-university',
    'accra-metropolitan-university': 'accra-metropolitan-university',
    aamusted: 'aamusted',
    'accra-institute-of-technology': 'accra-institute-of-technology',
    'accra-technical-university': 'atu',
    'african-university-of-communication-and-business': 'african-university-of-communication-and-business',
  };

  for (const [slug, manifestKey] of Object.entries(slugs)) {
    const logo = manifest[manifestKey].logo;
    assert.equal(logo.score, 100, `${slug} should use an explicit official source`);
    assert.equal(logo.selection, 'explicit_official_source', `${slug} should use the explicit source marker`);
  }
});

test('GIMPA uses its verified official crest without implying an unverified campus image', () => {
  const gimpa = manifest.gimpa;
  assert.equal(gimpa.status, 'verified_assets_downloaded');
  assert.equal(gimpa.logo.selection, 'explicit_official_source');
  assert.match(gimpa.logo.sourceUrl, /^https:\/\/gimpa\.edu\.gh\//);
  assert.equal(gimpa.campus, null);
  assert.equal(gimpa.campusGallery.length, 6);
  assert.ok(fs.existsSync(path.join(root, 'public', gimpa.logo.path)));
  for (const image of gimpa.campusGallery) {
    assert.match(image.sourcePage, /^https:\/\/gimpa\.edu\.gh\/2026\/11\/13\//);
    assert.match(image.sourceUrl, /^https:\/\/gimpa\.edu\.gh\//);
    assert.ok(image.path.endsWith('.webp'));
    assert.ok(fs.existsSync(path.join(root, 'public', image.path)));
  }
});

test('new college profiles use verified school-branded logos and real campus images', () => {
  for (const [slug, galleryCount, officialHost] of [
    ['christ-the-teacher-college-of-education-kumasi', 3, 'ctce\\.edu\\.gh'],
    ['enchi-college-of-education-enchi', 3, 'enchicoe\\.edu\\.gh'],
    ['kibi-college-of-education-kibi', 5, 'kpce\\.edu\\.gh'],
    ['peki-college-of-education', 4, 'pekicoe\\.edu\\.gh'],
    ['savannah-college-of-education', 4, 'savce\\.edu\\.gh'],
    ['ola-college-of-education', 4, 'olacoe\\.edu\\.gh'],
  ]) {
    const school = manifest[slug];
    assert.equal(school.status, 'verified_assets_downloaded');
    assert.equal(school.campusGallery.length, galleryCount);
    assert.equal(school.logo.selection, 'explicit_official_source');
    assert.match(school.logo.sourcePage, new RegExp(`^https://${officialHost}/`));
    for (const asset of [school.logo, ...school.campusGallery]) {
      assert.ok(fs.existsSync(path.join(root, 'public', asset.path)), `missing ${slug} asset ${asset.path}`);
    }
  }
});

test('school profile carousel receives and rotates verified official gallery photos', () => {
  assert.match(detail, /campusGallery=\{localBranding\.campusGallery\.map/);
  assert.match(showcase, /campusGallery = \[\]/);
  assert.match(showcase, /Official campus gallery/);
  assert.match(showcase, /const slides = \[\.\.\.campusStories, \.\.\.stories\]\.slice\(0, 12\)/);
  const yamfo = manifest['college-of-health-yamfo'];
  assert.ok(yamfo.logo?.path, 'Yamfo has its official local emblem');
  assert.ok(yamfo.campusGallery.length >= 6, 'Yamfo has several official gallery photos');
  for (const asset of [yamfo.logo, yamfo.campus, ...yamfo.campusGallery].filter(Boolean)) {
    assert.ok(fs.existsSync(path.join(root, 'public', asset.path)), `missing local Yamfo asset ${asset.path}`);
  }
});
