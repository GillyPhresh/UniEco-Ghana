import { createHash } from 'node:crypto';
import { safeOfficialWebsite } from '@/lib/ai/trusted-sources';

export type CampusDiscoveryItem = {
  listing_type: 'business' | 'event';
  title: string;
  summary: string | null;
  location: string | null;
  starts_at: string | null;
  ends_at: string | null;
  source_url: string;
  source_label: string;
  external_url: string | null;
  source_fingerprint: string;
  expires_at: string;
};

type InstitutionSource = { id: string; name: string; website_url: string | null };
const MAX_HTML_BYTES = 650_000;
const FETCH_TIMEOUT_MS = 5_000;
const MAX_PAGES_PER_SCAN = 5;

function plainText(value: unknown, max = 1200): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, max) : null;
}

function absoluteSameSite(base: string, candidate: unknown): string | null {
  if (typeof candidate !== 'string' || !candidate.trim()) return null;
  try {
    const url = new URL(candidate, base);
    const root = new URL(base);
    if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== root.hostname.toLowerCase()
      || url.username || url.password || (url.port && url.port !== '443')) return null;
    url.hash = '';
    return url.toString();
  } catch { return null; }
}

function schemaObjects(html: string): Record<string, unknown>[] {
  const objects: Record<string, unknown>[] = [];
  for (const block of Array.from(html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi))) {
    try {
      const parsed: unknown = JSON.parse(block[1] || '');
      const visit = (value: unknown) => {
        if (!value || typeof value !== 'object') return;
        if (Array.isArray(value)) { value.forEach(visit); return; }
        const item = value as Record<string, unknown>;
        objects.push(item);
        if (item['@graph']) visit(item['@graph']);
        if (item.itemListElement) visit(item.itemListElement);
        if (item.item && typeof item.item === 'object') visit(item.item);
      };
      visit(parsed);
    } catch { /* malformed public structured data is ignored */ }
  }
  return objects;
}

function schemaTypes(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((part): part is string => typeof part === 'string')
    : typeof value === 'string' ? [value] : [];
}

function isType(item: Record<string, unknown>, types: string[]): boolean {
  return schemaTypes(item['@type']).some((type) => types.includes(type.split('/').pop() || type));
}

function getLocation(value: unknown): string | null {
  if (typeof value === 'string') return plainText(value, 240);
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  const address = data.address && typeof data.address === 'object' ? data.address as Record<string, unknown> : {};
  return plainText([data.name, address.streetAddress, address.addressLocality, address.addressRegion]
    .filter((part) => typeof part === 'string').join(', '), 240);
}

function normalizedDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function fingerprint(universityId: string, itemType: string, url: string, title: string): string {
  return createHash('sha256').update(`${universityId}\n${itemType}\n${url}\n${title.toLowerCase()}`).digest('hex');
}

async function fetchOfficialPage(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { accept: 'text/html,application/xhtml+xml', 'user-agent': 'UniEco-Ghana-Campus-Discovery/1.0' },
      signal: controller.signal,
      cache: 'no-store',
      redirect: 'manual',
    });
    if (!response.ok || !response.headers.get('content-type')?.toLowerCase().includes('text/html')) return null;
    const reader = response.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total < MAX_HTML_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value.subarray(0, MAX_HTML_BYTES - total);
      chunks.push(chunk); total += chunk.byteLength;
      if (chunk.byteLength !== value.byteLength) { await reader.cancel(); break; }
    }
    return new TextDecoder().decode(Buffer.concat(chunks));
  } catch { return null; }
  finally { clearTimeout(timeout); }
}

function linksFromPage(html: string, sourceUrl: string): string[] {
  const baseHost = new URL(sourceUrl).hostname.toLowerCase();
  const candidates: string[] = [];
  for (const match of Array.from(html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi))) {
    const href = absoluteSameSite(sourceUrl, match[1]);
    const label = plainText(match[2], 220) || '';
    if (!href || !/(event|calendar|happening|business|shop|service|directory|market|vendor)/i.test(`${href} ${label}`)) continue;
    try { if (new URL(href).hostname.toLowerCase() === baseHost) candidates.push(href); } catch { /* ignore */ }
  }
  return Array.from(new Set(candidates)).slice(0, MAX_PAGES_PER_SCAN - 1);
}

/** Fetches a small, bounded set of same-origin official pages and extracts only Schema.org events/local businesses. */
export async function discoverCampusItems(university: InstitutionSource): Promise<CampusDiscoveryItem[]> {
  const website = safeOfficialWebsite(university.website_url);
  if (!website) return [];
  const rootHtml = await fetchOfficialPage(website);
  if (!rootHtml) return [];
  const pages: Array<{ url: string; html: string }> = [{ url: website, html: rootHtml }];
  for (const link of linksFromPage(rootHtml, website).slice(0, MAX_PAGES_PER_SCAN - 1)) {
    const html = await fetchOfficialPage(link);
    if (html) pages.push({ url: link, html });
  }

  const items = new Map<string, CampusDiscoveryItem>();
  const now = Date.now();
  for (const page of pages) {
    for (const schema of schemaObjects(page.html)) {
      const isEvent = isType(schema, ['Event', 'BusinessEvent', 'EducationEvent', 'Festival', 'SocialEvent', 'SportsEvent', 'TheaterEvent', 'MusicEvent', 'ExhibitionEvent']);
      const isBusiness = isType(schema, ['LocalBusiness', 'Store', 'Restaurant', 'CafeOrCoffeeShop', 'FoodEstablishment', 'HealthAndBeautyBusiness', 'ProfessionalService']);
      if (!isEvent && !isBusiness) continue;
      const title = plainText(schema.name, 220);
      if (!title || title.length < 3) continue;
      const externalUrl = absoluteSameSite(page.url, schema.url) || page.url;
      const sourceUrl = page.url;
      const startsAt = isEvent ? normalizedDate(schema.startDate) : null;
      const endsAt = isEvent ? normalizedDate(schema.endDate) : null;
      // Do not put undated or already-ended events into public discovery.
      if (isEvent && (!startsAt || new Date(startsAt).getTime() < now - 86_400_000 || (endsAt && new Date(endsAt).getTime() < now))) continue;
      const summary = plainText(schema.description, 1200);
      const location = getLocation(schema.location);
      const kind = isEvent ? 'event' : 'business';
      const expiresAt = isEvent
        ? new Date(Math.max(now + 86_400_000, (endsAt ? new Date(endsAt).getTime() : new Date(startsAt!).getTime()) + 7 * 86_400_000)).toISOString()
        : new Date(now + 30 * 86_400_000).toISOString();
      const item: CampusDiscoveryItem = {
        listing_type: kind,
        title,
        summary,
        location,
        starts_at: startsAt,
        ends_at: endsAt,
        source_url: sourceUrl,
        source_label: `${university.name} official website`,
        external_url: externalUrl,
        source_fingerprint: fingerprint(university.id, kind, externalUrl, title),
        expires_at: expiresAt,
      };
      items.set(item.source_fingerprint, item);
    }
  }
  return Array.from(items.values()).slice(0, 80);
}
