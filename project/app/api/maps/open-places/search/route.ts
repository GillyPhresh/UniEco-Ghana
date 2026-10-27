import { NextRequest, NextResponse } from 'next/server';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const USER_AGENT = 'UniEco Ghana Campus Mate/1.0 (https://www.uniecoghana.com/campus-mate)';

type GeoResult = {
  lat?: string;
  lon?: string;
  display_name?: string;
};

type OverpassElement = {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
};

const CATEGORY_FILTERS: Record<string, string[]> = {
  food: ['["amenity"~"restaurant|cafe|fast_food|food_court|pub|bar|marketplace",i]'],
  hostel: ['["tourism"~"hostel|hotel|guest_house|motel",i]'],
  accommodation: ['["tourism"~"hostel|hotel|guest_house|motel",i]'],
  pharmacy: ['["amenity"="pharmacy"]'],
  bank: ['["amenity"~"bank|atm",i]'],
  printing: ['["shop"~"copyshop|stationery|books",i]'],
  copy: ['["shop"~"copyshop|stationery|books",i]'],
  transport: [
    '["amenity"~"bus_station|taxi",i]',
    '["public_transport"]',
  ],
  services: [
    '["shop"]',
    '["office"]',
  ],
};

const CATEGORY_LABELS: Record<string, string> = {
  food: 'Food and drinks',
  hostel: 'Hostel and accommodation',
  accommodation: 'Hostel and accommodation',
  pharmacy: 'Pharmacy',
  bank: 'Bank and ATM',
  printing: 'Printing and stationery',
  copy: 'Printing and stationery',
  transport: 'Transport',
  services: 'Services',
};

const geocodeCache = new Map<string, { expiresAt: number; result: { latitude: number; longitude: number; address: string; approximate: boolean } }>();
const placesCache = new Map<string, { expiresAt: number; places: Array<Record<string, unknown>> }>();
let lastNominatimRequestAt = 0;

function safeText(value: unknown, fallback = '') {
  return typeof value === 'string' ? value.trim().slice(0, 240) : fallback;
}

function escapeRegex(value: string) {
  return value.replace(/[\\"\[\](){}.*+?^$|]/g, '\\$&').slice(0, 80);
}

function normalizeQuery(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').slice(0, 60);
}

function categoryKey(query: string) {
  const normalized = normalizeQuery(query);
  if (/\b(food|restaurant|cafe|eat|chop|drinks|bar)\b/.test(normalized)) return 'food';
  if (/\b(hostel|hotel|accommodation|lodge|guest house)\b/.test(normalized)) return 'hostel';
  if (/\b(pharmacy|chemist|drug)\b/.test(normalized)) return 'pharmacy';
  if (/\b(bank|atm|cash)\b/.test(normalized)) return 'bank';
  if (/\b(print|printing|photocopy|copy|stationery|books)\b/.test(normalized)) return 'printing';
  if (/\b(transport|bus|taxi|tro tro|station)\b/.test(normalized)) return 'transport';
  if (/\b(service|services|repair|salon|barber)\b/.test(normalized)) return 'services';
  return normalized;
}

async function waitForNominatimWindow() {
  const waitMs = 1000 - (Date.now() - lastNominatimRequestAt);
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
  lastNominatimRequestAt = Date.now();
}

async function geocodeCampus(campus: string) {
  const cacheKey = normalizeQuery(campus);
  const cached = geocodeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.result;

  const parts = campus.split(',').map((part) => part.trim()).filter(Boolean);
  const queries = [
    `${campus}, Ghana`,
    parts.length >= 3 ? `${parts.slice(1, 3).join(', ')}, Ghana` : '',
    parts.length >= 2 ? `${parts[1]}, Ghana` : '',
  ].filter((query, index, all) => query && all.indexOf(query) === index);

  for (let index = 0; index < queries.length; index += 1) {
    await waitForNominatimWindow();
    const url = new URL(NOMINATIM_URL);
    url.searchParams.set('q', queries[index]);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', '1');
    url.searchParams.set('countrycodes', 'gh');
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(12000),
      cache: 'no-store',
    });
    if (!response.ok) continue;
    const results = await response.json() as GeoResult[];
    const latitude = Number(results[0]?.lat);
    const longitude = Number(results[0]?.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    const result = {
      latitude,
      longitude,
      address: safeText(results[0]?.display_name, queries[index]),
      approximate: index > 0,
    };
    geocodeCache.set(cacheKey, { expiresAt: Date.now() + 24 * 60 * 60 * 1000, result });
    return result;
  }

  throw new Error('This campus is not mapped yet. Try opening the campus in Google Maps instead.');
}

function overpassQuery(latitude: number, longitude: number, query: string) {
  const key = categoryKey(query);
  const filters = CATEGORY_FILTERS[key] || [`["name"~"${escapeRegex(key)}",i]`];
  const clauses = filters.map((filter) => `nwr(around:4000,${latitude},${longitude})["name"]${filter};`).join('\n');
  return `[out:json][timeout:20];\n(\n${clauses}\n);\nout center tags;`;
}

function friendlyCategory(tags: Record<string, string>, query: string) {
  const raw = tags.amenity || tags.shop || tags.tourism || tags.public_transport || tags.office || categoryKey(query);
  const normalized = raw.toLowerCase();
  if (CATEGORY_LABELS[categoryKey(query)]) return CATEGORY_LABELS[categoryKey(query)];
  return normalized.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function mapElement(element: OverpassElement, query: string) {
  const tags = element.tags || {};
  const point = element.type === 'node' ? element : element.center;
  const latitude = typeof point?.lat === 'number' ? point.lat : null;
  const longitude = typeof point?.lon === 'number' ? point.lon : null;
  if (!tags.name || latitude == null || longitude == null) return null;
  const address = [
    tags['addr:housenumber'],
    tags['addr:street'],
    tags['addr:suburb'],
    tags['addr:city'],
  ].filter(Boolean).join(', ') || tags['addr:full'] || '';
  const osmUrl = `https://www.openstreetmap.org/${element.type}/${element.id}`;
  const googleMapsUri = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`;
  return {
    id: `osm-${element.type}-${element.id}`,
    name: safeText(tags.name, 'Unnamed place'),
    category: friendlyCategory(tags, query),
    address: safeText(address),
    latitude,
    longitude,
    googleMapsUri,
    websiteUri: safeText(tags.website || tags['contact:website']),
    phone: safeText(tags.phone || tags['contact:phone']),
    rating: null,
    userRatingCount: null,
    businessStatus: '',
    source: 'OpenStreetMap',
    osmUrl,
  };
}

async function searchOverpass(latitude: number, longitude: number, query: string) {
  const cacheKey = `${latitude.toFixed(4)}:${longitude.toFixed(4)}:${normalizeQuery(query)}`;
  const cached = placesCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.places;
  const body = overpassQuery(latitude, longitude, query);
  let lastError: unknown;
  for (const endpoint of OVERPASS_URLS) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
        body: new URLSearchParams({ data: body }).toString(),
        signal: AbortSignal.timeout(25000),
        cache: 'no-store',
      });
      if (!response.ok) {
        lastError = new Error(`OpenStreetMap search returned ${response.status}.`);
        continue;
      }
      const result = await response.json() as { elements?: OverpassElement[] };
      const places = (result.elements || []).map((element) => mapElement(element, query)).filter(Boolean).slice(0, 30) as Array<Record<string, unknown>>;
      placesCache.set(cacheKey, { expiresAt: Date.now() + 15 * 60 * 1000, places });
      return places;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('OpenStreetMap place search is temporarily unavailable.');
}

export async function GET(request: NextRequest) {
  const query = safeText(request.nextUrl.searchParams.get('q'));
  const campus = safeText(request.nextUrl.searchParams.get('campus'));
  if (query.length < 2) return NextResponse.json({ error: 'Enter at least two characters to search campus places.' }, { status: 400 });
  if (campus.length < 2) return NextResponse.json({ error: 'Choose a campus before searching places.' }, { status: 400 });

  try {
    const location = await geocodeCampus(campus);
    const places = await searchOverpass(location.latitude, location.longitude, query);
    return NextResponse.json({ places, attribution: 'OpenStreetMap contributors', campusAddress: location.address, locationIsApproximate: location.approximate }, {
      headers: { 'Cache-Control': 'private, max-age=900, stale-while-revalidate=3600' },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'OpenStreetMap place search is temporarily unavailable.' }, { status: 502 });
  }
}
