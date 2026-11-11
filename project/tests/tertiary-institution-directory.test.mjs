import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('GTEC college directory migration includes active categorized records with regulator sources', () => {
  const migration = read('supabase/migrations/20261111100000_0196_add_gtec_colleges_directory.sql');
  const institutionIds = [...migration.matchAll(/institutionId=(\d+)/g)].map((match) => match[1]);

  assert.equal(institutionIds.length, 125, 'the captured active GTEC roster should contain 125 institutions');
  assert.equal(new Set(institutionIds).size, institutionIds.length, 'each GTEC record should be unique');
  for (const type of [
    'Public College of Education',
    'Private College of Education',
    'Public Nurses/Health Training College',
    'Private Nurses/Health Training College',
  ]) assert.match(migration, new RegExp(type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(migration, /accreditation_valid_until date/);
  assert.match(migration, /accreditation_source_url text/);
  assert.match(migration, /accreditation_checked_at date/);
  assert.doesNotMatch(migration, /'expired'/i, 'expired institutions must not be imported as active');
  assert.match(migration, /ON CONFLICT DO NOTHING/);
});

test('tertiary directory pages identify institution types and link accreditation claims to GTEC', () => {
  const directory = read('app/universities/page.tsx');
  const profile = read('app/university/[slug]/page.tsx');
  const query = read('lib/data/public-queries.ts');

  assert.match(directory, /Ghana tertiary institution directory/i);
  assert.match(profile, /View institution record at GTEC/);
  assert.match(profile, /accreditation_valid_until/);
  assert.match(query, /accreditation_source_url/);
  assert.match(query, /accreditation_checked_at/);
});
