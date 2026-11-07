import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(path.join(projectRoot, 'app/onboarding/page.tsx'), 'utf8');

test('registration access check uses a ref lock so loading state does not cancel the gate request', () => {
  assert.match(source, /const checkInFlight = useRef\(false\)/);
  assert.match(source, /if \(loading \|\| checkInFlight\.current\) return/);
  assert.match(source, /checkInFlight\.current = true/);
  assert.match(source, /checkInFlight\.current = false/);
  assert.doesNotMatch(source, /if \(loading \|\| checkingAccess\) return/);
  assert.doesNotMatch(source, /\[loading, router, user, retryCount, checkingAccess\]/);
  assert.match(source, /Promise\.race\(\[supabase\.rpc\('get_my_registration_access'\), timedOut\]\)/);
});
