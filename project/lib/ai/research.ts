import { createHash } from 'node:crypto';
import { load } from 'cheerio/slim';
import { articleIdentity, cleanArticleUrl, publisherHost, sourceLink } from './public-source-url';
import { fetchPublisher, publisherDeadline } from './publisher-fetch';
import { allowsPublisherPath, loadPublisherPolicy } from './publisher-policy';
import type { ResearchSource } from './research-catalog';

export const feedCategories = ['news', 'events', 'opportunities', 'research', 'notices', 'campus_life'] as const;
export type FeedCategory = (typeof feedCategories)[number];
export type ResearchLead = {
  source_id: string;
  source_item_key: string;
  title: string;
  excerpt: string;
  canonical_url: string;
  published_at: string | null;
  media_url: string | null;
  media_type: 'image' | 'video' | null;
  category: FeedCategory;
};
export type ScanResult = { state: ResearchSource['state'] | 'unreachable' | 'no_updates' | 'found'; leads: ResearchLead[]; verifiedArticleKeys?: string[] };
type Candidate = { url: string; title: string; excerpt?: string; date?: string | null; rank: number; media?: Media };
type Media = { url: string; type: 'image' | 'video' };
type Html = ReturnType<typeof load>;

const htmlOptions = { xml: { xmlMode: false } } as const;
const markupTypes = ['text/html', 'application/xhtml+xml', 'application/rss+xml', 'application/atom+xml', 'application/xml', 'text/xml'];
const stopPage = /(?:^|\/)(?:login|log-in|logout|wp-admin|wp-login\.php|account|cart|feed|rss|wp-json|tag|author|category|page|privacy|contact|about|programmes?|departments?)(?:\/|$)/i;
const updatePath = /\/(?:news(?:-and-events)?|events?|updates?|notice(?:s|-board)?|announcements?|bulletin|post|article|stories|press|\d{4}\/\d{2})(?:\/|-(?:single|details)[.]php$)/i;
const newsIndex = /\/(?:news(?:-and-events)?|events?|updates?|news-events|announcements?|notices?|bulletin|category\/(?:news|events))\/?$/i;
const genericTitle = /^(?:home|more|read more|learn more|continue reading|click here|latest news|school news|all news|all events|view all|see all|news(?: and events)?|events|announcements|admissions|apply now|calendar|skip to content)\W*$/i;
const relevant = /\b(?:news|event|campus|students?|admission|scholarship|conference|workshop|research|notice|deadline|ceremony|convocation|college|university|graduation|orientation|matriculation|training|opportunit)/i;
const noAssetPage = /\.(?:pdf|png|jpe?g|webp|gif|svg|docx?|xlsx?|zip|mp4|webm|mov)(?:$|[?#])/i;

export function cleanPublisherText(value: string) {
  return value.normalize('NFC')
    .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, ' ')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '')
    .replace(/\bhttps?:\/\/\S+/gi, '')
    .replace(/\s+/g, ' ').trim();
}

const pointLimit = (value: string, max: number) => Array.from(value).slice(0, max).join('');
function headline(value: string) {
  const text = cleanPublisherText(value);
  return genericTitle.test(text) || text.length < 10 || text.split(' ').length < 3 ? '' : pointLimit(text, 220);
}

export function briefExcerpt(value: string, title: string) {
  let text = cleanPublisherText(value);
  if (text.toLowerCase().startsWith(title.toLowerCase())) text = text.slice(title.length).replace(/^[\s:|–—.\-]+/, '');
  if (text.length < 35 || /^(?:skip to content|just another wordpress site|all rights reserved)/i.test(text)) return '';
  const words = text.split(' ');
  const lead = pointLimit(words.slice(0, 24).join(' '), 330);
  return lead.length < text.length ? `${lead.replace(/[.,;:\s]+$/, '')}…` : lead;
}

function publishDate(value: string | null | undefined, now: number) {
  if (!value || value.length > 100 || !/(?:\d{4}-\d{2}-\d{2}|[A-Za-z]{3}\s+\d{4}|\d{4}\s+\d{2}:\d{2}|\b[A-Za-z]{3,9}\s+\d{1,2},\s+\d{4}\b)/.test(value)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) && time <= now + 86_400_000 ? new Date(time).toISOString() : null;
}

function categoryFor(title: string, url: string, national: boolean): FeedCategory {
  if (national || /\b(?:scholarship|internship|studentship|vacanc(?:y|ies)|funding|admission|call for applications|fellowship)\b/i.test(title)) return 'opportunities';
  if (/\b(?:timetable|notice|deadline|registrations?|closure|circular)\b/i.test(title)) return 'notices';
  if (/\b(?:festivals?|workshops?|conferences?|ceremon(?:y|ies)|convocation|webinars?|exhibitions?|matriculation)\b/i.test(title)
    || /\/events?\//i.test(url)) return 'events';
  if (/\b(?:research|laboratory|publication|patent|innovation)\b/i.test(title)) return 'research';
  if (/\b(?:alumni|clubs?|community|sports?|graduation|orientation|student life)\b/i.test(title)) return 'campus_life';
  return 'news';
}

function articleUrl(value: unknown, base: string, source: ResearchSource) {
  const url = sourceLink(value, base, source.hosts);
  if (!url || noAssetPage.test(url.pathname) || /\/(?:login|logout|account|wp-admin|wp-login\.php|checkout)(?:\/|$)/i.test(url.pathname)) return null;
  return cleanArticleUrl(url).href;
}

function mediaCandidate(value: unknown, base: string, source: ResearchSource, type?: Media['type']): Media | undefined {
  // Older official templates emit mixed-content asset links. Attempt only the
  // HTTPS spelling on that same publisher; the thumbnail check still validates TLS.
  const secure = typeof value === 'string' ? value.replace(/^http:\/\//i, 'https://') : value;
  const url = sourceLink(secure, base, source.hosts);
  if (!url || /(?:logo|favicon|placeholder|default[-_](?:image|share)|site[-_]icon|(?:tracking|pixel)\.)/i.test(url.pathname)) return undefined;
  if (/\.(?:mp4|webm|mov|m4v)$/i.test(url.pathname)) return { url: url.href, type: 'video' };
  if (type !== 'video' && /\.(?:jpe?g|png|webp|avif)$/i.test(url.pathname)) return { url: url.href, type: 'image' };
  return undefined;
}

function meta($: Html, names: string[]) {
  for (const name of names) {
    const value = $(`meta[property="${name}"],meta[name="${name}"]`).first().attr('content');
    if (value) return value.trim();
  }
  return '';
}

function allowsSnippets($: Html) {
  return !$('meta[name]').slice(0, 80).toArray().some((node) => {
    const tag = $(node);
    return /^(?:robots|googlebot|uniecoGhanaCampusResearch)$/i.test(tag.attr('name') || '')
      && /\b(?:none|noindex|nosnippet|max-snippet\s*:\s*\d+)\b/i.test(tag.attr('content') || '');
  });
}

function safeMarkup(raw: string) {
  return !/<!\s*ENTITY\b|<!\s*DOCTYPE[^>]*\[/i.test(raw) && !/<!\s*DOCTYPE\s+(?!html(?:\s|>))/i.test(raw);
}

export function parsePublisherIndex(raw: string, page: string, source: ResearchSource, now: number) {
  const candidates: Candidate[] = [];
  const indexes: string[] = [];
  if (!safeMarkup(raw)) return { candidates, indexes, readable: false };
  const xml = /^\s*(?:<\?xml[^>]*\?>\s*)?<(?:rss|feed|rdf:RDF)(?:\s|>)/i.test(raw.replace(/^\uFEFF/, ''));
  if (xml) {
    const $ = load(raw, { xml: true });
    $('item, entry').slice(0, 24).each((_, element) => {
      const entry = $(element);
      const url = articleUrl(entry.find('link[rel="alternate"]').first().attr('href')
        || entry.find('link').first().attr('href') || entry.find('link').first().text(), page, source);
      const title = headline(entry.find('title').first().text());
      if (!url || !title || url === page) return;
      const description = entry.find('description, summary, content').first().text();
      const asset = entry.find('enclosure, media\\:content, media\\:thumbnail').slice(0, 5).toArray()
        .map((node) => mediaCandidate($(node).attr('url'), page, source)).filter((value): value is Media => Boolean(value));
      const date = publishDate(entry.find('pubDate, published, dc\\:date').first().text(), now);
      candidates.push({
        url, title, date, excerpt: briefExcerpt(load(pointLimit(description, 8_000), htmlOptions).text(), title), rank: 8,
        media: asset.find((item) => item.type === 'video') || asset[0],
      });
    });
    return { candidates, indexes, readable: true };
  }
  const $ = load(raw, htmlOptions);
  if (!allowsSnippets($)) return { candidates, indexes, readable: false };
  $('link[rel~="alternate"]').slice(0, 20).each((_, node) => {
    const link = $(node);
    if (!/(?:atom|rss)\+xml/i.test(link.attr('type') || '')) return;
    const url = sourceLink(link.attr('href'), page, source.hosts);
    if (url) indexes.push(url.href);
  });
  $('script, style, template, noscript, footer, form').remove();
  $('a[href]').slice(0, 800).each((_, node) => {
    const anchor = $(node);
    const url = articleUrl(anchor.attr('href'), page, source);
    if (!url || url === page) return;
    const path = new URL(url).pathname;
    const label = cleanPublisherText(anchor.text());
    if (newsIndex.test(path)) { indexes.push(url); return; }
    if (stopPage.test(path) || (anchor.closest('nav, header').length && !anchor.closest('article').length)) return;
    const heading = anchor.closest('h1, h2, h3, h4, article, .entry-title, .post-title, .news-title').length > 0;
    const articleLike = updatePath.test(path) || (heading && relevant.test(label))
      || (source.registration?.source_kind === 'news' && heading && label.length >= 18)
      || (source.registration?.source_kind === 'opportunities' && /\b(?:grant|enterprise|scholarship|training|programme|opportunit)/i.test(label));
    const title = headline(label);
    if (!title || !articleLike || path === '/') return;
    const context = anchor.closest('article, .post, .news-item, .news-card');
    const date = publishDate(context.find('time[datetime]').first().attr('datetime'), now);
    candidates.push({ url, title, date, rank: (heading ? 3 : 1) + (updatePath.test(path) ? 3 : 0) });
  });
  return { candidates, indexes: Array.from(new Set(indexes)), readable: true };
}

export function parsePublisherArticle(raw: string, page: string, source: ResearchSource, lead: Candidate, now: number, verify?: (item: ResearchLead) => void): ResearchLead | null {
  if (!safeMarkup(raw)) return null;
  const $ = load(raw, htmlOptions);
  if (!allowsSnippets($)) return null;
  const structured: Record<string, unknown>[] = [];
  const harvest = (value: unknown, depth = 0) => {
    if (!value || typeof value !== 'object' || depth > 3 || structured.length >= 16) return;
    if (Array.isArray(value)) { value.slice(0, 12).forEach((item) => harvest(item, depth + 1)); return; }
    const node = value as Record<string, unknown>;
    if (/\b(?:newsarticle|article|blogposting)\b/i.test(String(node['@type']))) structured.push(node);
    if (node['@graph']) harvest(node['@graph'], depth + 1);
  };
  $('script[type="application/ld+json"]').slice(0, 8).each((_, node) => {
    const text = $(node).html() || '';
    if (!text || text.length > 32_000) return;
    try { harvest(JSON.parse(text)); } catch { /* Malformed publisher metadata is not evidence. */ }
  });
  $('script, style, template, noscript, nav, footer, form').remove();
  const titles = [$('main h1, article h1, article .post-content .title').first().text(), meta($, ['og:title', 'twitter:title']), $('h1').first().text()];
  const post = structured[0];
  if (structured.some((entry) => entry.isAccessibleForFree === false || entry.isAccessibleForFree === 'false')) return null;
  if (typeof post?.headline === 'string') titles.splice(1, 0, post.headline);
  const observedTitle = titles.map(headline).find(Boolean);
  const title = observedTitle || lead.title;
  const content = $('article, [itemprop="articleBody"], .post-content, .entry-content, .news-detail, main').first();
  const paragraphs = content.find('p').slice(0, 15).toArray().map((node) => $(node).text());
  const articleExcerpt = [typeof post?.description === 'string' ? post.description : '', meta($, ['og:description', 'description', 'twitter:description']), ...paragraphs]
    .map((value) => briefExcerpt(value, title)).find(Boolean);
  const excerpt = articleExcerpt || lead.excerpt || '';
  const dateText = content.find('.post-date, .entry-date, .post-meta time, .entry-meta time, [itemprop="datePublished"]').first();
  const explicitDate = dateText.attr('datetime') || dateText.attr('content') || cleanPublisherText(dateText.text());
  const articleDate = publishDate(typeof post?.datePublished === 'string' ? post.datePublished : '', now)
    || publishDate(meta($, ['article:published_time', 'datePublished', 'pubdate', 'DC.date.issued']), now)
    || publishDate(explicitDate, now);
  const date = articleDate || publishDate(content.find('time[datetime]').first().attr('datetime'), now) || lead.date || null;
  const canonical = articleUrl($('link[rel~="canonical"]').first().attr('href'), page, source);
  const url = canonical && !newsIndex.test(new URL(canonical).pathname) && new URL(canonical).pathname !== '/' ? canonical : page;
  const video = mediaCandidate(meta($, ['og:video:secure_url', 'og:video:url', 'og:video']), page, source, 'video')
    || mediaCandidate(content.find('video[src], video source[src]').first().attr('src'), page, source, 'video');
  const embeddedVideo = content.find('iframe[src]').slice(0, 5).toArray().some((node) => {
    try {
      const url = new URL($(node).attr('src') || '', page);
      return url.protocol === 'https:' && !url.username && !url.password && !url.port
        && ((['www.youtube.com', 'www.youtube-nocookie.com'].includes(url.hostname) && /^\/embed\/[A-Za-z0-9_-]{11}$/.test(url.pathname))
          || (url.hostname === 'player.vimeo.com' && /^\/video\/\d{5,15}$/.test(url.pathname)));
    } catch { return false; }
  });
  const photo = mediaCandidate(meta($, ['og:image:secure_url', 'og:image', 'twitter:image']), page, source, 'image')
    || content.find('img').slice(0, 7).toArray().map((node) => mediaCandidate($(node).attr('data-src') || $(node).attr('src'), page, source, 'image')).find(Boolean);
  // An untrusted page must contain usable article content; an index or auth
  // wall is not enough evidence by itself.
  if (!excerpt && !date && !titles.map(headline).includes(lead.title)) return null;
  const media = video || (embeddedVideo ? { url: page, type: 'video' as const } : undefined) || photo || lead.media;
  const result = makeLead(source, { ...lead, url, title, date, excerpt, media }, now);
  if (result && observedTitle && articleExcerpt && articleDate && paragraphs.some((text) => cleanPublisherText(text).length >= 65)
    && (post || $('article, [itemprop="articleBody"], .post-content, .entry-content, .news-detail').length)
    && articleIdentity(url) === articleIdentity(page)) verify?.(result);
  return result;
}

function makeLead(source: ResearchSource, candidate: Candidate, now: number): ResearchLead | null {
  if (!source.registration || /\b(?:hello world|sample post|lorem ipsum|placeholder text)\b/i.test(candidate.title)
    || (candidate.date && now - Date.parse(candidate.date) > 366 * 86_400_000)) return null;
  return {
    source_id: source.registration.id,
    source_item_key: createHash('sha256').update(articleIdentity(candidate.url)).digest('hex'),
    title: candidate.title, excerpt: candidate.excerpt || '', canonical_url: candidate.url,
    published_at: candidate.date || null,
    category: categoryFor(candidate.title, candidate.url, source.registration.source_kind === 'opportunities'),
    media_url: candidate.media?.url || null, media_type: candidate.media?.type || null,
  };
}

export async function scanResearchSource(source: ResearchSource, stop?: AbortSignal, now = Date.now()): Promise<ScanResult> {
  if (source.state !== 'ready') return { state: source.state, leads: [] };
  const signal = publisherDeadline(14_500, stop);
  const seen = new Set<string>();
  let succeeded = 0;
  const policyByHost = new Map<string, Awaited<ReturnType<typeof loadPublisherPolicy>>>();
  await Promise.all(source.hosts.map(async (host) => {
    const seed = source.seeds.find((url) => publisherHost(new URL(url).hostname) === host);
    if (seed) {
      try { policyByHost.set(host, await loadPublisherPolicy(seed, source.hosts, signal)); }
      catch { /* No crawl when the publisher policy cannot be read. */ }
    }
  }));
  const allowsPath = (url: URL) => {
    const policy = policyByHost.get(publisherHost(url.hostname));
    return Boolean(policy && allowsPublisherPath(policy, url));
  };
  const read = async (url: string) => {
    if (signal.aborted || seen.has(url) || !allowsPath(new URL(url))) return null;
    seen.add(url);
    try {
      const doc = await fetchPublisher(url, source.hosts, { signal, maxBytes: 768 * 1024, mimeTypes: markupTypes, allowsPath });
      const text = doc.bytes.toString('utf8');
      seen.add(doc.url);
      return { ...doc, text };
    } catch { return null; }
  };
  const candidates: Candidate[] = [];
  const indexes: string[] = [];
  const collect = async (urls: string[]) => {
    const pages = await Promise.all(urls.map(read));
    for (const page of pages) {
      if (!page?.indexable) continue;
      const index = parsePublisherIndex(page.text, page.url, source, now);
      if (index.readable) succeeded++;
      candidates.push(...index.candidates);
      indexes.push(...index.indexes);
    }
  };
  await collect(source.seeds.slice(0, 3));
  await collect(Array.from(new Set(indexes)).filter((url) => !seen.has(url)).slice(0, 2));
  const best = candidates.sort((a, b) => b.rank - a.rank || (b.date || '').localeCompare(a.date || ''))
    .filter((item) => !item.date || now - Date.parse(item.date) <= 366 * 86_400_000);
  const titleGroups = new Map<string, Set<string>>();
  for (const item of best) {
    const key = item.title.toLowerCase();
    const group = titleGroups.get(key) || new Set<string>();
    group.add(articleIdentity(item.url));
    titleGroups.set(key, group);
  }
  const usable = best.filter((item) => (titleGroups.get(item.title.toLowerCase())?.size || 0) < 3);
  const selected = Array.from(new Map(usable.slice().reverse().map((lead) => [articleIdentity(lead.url), lead])).values()).reverse().slice(0, 6);
  const verified = new Map<string, ResearchLead>();
  const enrich = async (lead: Candidate) => {
    if (!allowsPath(new URL(lead.url))) return null;
    const doc = await read(lead.url);
    if (doc && !doc.indexable) return null;
    if (doc && /(?:html|xhtml)/.test(doc.mime)) return parsePublisherArticle(doc.text, doc.url, source, lead, now, (item) => {
      verified.set(item.source_item_key, item);
    });
    // An actual RSS item remains evidence when the article host is down. A
    // generic HTML link without a readable supporting page does not.
    return lead.rank >= 8 && lead.date ? makeLead(source, lead, now) : null;
  };
  const enriched = [];
  for (let start = 0; start < selected.length; start += 2) enriched.push(...await Promise.all(selected.slice(start, start + 2).map(enrich)));
  const unique = new Map<string, ResearchLead>();
  for (const lead of enriched) if (lead) unique.set(articleIdentity(lead.canonical_url), lead);
  const leads = Array.from(unique.values());
  return { state: leads.length ? 'found' : succeeded ? 'no_updates' : 'unreachable', leads,
    verifiedArticleKeys: leads.filter((lead) => verified.get(lead.source_item_key) === lead).map((lead) => lead.source_item_key) };
}
