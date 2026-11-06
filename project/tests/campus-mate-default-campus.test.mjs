import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('Campus Mate defaults to the signed-in user campus and preserves explicit campus selection', async () => {
  const page = await read('app/campus-mate/page.tsx');
  assert.match(page, /getPreferredUniversityId/);
  assert.match(page, /current_app_role/);
  assert.match(page, /get_my_university_admin_score/);
  assert.match(page, /from\('profiles'\)[\s\S]*select\('university_id'\)/);
  assert.match(page, /from\('student_profiles'\)[\s\S]*select\('university_id'\)/);
  assert.match(page, /universities\.find\(\(university\) => university\.slug === requestedCampus\)[\s\S]*universities\.find\(\(university\) => university\.id === preferredUniversityId\)[\s\S]*universities\[0\]/);
  assert.match(page, /requestedCampus \? null : await getPreferredUniversityId\(\)/);
});
