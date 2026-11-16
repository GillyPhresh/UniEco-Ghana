import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const compiled = new Map();

function loadTypeScript(file) {
  if (compiled.has(file)) return compiled.get(file);
  const module = { exports: {} };
  const result = ts.transpileModule(read(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  });
  new Function('require', 'module', 'exports', result.outputText)(
    (alias) => {
      assert.ok(alias.startsWith('@/'));
      const name = alias.slice(2);
      return name.endsWith('.json') ? JSON.parse(read(name)) : loadTypeScript(`${name}.ts`);
    }, module, module.exports,
  );
  compiled.set(file, module.exports);
  return module.exports;
}

const { presentCampus, presentDirectoryCampus } = loadTypeScript('lib/data/campus-presentation.ts');
const { secureSourceUrl, campusGroup } = loadTypeScript('lib/utils/campuses.ts');
const { campusProgrammeSnapshot } = loadTypeScript('lib/data/campus-programmes.ts');
const { getCampusRegulatorNotice } = loadTypeScript('lib/data/campus-regulator-notices.ts');

function record(overrides) {
  return {
    id: 'example-id', slug: 'example-institution', name: 'Example College', official_name: 'Example College',
    short_name: 'EC', abbreviation: 'EC', city: 'Example Town', region: 'Accra', logo_url: null,
    hero_image_url: null, landmark_image_url: null, logo_alt_text: null, hero_alt_text: null,
    institution_type: 'Public College of Education', ownership_type: 'public', campus_launch_status: 'planned',
    university_aliases: [{ alias: 'Example Teachers’ College' }],
    ...overrides,
  };
}

test('public profile remains usable without images, a website, or launch-status changes', () => {
  const school = record({ website_url: 'javascript:alert(1)', logo_url: '//untrusted.example/logo.svg' });
  const profile = presentCampus(school);
  const card = presentDirectoryCampus(school);
  assert.equal(profile.website, undefined);
  assert.equal(profile.logo, undefined);
  assert.deepEqual(profile.photos, []);
  assert.match(profile.overview, /public college of education in Example Town/);
  assert.match(card.search, /example teachers college/);
  assert.equal(card.group, 'education');
  assert.equal(card.slug, school.slug);
  assert.equal(card.campus_launch_status, 'planned');
  assert.equal(secureSourceUrl('https://a:b@example.com'), undefined);
  assert.equal(secureSourceUrl('/relative'), undefined);
});

test('Abetifi uses the real crest in the logo slot, never as a campus slide', () => {
  const school = record({ slug: 'abetifi-college-of-education-abetifi', name: 'Abetifi College of Education' });
  const profile = presentCampus(school);
  assert.match(profile.logo, /abetifi-college-of-education-abetifi\/profile\/logo\.webp$/);
  assert.match(profile.logoCredit, /^https:\/\/abeticoe\.edu\.gh\//);
  assert.ok(profile.photos.length >= 2);
  assert.ok(!profile.photos.some(({ src }) => src.includes('/campus-gallery-1.')));
});

test('Yamfo has its school site, gallery and news even when DB website is empty, with unique cover slides', () => {
  const school = record({ slug: 'college-of-health-yamfo', name: 'College of Health, Yamfo', official_name: 'College of Health, Yamfo', website_url: null, description: 'GTEC-listed health school. GTEC lists this institution as active as checked on 11 November 2026.' });
  const profile = presentCampus(school);
  assert.equal(profile.website, 'https://www.cohy.edu.gh/');
  assert.equal(profile.gallery, 'https://www.cohy.edu.gh/gallery/');
  assert.equal(profile.news, 'https://www.cohy.edu.gh/news/');
  assert.match(profile.overview, /Ahafo Region/);
  assert.equal(profile.photos[0].sourceUrl, profile.gallery);
  assert.equal(new Set(profile.photos.map(({ src }) => src)).size, profile.photos.length);
  assert.ok(profile.photos.length >= 6);
});

test('protected school branding uploads remain authoritative over local fallbacks', () => {
  const url = 'https://sample.supabase.co/storage/v1/object/public/university-branding/example/emblem.jpg';
  const customHero = 'https://sample.supabase.co/storage/v1/object/public/university-branding/example/cover.jpg';
  const campus = presentCampus(record({ slug: 'academic-city-university', logo_url: url, hero_image_url: customHero }));
  assert.equal(campus.logo, url);
  assert.ok(campus.fallbackLogo?.startsWith('/assets/'));
  assert.equal(campus.photos[0].src, customHero);
  assert.ok(campus.photos[1].src.includes('academic-city-campus'));
});

test('curated logos and photos resolve to tracked local assets with explicit publisher provenance', () => {
  const sources = JSON.parse(read('data/campus-profiles.json'));
  for (const [slug, entry] of Object.entries(sources)) {
    const branding = presentCampus(record({ slug }));
    if (entry.crest) {
      assert.equal(branding.logoCredit, entry.crest.source);
      assert.ok(fs.statSync(path.join('public', branding.logo)).isFile(), `missing crest for ${slug}`);
    }
    for (const [index, image] of (entry.photos ?? []).entries()) {
      assert.match(image.url, /^https:\/\//);
      assert.match(image.source, /^https:\/\//);
      assert.ok(fs.statSync(path.join('public', 'assets', 'universities', slug, 'profile', `photo-${index + 1}.webp`)).isFile(), `missing photo for ${slug}`);
    }
    if (entry.cover) assert.ok(fs.statSync(path.join('public', entry.cover)).isFile(), `missing cover for ${slug}`);
  }
  assert.equal(campusGroup('Private Nurses/Health Training College'), 'health');
  assert.equal(campusGroup('Public Technical University'), 'technical');
});

test('activation changes only enabled planned rows and audits the changes; it grants no permissions', () => {
  const migration = read('supabase/migrations/20261115230000_0201_activate_listed_campus_profiles.sql').replace(/^--.*$/gm, '');
  assert.match(migration, /SET campus_launch_status = 'active', updated_at = now\(\)\s+WHERE is_enabled IS TRUE AND campus_launch_status = 'planned'/);
  assert.match(migration, /INSERT INTO public\.audit_logs[\s\S]*FROM activated/);
  assert.doesNotMatch(migration, /\b(GRANT|DELETE|TRUNCATE|CREATE POLICY|is_verified|accreditation_status)\b/i);
  const holdList = [...migration.matchAll(/'([a-z0-9-]+)'/g)].map((match) => match[1]).filter((slug) => getCampusRegulatorNotice(slug));
  assert.equal(holdList.length, 6);
  for (const slug of holdList) assert.match(getCampusRegulatorNotice(slug).href, /^https:\/\/gtec\.edu\.gh\//);
});

test('GTEC programme details require the same institution record and hide entries past their listed dates', () => {
  const slug = 'abetifi-college-of-education-abetifi';
  const source = 'https://gtec.edu.gh/programmes/?institutionId=726';
  const snapshot = campusProgrammeSnapshot(slug, source, '2026-11-15');
  assert.ok(snapshot.programmes.some(({ programme }) => /primary education/i.test(programme)));
  assert.equal(campusProgrammeSnapshot(slug, source, '2099-01-01'), undefined);
  assert.equal(campusProgrammeSnapshot(slug, 'https://gtec.edu.gh/programmes/?institutionId=727'), undefined);
  assert.equal(campusProgrammeSnapshot(slug, 'https://example.com/programmes/?institutionId=726'), undefined);
});

test('campus events are future and school-specific; campus updates use only approved public views', () => {
  const data = read('lib/data/public-queries.ts');
  const profile = read('app/university/[slug]/page.tsx');
  assert.match(data, /getUpcomingCampusEvents[\s\S]*?\.eq\('is_published', true\)[\s\S]*?\.eq\('university_id', universityId\)[\s\S]*?\.gte\('start_time'/);
  assert.match(data, /getReviewedCampusUpdates[\s\S]*?\.from\('campus_feed_public_sources'\)[\s\S]*?\.from\('campus_feed_public_items'\)[\s\S]*?\.in\('source_id', sourceIds\)/);
  assert.doesNotMatch(profile, /getEventsByUniversity|getAdminCampusFeed/);
  assert.match(profile, /const sourceEvents = discoveries\.filter\([\s\S]*?Date\.parse\(item\.starts_at\) >= now/);
});
