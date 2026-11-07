import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(path.join(projectRoot, 'components/communication/event-reminder-button.tsx'), 'utf8');

test('event reminder state follows the authenticated identity and ignores stale loads', () => {
  assert.match(source, /useAuth\(\)/);
  assert.match(source, /\[eventId, user\?\.id\]/);
  assert.match(source, /\[authLoading, loadReminders\]/);
  assert.match(source, /setReminders\(\[\]\)/);
  assert.match(source, /requestGeneration\.current === generation/);
  assert.match(source, /disabled=\{toggling \|\| !user\}/);
});
