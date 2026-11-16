const hostnamePattern = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const sharedHosts = ['facebook.com', 'instagram.com', 'tiktok.com', 'linkedin.com', 'youtube.com', 'youtu.be', 'wordpress.com', 'blogspot.com', 'github.io', 'google.com', 'bit.ly'];
const privateSuffixes = ['localhost', 'local', 'internal', 'lan', 'test', 'invalid', 'onion', 'example'];

/** Syntactic checks only. Every server connection must also pin a checked public IP. */
export function publicSourceUrl(value: unknown, base?: string | URL): URL | null {
  if (typeof value !== 'string' || value.length > 2048 || !value.trim() || /[\u0000-\u001f\u007f\\]/.test(value)) return null;
  try {
    const url = new URL(value, base);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !hostnamePattern.test(url.hostname)
      || privateSuffixes.some((suffix) => url.hostname.endsWith(`.${suffix}`))) return null;
    url.hash = '';
    return url.href.length <= 2048 ? url : null;
  } catch { return null; }
}

export function publisherHost(host: string) {
  return host.toLowerCase().replace(/^www\./, '');
}

export function officialPublisherUrl(value: unknown) {
  const url = publicSourceUrl(value);
  return url && !sharedHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))
    ? url : null;
}

export function sourceLink(value: unknown, base: string, hosts: readonly string[]) {
  const url = publicSourceUrl(value, base);
  return url && hosts.includes(publisherHost(url.hostname)) ? url : null;
}

export function cleanArticleUrl(url: URL) {
  const clean = new URL(url.href);
  for (const key of Array.from(clean.searchParams.keys())) {
    if (/^(utm_.*|[fgd]clid|mc_(cid|eid)|ref_src)$/i.test(key)) clean.searchParams.delete(key);
  }
  clean.searchParams.sort();
  return clean;
}

export function articleIdentity(value: string) {
  const url = cleanArticleUrl(new URL(value));
  url.hostname = publisherHost(url.hostname);
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  return url.href;
}
