import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('referral dashboard supports direct growth sharing', () => {
  const page = read('app/dashboard/referrals/page.tsx');
  assert.match(page, /Share and grow/);
  assert.match(page, /wa\.me/);
  assert.match(page, /Your UniEco impact is growing/);
  assert.match(page, /There is no limit to the number of genuine students/);
});

test('student profile explains verification progress without blocking referrals', () => {
  const page = read('app/profile/page.tsx');
  assert.match(page, /Complete your student verification/);
  assert.match(page, /Your verified status helps you access student opportunities/);
  assert.match(page, /Use the Academic tab below/);
});

test('health endpoint exposes deployment identity and disables caching', () => {
  const route = read('app/api/health/route.ts');
  assert.match(route, /RAILWAY_GIT_COMMIT_SHA/);
  assert.match(route, /Cache-Control/);
  assert.match(route, /no-store/);
});
