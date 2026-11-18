import { load } from 'cheerio/slim';
import { oneLine } from './update-copy';
import { articleIdentity, officialPublisherUrl, publisherHost, sourceLink } from './public-source-url';

export type ReusablePhoto = { url: string; credit: string; license: 'CC0' | 'CC BY 4.0' };
export type PhotoEvidence = { background?: ReusablePhoto; portraits: Array<ReusablePhoto & { name: string }> };
type Entry = Record<string, unknown>;
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : [value]).slice(0, 12);
const record = (value: unknown): Entry | undefined => value && typeof value === 'object' && !Array.isArray(value) ? value as Entry : undefined;
const normalize = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const hasType = (node: Entry, ...values: string[]) => list(node['@type']).some((type) => typeof type === 'string' && values.includes(type.replace(/^https?:\/\/schema\.org\//i, '')));
const publicRole = /\b(?:professor|vice.chancellor|chancellor|rector|dean|registrar|lecturer|director|minister|principal|spokesperson|president)\b/i;
const protectedRole = /\b(?:student|pupil|intern|minor|junior|child|trainee)\b/i;
const readingRestrictions = /\b(?:none|noindex|nosnippet|noimageindex|max-snippet\s*:)/i;
const imageSuffix = /\.(?:jpe?g|png|webp|avif)$/i;

export function licensedPhoto(value: unknown, article: URL): ReusablePhoto | undefined {
  const image = record(value);
  if (!image || !hasType(image, 'ImageObject')) return undefined;
  const rawLicense = record(image.license)?.url || record(image.license)?.['@id'] || image.license;
  let legal: URL;
  try { if (typeof rawLicense !== 'string') return undefined; legal = new URL(rawLicense); }
  catch { return undefined; }
  if (!['http:', 'https:'].includes(legal.protocol) || legal.hostname !== 'creativecommons.org' || legal.port || legal.username || legal.password) return undefined;
  let license: ReusablePhoto['license'];
  if (/^\/publicdomain\/zero\/1\.0(?:\/(?:deed(?:\.[\w-]+)?|legalcode)?)?$/.test(legal.pathname)) license = 'CC0';
  else if (/^\/licenses\/by\/4\.0(?:\/(?:deed(?:\.[\w-]+)?|legalcode)?)?$/.test(legal.pathname)) license = 'CC BY 4.0';
  else return undefined;
  const url = sourceLink(image.contentUrl || image.url, article.href, [publisherHost(article.hostname)]);
  if (!url || !imageSuffix.test(url.pathname) || /\b(?:logo|avatar-placeholder|pixel|tracking|favicon)\b/i.test(url.pathname) || url.search) return undefined;
  const creator = record(image.creator);
  const credit = oneLine(image.creditText || creator?.name || image.copyrightHolder && record(image.copyrightHolder)?.name, 64);
  if (!credit || /[<>@]/.test(credit)) return undefined;
  return { url: url.href, credit, license };
}

/** Bind image-level reuse terms to a specific story and to people the publisher
 * identifies as subjects. An Open Graph image, article author, or a name match
 * on a search result never grants consent or establishes image identity. */
export function findFlyerPhotoEvidence(raw: string, article: URL, title: string, excerpt: string): PhotoEvidence {
  const none: PhotoEvidence = { portraits: [] };
  if (/<!\s*ENTITY\b|<!\s*DOCTYPE[^>]*\[/i.test(raw) || !officialPublisherUrl(article.href)) return none;
  const $ = load(raw);
  if ($('meta[name]').slice(0, 80).toArray().some((element) => {
    const el = $(element);
    return /^(?:robots|googlebot|uniecoGhanaCampusResearch)$/i.test(el.attr('name') || '') && readingRestrictions.test(el.attr('content') || '');
  })) return none;
  const canonical = $('link[rel~="canonical"]').first().attr('href');
  const declared = sourceLink(canonical, article.href, [publisherHost(article.hostname)]);
  if (canonical && (!declared || articleIdentity(declared.href) !== articleIdentity(article.href))) return none;
  const nodes: Entry[] = [];
  const gather = (obj: unknown, depth = 0) => {
    if (depth > 4 || nodes.length >= 48) return;
    for (const candidate of list(obj)) {
      if (nodes.length >= 48) break;
      const item = record(candidate);
      if (!item) continue;
      nodes.push(item);
      if (item['@graph']) gather(item['@graph'], depth + 1);
    }
  };
  $('script[type="application/ld+json"]').slice(0, 8).each((_, node) => {
    const raw = $(node).html() || '';
    if (raw.length > 32_000) return;
    try { gather(JSON.parse(raw)); } catch { /* invalid metadata is not proof */ }
  });
  const articleNode = nodes.find((node) => hasType(node, 'Article', 'NewsArticle', 'BlogPosting')
    && typeof node.headline === 'string' && normalize(node.headline) === normalize(title));
  if (!articleNode || articleNode.isAccessibleForFree === false || articleNode.isAccessibleForFree === 'false') return none;
  const resolve = (ref: unknown) => {
    const current = record(ref);
    return current && Object.keys(current).length === 1 && typeof current['@id'] === 'string'
      ? nodes.find((item) => item['@id'] === current['@id'] && item !== current && Object.keys(item).length > 1)
      : current;
  };
  const background = list(articleNode.image).map((value) => licensedPhoto(resolve(value), article)).find(Boolean);
  const storyCopy = ' ' + normalize(title + ' ' + excerpt) + ' ';
  const usedNames = new Set<string>();
  const usedPhotos = new Set(background ? [articleIdentity(background.url)] : []);
  const portraits: PhotoEvidence['portraits'] = [];
  for (const value of [...list(articleNode.about), ...list(articleNode.mentions)]) {
    if (portraits.length === 2) break;
    const person = resolve(value);
    if (!person || !hasType(person, 'Person') || typeof person.jobTitle !== 'string'
      || !publicRole.test(person.jobTitle) || protectedRole.test(person.jobTitle)) continue;
    const name = oneLine(person.name, 52);
    const key = normalize(name);
    if (!/^[\p{L}\p{M}][\p{L}\p{M} .’'-]+$/u.test(name) || key.split(' ').length < 2
      || !storyCopy.includes(' ' + key + ' ') || usedNames.has(key)) continue;
    const photo = list(person.image).map((value) => licensedPhoto(resolve(value), article)).find(Boolean);
    if (!photo || usedPhotos.has(articleIdentity(photo.url))) continue;
    usedPhotos.add(articleIdentity(photo.url));
    usedNames.add(key);
    portraits.push({ ...photo, name });
  }
  return { background, portraits };
}
