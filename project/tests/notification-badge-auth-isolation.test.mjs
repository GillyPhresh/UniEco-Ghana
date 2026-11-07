import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(path.join(projectRoot, 'components/layout/site-header.tsx'), 'utf8');

test('site notification badge clears on logout and ignores requests from a prior account', () => {
  assert.match(source, /setUnreadNotifs\(0\)/);
  assert.match(source, /let active = true/);
  assert.match(source, /if \(active\) setUnreadNotifs\(count\)/);
  assert.match(source, /return \(\) => \{ active = false; \}/);
  assert.match(source, /\[user\?\.id\]/);
  assert.match(source, /count=\{user \? unreadNotifs : 0\}/);
});
