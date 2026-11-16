import { fetchPublisher } from './publisher-fetch';
import { publisherHost } from './public-source-url';

type Rule = { allow: boolean; path: string };
type Policy = { rules: Rule[]; blocked: boolean };
const crawler = 'uniecoGhanaCampusResearch'.toLowerCase();
const cache = new Map<string, { policy: Policy; until: number }>();

const decodeUnreserved = (value: string) => value.replace(/%([a-f\d]{2})/gi, (encoded, hex: string) => {
  const value = String.fromCharCode(parseInt(hex, 16));
  return /[a-z\d._~-]/i.test(value) ? value : encoded.toUpperCase();
});

export function parsePublisherPolicy(text: string): Policy {
  type Group = { agents: string[]; rules: Rule[]; delay: number };
  const groups: Group[] = [];
  let group: Group | undefined;
  for (const line of text.split(/\r?\n/).slice(0, 2000)) {
    const match = /^\s*(user-agent|allow|disallow|crawl-delay)\s*:\s*([^#]*?)(?:\s*#.*)?$/i.exec(line);
    if (!match) continue;
    const name = match[1].toLowerCase();
    const value = match[2].trim();
    if (name === 'user-agent') {
      if (!group || group.rules.length || group.delay) {
        group = { agents: [], rules: [], delay: 0 };
        groups.push(group);
      }
      if (value === '*' || /^[a-z\d_-]{2,64}$/i.test(value)) group.agents.push(value.toLowerCase());
    } else if (group && group.agents.length) {
      if (name === 'crawl-delay') group.delay = Math.max(group.delay, Number(value) || 0);
      else if (value.startsWith('/') && value.length <= 2048) group.rules.push({ path: decodeUnreserved(value), allow: name === 'allow' });
    }
  }
  const specific = groups.filter((entry) => entry.agents.includes(crawler));
  const selected = specific.length ? specific : groups.filter((entry) => entry.agents.includes('*'));
  return { blocked: selected.some((entry) => entry.delay > 1), rules: selected.flatMap((entry) => entry.rules) };
}

function matches(path: string, pattern: string) {
  const fixedEnd = pattern.endsWith('$');
  const segments = (fixedEnd ? pattern.slice(0, -1) : pattern).split('*');
  if (!path.startsWith(segments[0])) return false;
  if (segments.length === 1) return !fixedEnd || segments[0] === path;
  let position = segments[0].length;
  const last = fixedEnd ? segments.pop()! : '';
  const end = path.length - last.length;
  if (fixedEnd && !path.endsWith(last)) return false;
  for (const segment of segments.slice(1)) {
    const index = path.indexOf(segment, position);
    if (index < 0 || index + segment.length > end) return false;
    position = index + segment.length;
  }
  return position <= end;
}

export function allowsPublisherPath(policy: Policy, url: URL) {
  if (policy.blocked) return false;
  const path = decodeUnreserved(url.pathname + url.search);
  const match = policy.rules.filter((rule) => matches(path, rule.path))
    .sort((a, b) => b.path.replace(/[*$]/g, '').length - a.path.replace(/[*$]/g, '').length || Number(b.allow) - Number(a.allow))[0];
  return !match || match.allow;
}

export async function loadPublisherPolicy(url: string, hosts: readonly string[], signal: AbortSignal) {
  const root = new URL('/robots.txt', url);
  const host = publisherHost(root.hostname);
  const saved = cache.get(host);
  if (saved && saved.until > Date.now()) return saved.policy;
  const page = await fetchPublisher(root.href, hosts, {
    maxBytes: 100_000, mimeTypes: ['text/plain', 'text/html'], allowMissing: true, signal,
    allowsPath: (candidate) => candidate.pathname === '/robots.txt' && publisherHost(candidate.hostname) === host,
  });
  const policy = parsePublisherPolicy(page.bytes.toString('utf8'));
  if (cache.size >= 512) cache.delete(cache.keys().next().value!);
  cache.set(host, { policy, until: Date.now() + 30 * 60_000 });
  return policy;
}
