import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = async (path) => (await readFile(new URL(path, root), 'utf8')).replace(/\r\n/g, '\n');

test('auth session changes hold route guards until the current profile has loaded', async () => {
  const auth = await read('lib/auth/auth-context.tsx');
  assert.match(auth, /const authRevision = useRef\(0\)/);
  assert.match(auth, /const revision = \+\+authRevision\.current/);
  assert.match(auth, /setLoading\(true\);[\s\S]*?setTimeout\(\(\) => \{[\s\S]*?loadProfileData\(s\.user\.id\)/);
  assert.match(auth, /authRevision\.current === revision\) setLoading\(false\)/);
});

test('registration access gates recover from network errors and have a bounded wait', async () => {
  const [entry, complete] = await Promise.all([
    read('app/onboarding/page.tsx'),
    read('app/onboarding/complete/page.tsx'),
  ]);
  for (const page of [entry, complete]) {
    assert.match(page, /Promise\.race\(\[supabase\.rpc\('get_my_registration_access'\), timedOut\]\)/);
    assert.match(page, /12_000/);
    assert.match(page, /\.catch\(\(\) =>/);
    assert.match(page, /Try again/);
  }
  assert.match(complete, /defaultDashboard/);
  assert.match(complete, /safeInternalPath\([\s\S]*?defaultDashboard\)/);
});

test('public anonymous page requests do not wait on a remote auth lookup', async () => {
  const middleware = await read('lib/supabase/middleware.ts');
  assert.match(middleware, /hasSessionCookie = request\.cookies\.getAll\(\)\.some/);
  assert.match(middleware, /const user = hasSessionCookie\s*\? \(await supabase\.auth\.getUser\(\)\)\.data\.user\s*: null/);
  assert.match(middleware, /if \(isMemberRoute && !user\)/);
});
