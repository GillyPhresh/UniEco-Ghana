import 'server-only';

const PILOT_ENDPOINT = 'http://campus-mate-valhalla-pilot.railway.internal:8002/route';
const MAX_PILOT_MS = 24 * 60 * 60 * 1000;

export function getCampusRoutingEndpoint(env: NodeJS.ProcessEnv = process.env, now = Date.now()) {
  // This address is supplied by the operator, never by the browser.
  try {
    const endpoint = new URL(env.CAMPUS_MATE_VALHALLA_URL || '');
    if (endpoint.protocol === 'https:' && !endpoint.username && !endpoint.password
      && !endpoint.search && !endpoint.hash && /\/route\/?$/.test(endpoint.pathname)) return endpoint;
    // Only the one Railway service is allowed to bypass the HTTPS URL check.
    // Railway encrypts traffic on its internal network; there is no public
    // route to the service. An absent/expired lease must fail closed.
    const lease = env.CAMPUS_MATE_VALHALLA_PILOT_UNTIL || '';
    const end = Date.parse(lease);
    if (endpoint.href === PILOT_ENDPOINT && env.UNIECO_ENV === 'production'
      && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(lease)
      && end > now && end - now <= MAX_PILOT_MS) return endpoint;
  } catch { /* An unconfigured provider is a supported state. */ }
  return null;
}
