import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(projectRoot, file), 'utf8');

test('install flow supports the modern Web Install API and the Chromium event fallback', () => {
  const hook = read('hooks/use-install-prompt.tsx');
  assert.match(hook, /navigatorWithInstall\.install/);
  assert.match(hook, /beforeinstallprompt/);
  assert.match(hook, /event\.preventDefault\(\)/);
  assert.match(hook, /window\.addEventListener\('appinstalled'/);
  assert.match(hook, /display-mode: standalone/);
  assert.match(read('app/layout.tsx'), /InstallPromptProvider/);
});

test('every browser has a reachable install action and Safari gets a manual install guide', () => {
  const header = read('components/layout/site-header.tsx');
  const installUi = read('components/pwa/install-prompt.tsx');
  const hook = read('hooks/use-install-prompt.tsx');
  assert.match(header, /Install UniEco app/);
  assert.match(header, /installApp\(\)/);
  assert.match(installUi, /inviteVisible/);
  assert.match(hook, /Add to Home Screen/);
  assert.match(hook, /Open as Web App/);
  assert.match(hook, /Add to Dock/);
  assert.match(hook, /Install app/);
});

test('install prompt uses browser consent and a stable manifest identity', () => {
  const hook = read('hooks/use-install-prompt.tsx');
  const manifest = read('app/manifest.ts');
  assert.match(manifest, /id: '\/'/);
  assert.match(manifest, /display: 'standalone'/);
  assert.match(manifest, /unieco-app-icon-20261119-v3-192\.png/);
  assert.match(manifest, /unieco-app-icon-20261119-v3-512\.png/);
  assert.match(manifest, /unieco-app-icon-20261119-v3-maskable-512\.png/);
  const icon = fs.readFileSync(path.join(projectRoot, 'public/unieco-app-icon-20261119-v3-192.png'));
  assert.equal(icon.readUInt32BE(16), 192);
  assert.equal(icon.readUInt32BE(20), 192);
  for (const [file, size] of [['unieco-app-icon-20261119-v3-512.png', 512], ['unieco-app-icon-20261119-v3-maskable-512.png', 512], ['unieco-app-icon-apple-20261119-v3.png', 180], ['unieco-brand-icon-20261119-v3.png', 512]]) {
    const output = fs.readFileSync(path.join(projectRoot, 'public', file));
    assert.equal(output.readUInt32BE(16), size);
    assert.equal(output.readUInt32BE(20), size);
  }
  assert.match(read('app/layout.tsx'), /unieco-app-icon-apple-20261119-v3\.png/);
  assert.match(read('app/layout.tsx'), /default: siteConfig\.name/);
  assert.match(read('app/layout.tsx'), /applicationName: siteConfig\.name/);
  assert.match(read('app/layout.tsx'), /title: siteConfig\.name/);
  assert.match(read('app/page.tsx'), /title: 'UniEco Ghana'/);
  assert.match(hook, /navigatorWithInstall\.install\(\)/);
  assert.match(hook, /promptEvent\.prompt\(\)/);
  assert.match(hook, /dismissedRef/);
});
