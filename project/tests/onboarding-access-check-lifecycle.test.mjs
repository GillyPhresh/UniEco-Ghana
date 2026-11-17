import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(path.join(projectRoot, 'app/onboarding/page.tsx'), 'utf8');

test('registration access check depends on account identity and retry, not the visual loading state', () => {
  assert.match(source, /\[loading, router, userId, retry\]/);
  assert.match(source, /let active = true;[\s\S]*if \(!active\) return;[\s\S]*active = false/);
  assert.match(source, /supabase\.rpc\('get_my_registration_access'\)\.abortSignal\(AbortSignal\.timeout\(10_000\)\)/);
});
