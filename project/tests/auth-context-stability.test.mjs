import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(path.join(projectRoot, 'lib/auth/auth-context.tsx'), 'utf8');

test('auth context keeps user identity stable across unrelated provider renders', () => {
  assert.match(source, /const user = useMemo<AuthUser \| null>/);
  assert.match(source, /const sessionUser = session\?\.user/);
  assert.match(source, /\[sessionUser, profile, studentProfile, vendorProfile\]/);
  assert.match(source, /const value = useMemo<AuthContextValue>/);
  assert.match(source, /\[user, session, loading, signIn, signUp, signInWithGoogle, signOut, signOutAll, resetPassword, updatePassword, changePassword, refreshProfile\]/);
});
