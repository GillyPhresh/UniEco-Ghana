import manifest from '@/data/university-branding.json';
import { getLocalUniversityBranding } from '@/lib/data/university-branding';
import { articleIdentity, officialPublisherUrl, publisherHost } from './public-source-url';

const key = (value?: string) => (value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const isLocalPhoto = (value?: string | null): value is string => typeof value === 'string'
  && /^\/assets\/universities\/[a-z0-9/_-]+(?:\.[a-z0-9_-]+)*\.(?:jpe?g|png|webp|avif)$/i.test(value)
  && !/(?:logo|crest|favicon|poster|flyer)/i.test(value);

/** Reuse a bundled publisher photo only when the current story proves the
 * exact original image URL. A school's gallery is not itself story evidence. */
export function bundledArticlePhoto(url: string) {
  const target = officialPublisherUrl(url);
  if (!target) return null;
  const matches = Object.values(manifest).flatMap(record => [record.campus, ...(record.campusGallery || [])])
    .filter(asset => asset && isLocalPhoto(asset.path) && officialPublisherUrl(asset.sourceUrl)
      && articleIdentity(asset.sourceUrl) === articleIdentity(target.href));
  return matches[0]?.path ?? null;
}

/** School identity comes from the approved story and bundled source manifest,
 * never a fuzzy name match or another school's default photograph. */
export function flyerCampusAsset(story: { source_id?: string; source_label?: string; university_name?: string; canonical_url?: string }) {
  const article = officialPublisherUrl(story.canonical_url);
  const records = Object.values(manifest);
  const names = [story.university_name, story.source_label].map(value => key(value)).filter(Boolean);
  const named = records.filter(record => [record.name, record.shortName].some(value => names.includes(key(value)))
    || story.source_id === record.slug || story.source_id === 'university-' + record.slug);
  const sameHost = (record: typeof records[number]) => {
    const url = officialPublisherUrl(record.sourceUrl);
    return Boolean(article && url && publisherHost(article.hostname) === publisherHost(url.hostname));
  };
  const candidates = named.length ? named.filter(record => !article || sameHost(record)) : records.filter(sameHost);
  if (candidates.length !== 1) return null;
  const school = candidates[0];
  const local = getLocalUniversityBranding(school.slug);
  const path = [local.campusUrl, school.campus?.path].find(isLocalPhoto);
  return path ? { path, name: school.name, credit: school.shortName || school.name } : null;
}
