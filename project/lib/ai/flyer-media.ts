import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { findFlyerPhotoEvidence, type ReusablePhoto } from './flyer-image-evidence';
import { fetchPublisher, publisherDeadline } from './publisher-fetch';
import { allowsPublisherPath, loadPublisherPolicy } from './publisher-policy';
import { articleIdentity, officialPublisherUrl, publisherHost } from './public-source-url';
import { bundledArticlePhoto, flyerCampusAsset } from './flyer-campus-art';

export type FlyerPhoto = { src: string; description: string; credit: string; attributionRequired?: boolean };
export type FlyerVisual = { background: FlyerPhoto; portraits: Array<FlyerPhoto & { name: string }> };
type Story = { id: string; source_id?: string; source_label?: string; university_name?: string; canonical_url?: string;
  source_kind?: 'campus' | 'opportunities' | 'news'; media_url?: string | null; media_type?: 'image' | 'video' | null;
  title: string; excerpt: string; category?: string };
type PublisherVisual = Pick<Partial<FlyerVisual>, 'background'> & Pick<FlyerVisual, 'portraits'>;
const noPhotos: PublisherVisual = { portraits: [] };
const jpeg = (bytes: Buffer) => 'data:image/jpeg;base64,' + bytes.toString('base64');
const mimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
const formats = ['jpeg', 'png', 'webp', 'heif'];
const pending = new Map<string, Promise<PublisherVisual>>();
const saved = new Map<string, { until: number; data: PublisherVisual }>();

async function fetchStoryVisuals(article: URL, story: Story): Promise<PublisherVisual> {
  const hosts = [publisherHost(article.hostname)];
  const signal = publisherDeadline(16_000);
  const policy = await loadPublisherPolicy(article.href, hosts, signal);
  const allowsPath = (url: URL) => allowsPublisherPath(policy, url);
  const page = await fetchPublisher(article.href, hosts, {
    maxBytes: 660 * 1024, mimeTypes: ['text/html', 'application/xhtml+xml'], signal, allowsPath, timeoutMs: 8_000,
  });
  if (!page.indexable || page.imagesAllowed === false || articleIdentity(page.url) !== articleIdentity(article.href)) return noPhotos;
  const evidence = findFlyerPhotoEvidence(page.bytes.toString('utf8'), new URL(page.url), story.title, story.excerpt,
    { mediaUrl: story.media_type === 'image' ? story.media_url : null, publisher: story.source_label || story.university_name || article.hostname });
  const retrieve = async (photo: ReusablePhoto, portrait = false): Promise<FlyerPhoto | undefined> => {
    try {
      if (!allowsPath(new URL(photo.url))) return undefined;
      const bundled = bundledArticlePhoto(photo.url);
      let bytes: Buffer | undefined;
      if (bundled) {
        try { bytes = await readFile(join(process.cwd(), 'public', bundled)); } catch { /* Try the publisher below. */ }
      }
      if (!bytes) {
        const asset = await fetchPublisher(photo.url, hosts, { maxBytes: 4 * 1024 * 1024, mimeTypes, signal, allowsPath, timeoutMs: 6_000 });
        if (!asset.indexable || asset.imagesAllowed === false || articleIdentity(asset.url) !== articleIdentity(photo.url)) return undefined;
        bytes = asset.bytes;
      }
      const image = sharp(bytes, { limitInputPixels: 16_000_000, pages: 1, failOn: 'warning' });
      const meta = await image.metadata();
      if (!meta.format || !formats.includes(meta.format) || !meta.width || !meta.height
        || meta.width < (portrait ? 170 : 600) || meta.height < (portrait ? 170 : 380) || (meta.pages || 1) > 1) return undefined;
      const raster = await image.timeout({ seconds: 2 }).rotate()
        .resize(portrait ? 300 : 1080, portrait ? 300 : 728, { fit: 'cover', position: portrait ? 'attention' : 'centre' })
        .jpeg({ quality: 84, mozjpeg: true }).toBuffer();
      return { src: jpeg(raster), description: portrait ? 'Publisher portrait' : 'Publisher photo',
        credit: photo.credit + (photo.license === 'Publisher image' ? ' · Source article photo' : ' · ' + photo.license), attributionRequired: photo.license === 'CC BY 4.0' };
    } catch { return undefined; }
  };
  const [background, portraits] = await Promise.all([
    evidence.background && retrieve(evidence.background),
    Promise.all(evidence.portraits.map(async (person) => {
      const photo = await retrieve(person, true);
      return photo ? { ...photo, name: person.name } : undefined;
    })),
  ]);
  return { background, portraits: portraits.flatMap((portrait) => portrait ? [portrait] : []) };
}

function publisherVisuals(story: Story): Promise<PublisherVisual> {
  const article = officialPublisherUrl(story.canonical_url);
  if (!story.source_id || !article || article.pathname === '/') return Promise.resolve(noPhotos);
  const key = JSON.stringify([story.id, article.href, story.title, story.excerpt, story.media_url, story.media_type, story.source_label]);
  const cached = saved.get(key);
  if (cached && cached.until > Date.now()) return Promise.resolve(cached.data);
  const existing = pending.get(key);
  if (existing) return existing;
  // A concurrent flyer must wait for a source-photo slot, not silently cache
  // an unrelated fallback merely because another story is being processed.
  if (pending.size >= 2) return Promise.race(pending.values()).then(() => publisherVisuals(story));
  const task = fetchStoryVisuals(article, story).catch(() => noPhotos).then((data) => {
    if (saved.size >= 24) saved.delete(saved.keys().next().value!);
    saved.set(key, { data, until: Date.now() + (data.background ? 20 * 60_000 : 30_000) });
    return data;
  }).finally(() => { pending.delete(key); });
  pending.set(key, task);
  return task;
}

const localPhotos = {
  campus: { path: 'lecture-room.jpg', description: 'Illustrative photo · Education setting', credit: 'mitbg000 / Pexels' },
  robotics: { path: 'robotics.jpg', description: 'Illustrative photo · Robotics workbench', credit: 'Tanha Tamanna Syed / Pexels' },
  lab: { path: 'laboratory.jpg', description: 'Illustrative photo · Laboratory equipment', credit: 'Tima Miroshnichenko / Pexels' },
  lecture: { path: 'lecture-room.jpg', description: 'Illustrative photo · Lecture room', credit: 'mitbg000 / Pexels' },
} as const;
type LocalPhoto = keyof typeof localPhotos;
const localArt = new Map<LocalPhoto, Promise<FlyerPhoto>>();

export function flyerContextPhoto(title: string, excerpt = '', category?: string): LocalPhoto {
  const topic = title + ' ' + excerpt;
  if (/\b(?:robotics?|mechatronics)\b/i.test(topic)) return 'robotics';
  if (/\b(?:laborator(?:y|ies)|microscop\w*|biotechnolog\w*|chemistry|biomedical)\b/i.test(topic)) return 'lab';
  if (category === 'events' || /\b(?:public lecture|webinar|seminar|classroom|symposium)\b/i.test(topic)) return 'lecture';
  return 'campus';
}

function localPhoto(key: LocalPhoto) {
  const cached = localArt.get(key);
  if (cached) return cached;
  const { path, description, credit } = localPhotos[key];
  const photo = readFile(join(process.cwd(), 'public', 'assets', 'flyers', path))
    .then((bytes) => ({ src: jpeg(bytes), description, credit }));
  localArt.set(key, photo);
  return photo;
}

export async function resolveFlyerVisual(story: Story, allowPublisher = true): Promise<FlyerVisual> {
  const featured = allowPublisher ? await publisherVisuals(story) : noPhotos;
  if (featured.background) return { background: featured.background, portraits: featured.portraits };
  if (story.source_kind === 'news') return { background: await editorialNewsArtwork(), portraits: [] };
  if (story.source_kind === 'opportunities') return { background: await editorialScholarshipArtwork(), portraits: [] };
  const campus = flyerCampusAsset(story);
  if (campus) {
    try {
      const bytes = await sharp(await readFile(join(process.cwd(), 'public', campus.path)), { limitInputPixels: 24_000_000, pages: 1 })
        .rotate().resize(1080, 852, { fit: 'cover' }).jpeg({ quality: 84 }).toBuffer();
      return { background: { src: jpeg(bytes), description: 'Campus file photo · ' + campus.name, credit: campus.credit }, portraits: featured.portraits };
    } catch { /* A missing school asset is never replaced with another school's landmark. */ }
  }
  const context = flyerContextPhoto(story.title, story.excerpt, story.category);
  return { background: await localPhoto(context).catch(() => localPhoto('campus')), portraits: featured.portraits };
}

let editorialArtwork: Promise<FlyerPhoto> | undefined;
function editorialNewsArtwork() {
  editorialArtwork ??= (async () => {
    const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="852" viewBox="0 0 1080 852">
      <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0d2e28"/><stop offset="1" stop-color="#155b45"/></linearGradient></defs>
      <rect width="1080" height="852" fill="url(#bg)"/><circle cx="865" cy="310" r="270" fill="#f1c453" opacity=".12"/>
      <path d="M0 700 300 585l180 84 210-198 390 120v261H0z" fill="#fff" opacity=".06"/>
      <rect x="92" y="150" width="10" height="552" rx="5" fill="#d7b646"/><rect x="132" y="164" width="356" height="16" rx="8" fill="#f5f4ec" opacity=".9"/>
      <rect x="132" y="196" width="250" height="10" rx="5" fill="#f5f4ec" opacity=".4"/><path d="M710 264h182v232H710z" fill="#f5f4ec" opacity=".94"/>
      <path d="M748 310h106M748 344h106M748 378h80M748 412h106M748 446h68" stroke="#155b45" stroke-width="12" stroke-linecap="round" opacity=".8"/>
      <path d="M646 535h294" stroke="#f1c453" stroke-width="8" stroke-linecap="round"/><circle cx="646" cy="535" r="17" fill="#f1c453"/>
      <text x="132" y="626" fill="#fff" font-family="Arial,sans-serif" font-size="35" font-weight="700" letter-spacing="8">UNIECO NEWS DESK</text>
      <text x="132" y="674" fill="#d4e5dc" font-family="Arial,sans-serif" font-size="22" letter-spacing="4">SOURCE-LINKED REPORTING</text>
    </svg>`);
    const bytes = await sharp(svg, { limitInputPixels: 2_000_000 }).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
    return { src: jpeg(bytes), description: 'Editorial illustration', credit: 'UniEco Ghana' };
  })();
  return editorialArtwork;
}

let scholarshipArtwork: Promise<FlyerPhoto> | undefined;
function editorialScholarshipArtwork() {
  scholarshipArtwork ??= (async () => {
    const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="852" viewBox="0 0 1080 852">
      <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#092c24"/><stop offset="1" stop-color="#08715a"/></linearGradient></defs>
      <rect width="1080" height="852" fill="url(#bg)"/><circle cx="850" cy="325" r="270" fill="#f2c84b" opacity=".14"/>
      <path d="M0 710 270 600l190 80 210-200 410 130v242H0z" fill="#fff" opacity=".07"/>
      <path d="M310 240 540 150l230 90v48c0 170-112 286-230 344-118-58-230-174-230-344z" fill="#f6f5ed"/>
      <path d="M345 300h390v225H345z" fill="#fff"/><path d="M540 300v225" stroke="#d5bd61" stroke-width="12"/>
      <path d="M405 360h90M405 405h90M585 360h95M585 405h95M405 470h275" stroke="#0d604a" stroke-width="17" stroke-linecap="round" opacity=".86"/>
      <path d="M410 204 540 120l130 84" fill="none" stroke="#efc94f" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="110" y="688" fill="#fff" font-family="Arial,sans-serif" font-size="48" font-weight="700" letter-spacing="7">SCHOLARSHIP OPPORTUNITY</text>
      <text x="112" y="744" fill="#d8e9df" font-family="Arial,sans-serif" font-size="25" letter-spacing="4">CHECK ELIGIBILITY WITH THE OFFICIAL PROVIDER</text>
    </svg>`);
    const bytes = await sharp(svg, { limitInputPixels: 2_000_000 }).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
    return { src: jpeg(bytes), description: 'Editorial illustration', credit: 'UniEco Ghana' };
  })();
  return scholarshipArtwork;
}
