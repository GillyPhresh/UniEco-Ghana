import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFileSync(path.join(projectRoot, relativePath), 'utf8');

test('repeated marketplace and business listing images load lazily and decode asynchronously', () => {
  const cards = read('components/marketplace/product-card.tsx');
  const business = read('components/shared/business-card.tsx');
  const landing = read('components/landing/business-discovery.tsx');
  const campusUpdates = read('components/feed/campus-updates.tsx');
  const nextConfig = read('next.config.js');

  assert.equal((cards.match(/loading="lazy" decoding="async"/g) || []).length, 2);
  assert.match(business, /loading="lazy"\s+decoding="async"/);
  assert.equal((landing.match(/loading="lazy"\s+decoding="async"/g) || []).length, 1);
  assert.match(landing, /<Image[\s\S]*?fill[\s\S]*?sizes=\{i === 0[\s\S]*?loading="lazy"\s+decoding="async"/);
  assert.match(nextConfig, /hostname: 'images\.pexels\.com', pathname: '\/photos\/\*\*'/);
  assert.doesNotMatch(nextConfig, /images:\s*\{\s*unoptimized:\s*true/);
  assert.match(campusUpdates, /<Image src=\{item\.media_url\}[^>]*unoptimized/);
});
