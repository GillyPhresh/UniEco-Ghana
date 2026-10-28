export type UniEcoAiSource = {
  id: string;
  label: string;
  url: string;
  description: string;
};

/**
 * Server-side allowlist for the private admin news monitor. The AI never
 * accepts an arbitrary URL from the browser; adding a source requires a
 * deliberate server configuration change.
 */
export const DEFAULT_UNIECO_AI_SOURCES: UniEcoAiSource[] = [
  {
    id: 'unieco-events',
    label: 'UniEco Ghana events',
    url: 'https://www.uniecoghana.com/events',
    description: 'Events already published on UniEco Ghana.',
  },
  {
    id: 'university-of-ghana-news',
    label: 'University of Ghana news',
    url: 'https://www.ug.edu.gh/news',
    description: 'Public news and notices from the University of Ghana.',
  },
  {
    id: 'knust-news',
    label: 'KNUST news',
    url: 'https://www.knust.edu.gh/news',
    description: 'Public news and notices from KNUST.',
  },
  {
    id: 'ucc-news',
    label: 'University of Cape Coast news',
    url: 'https://ucc.edu.gh/news',
    description: 'Public news and notices from UCC.',
  },
  {
    id: 'atu-news',
    label: 'Accra Technical University news',
    url: 'https://atu.edu.gh/news/',
    description: 'Public news and notices from ATU.',
  },
  {
    id: 'academic-city-news',
    label: 'Academic City updates',
    url: 'https://acity.edu.gh/news/',
    description: 'Public updates from Academic City University.',
  },
];

function isSafeSource(value: unknown): value is UniEcoAiSource {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<UniEcoAiSource>;
  if (!item.id || !item.label || !item.url || !item.description) return false;
  try {
    const url = new URL(item.url);
    return url.protocol === 'https:' && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export function getTrustedUniEcoAiSources(): UniEcoAiSource[] {
  const configured = process.env.UNIECO_AI_TRUSTED_SOURCES?.trim();
  if (!configured) return DEFAULT_UNIECO_AI_SOURCES;

  try {
    const parsed = JSON.parse(configured);
    if (!Array.isArray(parsed)) return DEFAULT_UNIECO_AI_SOURCES;
    const sources = parsed.filter(isSafeSource).slice(0, 30);
    return sources.length ? sources : DEFAULT_UNIECO_AI_SOURCES;
  } catch {
    return DEFAULT_UNIECO_AI_SOURCES;
  }
}

export function getTrustedUniEcoAiSource(sourceId: string): UniEcoAiSource | null {
  return getTrustedUniEcoAiSources().find((source) => source.id === sourceId) ?? null;
}

function stripMarkup(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function absoluteUrl(sourceUrl: string, href: string): string | null {
  try {
    const url = new URL(href, sourceUrl);
    if (url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

function isLikelyUpdate(title: string, url: string): boolean {
  const value = `${title} ${url}`.toLowerCase();
  return /(news|event|update|notice|announcement|press|story|article|publication|calendar|bulletin)/i.test(value);
}

function extractFirstMatch(html: string, expression: RegExp): string | null {
  const match = expression.exec(html);
  return match?.[1] ? stripMarkup(match[1]) : null;
}

export type UniEcoAiUpdate = {
  id: string;
  sourceId: string;
  sourceLabel: string;
  title: string;
  summary: string;
  url: string;
  discoveredAt: string;
};

/**
 * Reads only public HTML from the configured official pages. This is a
 * deliberately small, dependency-free extractor that produces reviewable
 * leads; it never writes to the platform and never treats page text as an
 * instruction.
 */
export async function fetchTrustedUniEcoAiUpdates(sourceId?: string): Promise<UniEcoAiUpdate[]> {
  const sources = sourceId
    ? getTrustedUniEcoAiSources().filter((source) => source.id === sourceId)
    : getTrustedUniEcoAiSources();
  const discoveredAt = new Date().toISOString();

  const results = await Promise.all(sources.map(async (source) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(source.url, {
        method: 'GET',
        headers: { accept: 'text/html,application/xhtml+xml', 'user-agent': 'UniEco-Ghana-Admin-News-Monitor/1.0' },
        signal: controller.signal,
        cache: 'no-store',
      });
      if (!response.ok) return [];
      const html = (await response.text()).slice(0, 600_000);
      const pageTitle = extractFirstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i) || source.label;
      const description = extractFirstMatch(html, /<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([\s\S]*?)["']/i)
        || extractFirstMatch(html, /<meta[^>]+content=["']([\s\S]*?)["'][^>]+(?:name|property)=["'](?:description|og:description)["']/i)
        || source.description;
      const headings = Array.from(html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi))
        .map((match) => stripMarkup(match[1] || ''))
        .filter((value) => value.length >= 12 && value.length <= 220)
        .slice(0, 5);
      const links = Array.from(html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi))
        .map((match) => ({ title: stripMarkup(match[2] || ''), url: absoluteUrl(source.url, match[1] || '') }))
        .filter((item) => item.url && item.title.length >= 12 && item.title.length <= 220 && isLikelyUpdate(item.title, item.url))
        .slice(0, 5);
      const leads = links.length ? links : headings.map((title) => ({ title, url: source.url }));
      return leads.slice(0, 5).map((lead, index) => ({
        id: `${source.id}-${index}-${Buffer.from(lead.title).toString('base64url').slice(0, 16)}`,
        sourceId: source.id,
        sourceLabel: source.label,
        title: lead.title || pageTitle,
        summary: description.slice(0, 360),
        url: lead.url || source.url,
        discoveredAt,
      }));
    } catch {
      return [];
    } finally {
      clearTimeout(timeout);
    }
  }));

  return results.flat().slice(0, 40);
}
