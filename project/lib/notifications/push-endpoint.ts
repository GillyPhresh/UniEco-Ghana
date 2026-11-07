const EXACT_PUSH_HOSTS = new Set([
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'web.push.apple.com',
]);

/** Accept only established browser push services; never let stored endpoints target arbitrary hosts. */
export function isAllowedPushEndpoint(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;

  try {
    const endpoint = new URL(value);
    const hostname = endpoint.hostname.toLowerCase();
    const knownProvider = EXACT_PUSH_HOSTS.has(hostname)
      || (hostname !== 'notify.windows.com' && hostname.endsWith('.notify.windows.com'));

    return endpoint.protocol === 'https:'
      && !endpoint.username
      && !endpoint.password
      && !endpoint.port
      && !endpoint.hash
      && knownProvider;
  } catch {
    return false;
  }
}
