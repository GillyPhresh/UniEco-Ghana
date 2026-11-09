import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('the logo uses its white-detail artwork only for dark mode on phones', () => {
  const styles = read('app/globals.css');
  assert.match(styles, /background: url\('\/unieco-mobile-dark-logo\.png'\) left center \/ contain no-repeat/);
  assert.match(styles, /@media \(max-width: 639px\)[\s\S]*?\.dark a\[aria-label="UniEco Ghana home"\] img:first-of-type[\s\S]*?display: none/);
  assert.match(styles, /@media \(max-width: 639px\)[\s\S]*?\.dark a\[aria-label="UniEco Ghana home"\]::after[\s\S]*?display: block/);
  assert.ok(fs.existsSync(path.join(root, 'public/unieco-mobile-dark-logo.png')));
});
