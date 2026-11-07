import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(path.join(projectRoot, 'hooks/use-vendor.ts'), 'utf8');

test('vendor profile loader clears old account data and ignores stale requests', () => {
  assert.match(source, /const requestSequence = useRef\(0\)/);
  assert.match(source, /setVendor\(null\);\s*setLoading\(true\)/);
  assert.match(source, /const v = await getVendorProfile\(\);\s*if \(requestSequence\.current !== requestId\) return;/);
  assert.match(source, /if \(requestSequence\.current === requestId\) setLoading\(false\)/);
  assert.match(source, /return \(\) => \{ requestSequence\.current \+= 1; \};/);
});
