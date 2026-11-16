import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { BlockList, isIP } from 'node:net';
import { checkServerIdentity } from 'node:tls';
import { sourceLink } from './public-source-url';

const blocked = new BlockList();
for (const [prefix, bits] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blocked.addSubnet(prefix, bits, 'ipv4');
for (const [prefix, bits] of [
  ['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20],
] as const) blocked.addSubnet(prefix, bits, 'ipv6');
const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  return family === 4 ? !blocked.check(address, 'ipv4')
    : family === 6 && !address.includes('%') && globalV6.check(address, 'ipv6') && !blocked.check(address, 'ipv6');
}

type Resolved = { address: string; family: number };

export function choosePublicAddress(addresses: Resolved[]): Resolved {
  if (!addresses.length || addresses.some(({ address, family }) => family !== isIP(address) || !isPublicAddress(address))) {
    throw new Error('Publisher did not resolve exclusively to public addresses.');
  }
  return addresses.find(({ family }) => family === 4) || addresses[0];
}

function abortable<T>(task: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    void task.catch(() => undefined);
    return Promise.reject(signal.reason);
  }
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    void task.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

export function publisherDeadline(milliseconds: number, parent?: AbortSignal) {
  const timeout = AbortSignal.timeout(milliseconds);
  // Node 20+ supports AbortSignal.any; the project's DOM declarations predate it.
  const signals = AbortSignal as typeof AbortSignal & { any(signals: AbortSignal[]): AbortSignal };
  return parent ? signals.any([parent, timeout]) : timeout;
}

type FetchOptions = {
  maxBytes: number;
  mimeTypes: readonly string[];
  signal?: AbortSignal;
  allowMissing?: boolean;
  allowsPath?: (url: URL) => boolean;
};

export type PublisherDocument = { url: string; mime: string; bytes: Buffer; indexable: boolean };

/** Approved hosts only, including every redirect. HTTPS validates TLS for the original host,
 * while the socket uses the exact IP already checked (no second DNS lookup). */
export async function fetchPublisher(value: string, hosts: readonly string[], options: FetchOptions): Promise<PublisherDocument> {
  const signal = publisherDeadline(4_500, options.signal);
  let target = sourceLink(value, value, hosts);
  const visited = new Set<string>();

  for (let hop = 0; hop <= 2; hop++) {
    if (!target || visited.has(target.href) || (options.allowsPath && !options.allowsPath(target))) throw new Error('Untrusted publisher URL, path or redirect.');
    signal.throwIfAborted();
    const url = target;
    visited.add(url.href);
    const pinned = choosePublicAddress(await abortable(lookup(url.hostname, { all: true, verbatim: true }), signal));
    const result = await new Promise<PublisherDocument | { redirect: string }>((resolve, reject) => {
      const req = request({
        protocol: 'https:', hostname: pinned.address, port: 443, servername: url.hostname,
        rejectUnauthorized: true, checkServerIdentity: (_host, certificate) => checkServerIdentity(url.hostname, certificate),
        path: url.pathname + url.search, method: 'GET', agent: false, maxHeaderSize: 16_384, signal,
        headers: {
          Host: url.hostname,
          Accept: options.mimeTypes.join(', '),
          'Accept-Encoding': 'identity',
          'User-Agent': 'UniEcoGhanaCampusResearch/2.0 (+https://www.uniecoghana.com/updates)',
        },
      }, (res) => {
        const status = res.statusCode || 0;
        const location = res.headers.location;
        if ([301, 302, 303, 307, 308].includes(status) && typeof location === 'string') {
          res.destroy();
          resolve({ redirect: location });
          return;
        }
        if (options.allowMissing && (status === 404 || status === 410)) {
          res.destroy();
          resolve({ url: url.href, mime: 'text/plain', bytes: Buffer.alloc(0), indexable: false });
          return;
        }
        const mime = res.headers['content-type']?.split(';')[0]?.trim().toLowerCase() || '';
        const encoding = res.headers['content-encoding'];
        if (status !== 200 || !options.mimeTypes.includes(mime) || (encoding && encoding !== 'identity')
          || Number(res.headers['content-length'] || 0) > options.maxBytes) {
          res.destroy();
          reject(new Error('Publisher response is unavailable or outside limits.'));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.once('error', reject);
        res.once('end', () => resolve({
          url: url.href, mime, bytes: Buffer.concat(chunks, size),
          indexable: !/\b(?:noindex|nosnippet|none)\b/i.test(String(res.headers['x-robots-tag'] || '')),
        }));
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > options.maxBytes) {
            reject(new Error('Publisher response exceeded the size limit.'));
            res.destroy();
          } else chunks.push(chunk);
        });
      });
      req.once('error', reject);
      req.end();
    });
    if (!('redirect' in result)) return result;
    target = sourceLink(result.redirect, url.href, hosts);
  }
  throw new Error('Publisher redirect limit exceeded.');
}
