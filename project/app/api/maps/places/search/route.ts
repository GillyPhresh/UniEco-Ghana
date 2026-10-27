import { NextRequest, NextResponse } from 'next/server';

const GOOGLE_PLACES_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';
const GOOGLE_PLACES_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.primaryType',
  'places.primaryTypeDisplayName',
  'places.formattedAddress',
  'places.location',
  'places.googleMapsUri',
  'places.websiteUri',
  'places.nationalPhoneNumber',
  'places.rating',
  'places.userRatingCount',
  'places.businessStatus',
].join(',');

type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  primaryType?: string;
  primaryTypeDisplayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  googleMapsUri?: string;
  websiteUri?: string;
  nationalPhoneNumber?: string;
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
};

function validCoordinate(value: string | null) {
  if (!value || value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function safeText(value: unknown, fallback = '') {
  return typeof value === 'string' ? value.trim().slice(0, 240) : fallback;
}

export async function GET(request: NextRequest) {
  const apiKey = process.env.GOOGLE_MAPS_PLACES_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Google place discovery is not configured yet.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const query = safeText(request.nextUrl.searchParams.get('q'));
  const context = safeText(request.nextUrl.searchParams.get('context'));
  const latitude = validCoordinate(request.nextUrl.searchParams.get('lat'));
  const longitude = validCoordinate(request.nextUrl.searchParams.get('lng'));
  const radiusParam = Number(request.nextUrl.searchParams.get('radius') || 3000);
  const radius = Number.isFinite(radiusParam) ? Math.min(Math.max(radiusParam, 100), 50000) : 3000;

  if (query.length < 2) {
    return NextResponse.json(
      { error: 'Enter at least two characters to search Google places.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const body: Record<string, unknown> = {
    textQuery: [query, context].filter(Boolean).join(' near '),
    languageCode: 'en',
    regionCode: 'GH',
    maxResultCount: 20,
  };

  if (latitude != null && longitude != null) {
    body.locationBias = {
      circle: {
        center: { latitude, longitude },
        radius,
      },
    };
  }

  try {
    const response = await fetch(GOOGLE_PLACES_SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': GOOGLE_PLACES_FIELD_MASK,
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const result = await response.json() as { places?: GooglePlace[]; error?: { message?: string } };

    if (!response.ok) {
      return NextResponse.json(
        { error: result.error?.message || 'Google place search is temporarily unavailable.' },
        { status: 502, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const places = (result.places || [])
      .filter((place) => place.id && place.displayName?.text)
      .map((place) => ({
        id: place.id as string,
        name: safeText(place.displayName?.text, 'Unnamed place'),
        category: safeText(place.primaryTypeDisplayName?.text || place.primaryType, 'Place'),
        address: safeText(place.formattedAddress),
        latitude: typeof place.location?.latitude === 'number' ? place.location.latitude : null,
        longitude: typeof place.location?.longitude === 'number' ? place.location.longitude : null,
        googleMapsUri: safeText(place.googleMapsUri),
        websiteUri: safeText(place.websiteUri),
        phone: safeText(place.nationalPhoneNumber),
        rating: typeof place.rating === 'number' ? place.rating : null,
        userRatingCount: typeof place.userRatingCount === 'number' ? place.userRatingCount : null,
        businessStatus: safeText(place.businessStatus, 'OPERATIONAL'),
      }));

    return NextResponse.json(
      { places, attribution: 'Google Maps' },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch {
    return NextResponse.json(
      { error: 'Could not reach Google place search right now.' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
