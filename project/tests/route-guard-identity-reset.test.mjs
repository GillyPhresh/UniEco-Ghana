import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFileSync(path.join(projectRoot, relativePath), 'utf8');

test('protected route subtrees remount when the authenticated identity or role changes', () => {
  const routeGuard = read('lib/auth/route-guard.tsx');
  const vendorGuard = read('components/vendor/vendor-dashboard-layout.tsx');
  assert.match(routeGuard, /<Fragment key=\{`\$\{user\?\.id \?\? 'anonymous'\}:\$\{user\?\.role \?\? 'none'\}`\}>\{children\}<\/Fragment>/);
  assert.match(vendorGuard, /<Fragment key=\{`\$\{user\.id\}:\$\{user\.role\}`\}>\{children\}<\/Fragment>/);
});
