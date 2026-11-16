import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = async (path) => (await readFile(new URL(path, root), 'utf8')).replace(/\r\n/g, '\n');

test('approval and moderation screens offer quick-fill reasons without removing custom notes', async () => {
  const files = [
    'app/admin/advertisements/page.tsx',
    'app/admin/ai/campus-feed-review.tsx',
    'app/admin/announcements/page.tsx',
    'app/admin/broadcasts/page.tsx',
    'app/admin/businesses/page.tsx',
    'app/admin/community-posts/page.tsx',
    'app/admin/coupons/page.tsx',
    'app/admin/events/page.tsx',
    'app/admin/refunds/page.tsx',
    'app/admin/reviews/page.tsx',
    'app/admin/students/page.tsx',
    'app/admin/trust-safety/page.tsx',
    'app/admin/university-administrators/page.tsx',
    'app/admin/users/page.tsx',
    'app/admin/roles/page.tsx',
    'app/admin/settings/page.tsx',
    'app/admin/verification/students/page.tsx',
    'app/admin/verification/vendors/page.tsx',
  ];
  const screens = await Promise.all(files.map(read));
  for (const [index, source] of screens.entries()) {
    assert.match(source, /DecisionReasonPicker/, `${files[index]} should include standard reason selections`);
  }
  const deletion = await read('components/admin/admin-delete-confirmation.tsx');
  assert.match(deletion, /DecisionReasonPicker/);
  const picker = await read('components/admin/decision-reason-picker.tsx');
  assert.match(picker, /You can edit the filled-in reason below/);
  assert.match(picker, /<select/);
});

test('standard decision reasons are specific enough for audit notes and uniquely selectable', async () => {
  const source = await read('components/admin/decision-reason-picker.tsx');
  const options = [...source.matchAll(/\{ value: '([^']+)', label: '([^']+)', text: '([^']+)' \}/g)];
  assert.ok(options.length >= 40, 'management screens should have useful choices across common workflows');
  const values = options.map((match) => match[1]);
  assert.equal(new Set(values).size, values.length, 'each reason option needs a unique selection value');
  assert.ok(options.every((match) => match[3].trim().length >= 10), 'pre-filled reasons must meet audit minimum length');
});
