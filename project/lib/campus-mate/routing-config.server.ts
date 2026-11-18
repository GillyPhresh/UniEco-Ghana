import 'server-only';

export function getCampusRoutingEndpoint() {
  // This address is supplied by the operator, never by the browser.
  try {
    const endpoint = new URL(process.env.CAMPUS_MATE_VALHALLA_URL || '');
    if (endpoint.protocol === 'https:' && !endpoint.username && !endpoint.password
      && !endpoint.search && !endpoint.hash && /\/route\/?$/.test(endpoint.pathname)) return endpoint;
  } catch { /* An unconfigured provider is a supported state. */ }
  return null;
}
