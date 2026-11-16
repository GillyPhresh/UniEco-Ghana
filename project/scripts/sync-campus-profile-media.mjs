import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

// Fetch only media a maintainer explicitly reviewed on its source page.
// No discovery, runtime proxy, user-provided input, or access to Supabase.
const root = fileURLToPath(new URL('../', import.meta.url));
const profiles = JSON.parse(await readFile(path.join(root, 'data/campus-profiles.json'), 'utf8'));
const args = new Set(process.argv.slice(2));
const check = args.delete('--check');
const replace = args.delete('--replace');
const logosOnly = args.delete('--logos-only');
const limit = 12 * 1024 * 1024;
const host = (url) => url.hostname.replace(/^www\./, '');

function assetUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !url.hostname.includes('.') || /^\d+\./.test(url.hostname)) {
    throw new Error('Only explicit HTTPS source URLs are accepted.');
  }
  return url;
}

async function fetchImage(input, source) {
  let url = assetUrl(input);
  const domain = host(assetUrl(source));
  for (let hop = 0; hop < 4; hop++) {
    if (host(url) !== domain) throw new Error('The asset must use the reviewed publisher hostname.');
    const response = await fetch(url, {
      redirect: 'manual', signal: AbortSignal.timeout(23000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; UniEcoGhana campus profile media audit)', Accept: 'image/*' },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) throw new Error('Redirect has no destination.');
      url = assetUrl(new URL(location, url).href);
      continue;
    }
    if (!response.ok || !response.body || Number(response.headers.get('content-length')) > limit) {
      await response.body?.cancel();
      throw new Error(`Invalid media response (HTTP ${response.status}).`);
    }
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return Buffer.concat(chunks, size);
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        throw new Error('Media exceeds the download limit.');
      }
      chunks.push(value);
    }
  }
  throw new Error('Too many redirects.');
}

for (const slug of args) {
  if (!Object.hasOwn(profiles, slug)) throw new Error(`Unknown campus profile: ${slug}`);
}

const jobs = Object.entries(profiles).flatMap(([slug, school]) => {
  if (args.size && !args.has(slug)) return [];
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error(`Invalid campus slug: ${slug}`);
  const dir = path.join(root, 'public', 'assets', 'universities', slug, 'profile');
  return [
    ...(school.crest ? [{ ...school.crest, kind: 'logo', file: 'logo.webp' }] : []),
    ...(!logosOnly ? (school.photos || []).map((asset, index) => ({ ...asset, kind: 'photo', file: `photo-${index + 1}.webp` })) : []),
  ].map((job) => ({ ...job, slug, dir, target: path.join(dir, job.file) }));
});

let failed = 0;
for (let offset = 0; offset < jobs.length; offset += 5) {
  await Promise.all(jobs.slice(offset, offset + 5).map(async (job) => {
    try {
      const source = assetUrl(job.source);
      if (host(source) !== host(assetUrl(job.url))) throw new Error('Asset and source page must have the same publisher.');
      if (check || (!replace && existsSync(job.target))) {
        const asset = await sharp(job.target).metadata();
        if (asset.format !== 'webp' || !asset.width || !asset.height) throw new Error('Local media is not a readable WebP.');
        console.log(`${job.slug}/${job.file}: ready`);
        return;
      }
      if (job.localSource && !/^campus-gallery-\d+\.optimized\.webp$/.test(job.localSource)) throw new Error('Explicit local source must be an existing gallery image for the same campus.');
      const input = job.localSource ? await readFile(path.join(job.dir, '..', job.localSource)) : await fetchImage(job.url, job.source);
      const image = sharp(input, { limitInputPixels: 36_000_000 });
      const metadata = await image.metadata();
      const logo = job.kind === 'logo';
      if (!['jpeg', 'png', 'webp', 'gif', 'avif', 'heif'].includes(metadata.format)
          || !metadata.width || !metadata.height || Math.min(metadata.width, metadata.height) < (logo ? 85 : 145)) {
        throw new Error('Media has unsupported encoding or insufficient resolution.');
      }
      if (job.crop) image.extract(job.crop);
      if (logo && Number.isFinite(job.crestWidth) && job.crestWidth > 0.1 && job.crestWidth < 0.5) {
        image.extract({ left: 0, top: 0, width: Math.round(metadata.width * job.crestWidth), height: metadata.height });
      }
      if (logo && /^#[0-9a-f]{6}$/i.test(job.background || '')) image.flatten({ background: job.background });
      const output = await image.rotate().resize({ width: logo ? 320 : 1280, height: logo ? 320 : 960, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: logo ? 88 : 80 }).toBuffer();
      await mkdir(job.dir, { recursive: true });
      await writeFile(job.target, output);
      console.log(`${job.slug}/${job.file}: ${output.length} bytes`);
    } catch (error) {
      failed++;
      console.error(`${job.slug}/${job.file}: ${error.cause?.code || error.message}`);
    }
  }));
}

console.log(`${jobs.length - failed} of ${jobs.length} curated assets ready.`);
if (failed) process.exitCode = 1;
