import { officialPublisherUrl, publisherHost, sourceLink } from './public-source-url';

export type ResearchSchool = {
  id: string;
  slug: string;
  name: string;
  official_name: string | null;
  short_name: string | null;
  website_url: string | null;
  curatedWebsite?: string | null;
  curatedNews?: string | null;
};

export type FeedRegistration = {
  id: string;
  label: string;
  university_name: string;
  website_url: string;
  feed_url: string;
  source_domain: string;
  source_kind: 'campus' | 'opportunities';
  enabled: boolean;
};

export type ResearchSource = {
  id: string;
  schoolSlug: string | null;
  label: string;
  website: string | null;
  state: 'ready' | 'missing_source' | 'shared_source' | 'paused';
  registration: FeedRegistration | null;
  registered: boolean;
  seeds: string[];
  hosts: string[];
  directoryHost?: string;
};

export const researchBatchSize = 8;
export const validSourceId = /^[a-z0-9-]{2,48}$/;
export const validSchoolSlug = /^[a-z0-9-]{2,110}$/;
export const campusFeedUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const nameKey = (value: string | null) => (value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

export function schoolSourceId(schoolId: string) {
  return `uni-${schoolId.replaceAll('-', '').slice(0, 20).toLowerCase()}`;
}

function dedupe<T>(values: T[]) { return Array.from(new Set(values)); }

function registrationSource(row: FeedRegistration, schoolSlug: string | null, label: string, curatedNews?: string | null, registered = true): ResearchSource {
  const website = officialPublisherUrl(row.website_url);
  const host = website && publisherHost(website.hostname);
  const hosts = host && (host === row.source_domain || host.endsWith(`.${row.source_domain}`)) ? [host] : [];
  // A reviewed, explicit feed URL may be on another host inside the registered institution domain.
  const explicitFeed = officialPublisherUrl(row.feed_url);
  if (hosts.length && explicitFeed) {
    const feedHost = publisherHost(explicitFeed.hostname);
    if (!hosts.includes(feedHost) && (feedHost === row.source_domain || feedHost.endsWith(`.${row.source_domain}`))) hosts.push(feedHost);
  }
  const state = !row.enabled ? 'paused' : !hosts.length || !validSourceId.test(row.id) ? 'missing_source' : 'ready';
  return {
    id: schoolSlug ? `university-${schoolSlug}` : row.id,
    schoolSlug, label, state, hosts, registered, registration: row,
    website: website?.href ?? null,
    seeds: website && state === 'ready' ? dedupe([curatedNews, row.feed_url, website.href].flatMap((value) => {
      const candidate = sourceLink(value, website.href, hosts);
      return candidate ? [candidate.href] : [];
    })) : [],
  };
}

/** All enabled directory records appear in the plan, even when no source can
 * be trusted. Never infer school identity from a search hit or a shared site. */
export function buildResearchCatalog(schools: ResearchSchool[], rows: FeedRegistration[]): ResearchSource[] {
  const names = schools.map((school) => new Set([school.name, school.official_name, school.short_name, school.slug].map(nameKey).filter(Boolean)));
  const urls = schools.map((school) => officialPublisherUrl(school.website_url) || officialPublisherUrl(school.curatedWebsite));
  const owners = new Map<string, number>();
  const hasCurrentUtas = schools.some((school) => school.slug === 'utas');
  const legacyAlias = (school: ResearchSchool) => hasCurrentUtas && school.slug === 'ckt-utas';
  for (const [index, url] of Array.from(urls.entries())) {
    if (legacyAlias(schools[index])) continue;
    if (!url) continue;
    const host = publisherHost(url.hostname);
    owners.set(host, (owners.get(host) || 0) + 1);
  }

  const explicit = rows.filter((source) => source.source_kind === 'campus');
  const priorities = new Map<string, number>();
  const campus = schools.map((school, index): ResearchSource => {
      const id = schoolSourceId(school.id);
      const website = urls[index];
      const host = website ? publisherHost(website.hostname) : '';
      const shared = Boolean(website && ((owners.get(host) || 0) > 1 || legacyAlias(school)));
      const unconfigured: ResearchSource = {
        id: `university-${school.slug}`, schoolSlug: school.slug, label: school.name,
        website: website?.href || null, state: shared ? 'shared_source' : 'missing_source',
        registered: false, registration: null, seeds: [], hosts: [],
      };
      if (legacyAlias(school)) return unconfigured;
      const named = explicit.filter((row) => names[index].has(nameKey(row.university_name))
        && names.filter((aliases) => aliases.has(nameKey(row.university_name))).length === 1);
      const sameHost = explicit.filter((row) => host && publisherHost(officialPublisherUrl(row.website_url)?.hostname || '') === host);
      const exact = explicit.find((row) => row.id === id);
      const existing = exact
        || (named.length === 1 ? named[0] : undefined)
        || (owners.get(host) === 1 && sameHost.length === 1 ? sameHost[0] : undefined);
      if (existing) {
        priorities.set(school.slug, exact ? 3 : named.length === 1 ? 2 : 1);
        return { ...registrationSource(existing, school.slug, school.name, school.curatedNews),
          directoryHost: host && !shared ? host : undefined };
      }
      if (!website || shared) return unconfigured;
      return { ...registrationSource({
        id, label: (school.short_name || school.name).slice(0, 120),
        university_name: (school.official_name || school.name).slice(0, 160),
        website_url: website.href, feed_url: website.href, source_domain: host, source_kind: 'campus', enabled: true,
      }, school.slug, school.name, school.curatedNews, false), directoryHost: host };
    });
  const publisherGroups = new Map<string, ResearchSource[]>();
  for (const source of campus) {
    if (!source.registration) continue;
    const key = source.registration.source_domain;
    publisherGroups.set(key, [...(publisherGroups.get(key) || []), source]);
  }
  for (const group of Array.from(publisherGroups.values())) {
    if (group.length < 2) continue;
    const score = (source: ResearchSource) => priorities.get(source.schoolSlug || '') || 0;
    const sorted = group.slice().sort((a, b) => score(b) - score(a));
    const primary = score(sorted[0]) > score(sorted[1]) ? sorted[0] : null;
    for (const entry of group) {
      if (entry === primary) continue;
      entry.state = 'shared_source';
      entry.registered = false;
      entry.registration = null;
      entry.hosts = [];
      entry.seeds = [];
    }
  }
  return [
    ...campus,
    ...rows.filter((row) => row.source_kind === 'opportunities').map((row) => registrationSource(row, null, row.label)),
  ];
}
