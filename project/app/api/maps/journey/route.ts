import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { readJsonLimited, RequestBodyTooLargeError } from '@/lib/http/read-json-limited';
import { journeyModes, MAX_ROUTE_RESPONSE_BYTES, parseJourneyRequest, parseValhallaRoute } from '@/lib/campus-mate/journey';
import { getCampusRoutingEndpoint } from '@/lib/campus-mate/routing-config.server';
import { siteConfig } from '@/lib/constants/site';
import { createClient as createTokenClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from '@/lib/supabase/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const cacheHeaders = { 'Cache-Control': 'private, no-store, max-age=0', 'X-Robots-Tag': 'noindex' };
const bursts = new Map<string, { expires: number; count: number }>();
const WINDOW_MS = 60_000;
let inFlight = 0;

async function routingCaller(request: NextRequest) {
  const cookieClient = await createClient();
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  const supabase = token ? (() => {
    const { url, anonKey } = getSupabaseConfig();
    return createTokenClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: 'Bearer ' + token } },
    });
  })() : cookieClient;
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return { error: fail(401, 'Sign in to plan your trip.') };
  const endpoint = getCampusRoutingEndpoint();
  if (!endpoint) return { error: fail(503, 'In-app routing is unavailable. Open Google Maps for directions.') };
  if (endpoint.protocol === 'http:') {
    const { data: role, error: roleError } = await supabase.rpc('current_app_role');
    if (roleError) return { error: fail(503, 'We couldn’t check pilot access. Refresh and try again.') };
    if (role !== 'super_admin') return { error: fail(403, 'Real routes are in a super-admin pilot. Open Google Maps for directions.') };
  }
  return { user, endpoint };
}

export async function GET(request: NextRequest) {
  const caller = await routingCaller(request);
  if (caller.error) return caller.error;
  return NextResponse.json({ enabled: true, pilot: caller.endpoint.protocol === 'http:' }, { headers: cacheHeaders });
}

function fail(status: number, error: string, retryAfter?: string) {
  return NextResponse.json({ error }, { status, headers: retryAfter ? { ...cacheHeaders, 'Retry-After': retryAfter } : cacheHeaders });
}

function reserve(userId: string) {
  const now = Date.now();
  const previous = bursts.get(userId);
  if (previous && previous.expires > now) {
    if (previous.count >= 8) return false;
    previous.count++;
    return true;
  }
  if (bursts.size >= 2048) {
    bursts.forEach((value, id) => { if (value.expires <= now) bursts.delete(id); });
    if (bursts.size >= 2048) return false;
  }
  bursts.set(userId, { expires: now + WINDOW_MS, count: 1 });
  return true;
}

export async function POST(request: NextRequest) {
  const origin = process.env.UNIECO_ENV === 'production' ? siteConfig.url : request.nextUrl.origin;
  if (request.headers.get('sec-fetch-site') === 'cross-site' || request.headers.get('origin') !== origin) {
    return fail(403, 'Open Campus Mate to plan a trip.');
  }
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    return fail(415, 'Route requests must use JSON.');
  }
  const caller = await routingCaller(request);
  if (caller.error) return caller.error;
  const { user, endpoint } = caller;
  if (inFlight >= 3 || !reserve(user.id)) return fail(429, 'Too many route requests. Wait a moment and try again.', '30');
  let input;
  try {
    input = parseJourneyRequest(await readJsonLimited(request, 768));
  } catch (error) {
    return fail(error instanceof RequestBodyTooLargeError ? 413 : 400, 'This route request could not be read.');
  }
  if (!input) return fail(400, 'Choose two different nearby points in Ghana, within 100 km of each other.');
  if (inFlight >= 3) return fail(429, 'Route previews are busy. Please try again shortly.', '10');

  inFlight++;
  try {
    const token = endpoint.protocol === 'https:' ? process.env.CAMPUS_MATE_VALHALLA_TOKEN : undefined;
    const response = await fetch(endpoint, {
      method: 'POST', cache: 'no-store', redirect: 'error',
      signal: AbortSignal.timeout(8_000),
      headers: {
        'Content-Type': 'application/json', Accept: 'application/json',
        'User-Agent': 'UniEco Ghana Campus Mate (https://www.uniecoghana.com/campus-mate)',
        'X-Client-Id': 'uniecoghana.com',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        locations: [input.from, input.to].map(({ latitude, longitude }) => ({ lat: latitude, lon: longitude, radius: 350 })),
        costing: journeyModes[input.mode].costing, units: 'kilometers', language: 'en-US',
      }),
    });
    if (response.status === 400 || response.status === 404) return fail(422, 'No mapped route was found for this travel mode. Try another mode or starting point.');
    if (!response.ok) return fail(503, 'The routing service is temporarily unavailable.');
    const route = parseValhallaRoute(await readJsonLimited(response, MAX_ROUTE_RESPONSE_BYTES), input);
    return route ? NextResponse.json({ route }, { headers: cacheHeaders })
      : fail(422, 'We couldn’t match this trip to a nearby mapped path.');
  } catch {
    return fail(503, 'Couldn’t load the route. Try again or open directions.');
  } finally {
    inFlight--;
  }
}
