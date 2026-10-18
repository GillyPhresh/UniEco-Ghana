export type MapDestination = {
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
  placeId?: string | null;
};

export function isValidCoordinate(latitude: number | null | undefined, longitude: number | null | undefined) {
  return latitude != null && longitude != null
    && Number.isFinite(latitude) && Number.isFinite(longitude)
    && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

function coordinatePair(value: string | null | undefined) {
  if (!value) return null;
  const match = value.trim().match(/^(-?(?:\d+(?:\.\d+)?)),\s*(-?(?:\d+(?:\.\d+)?))$/);
  if (!match) return null;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  return isValidCoordinate(latitude, longitude) ? { latitude, longitude } : null;
}

/** Extracts coordinates only from supported Google Maps URL shapes. */
export function parseGoogleMapsLinkCoordinates(raw: string | null | undefined) {
  if (!raw?.trim()) return null;
  let url: URL;
  try { url = new URL(raw.trim()); } catch { return null; }
  const host = url.hostname.toLowerCase();
  if (!(host === 'google.com' || host.endsWith('.google.com') || host === 'maps.app.goo.gl')) return null;
  const pathMatch = url.pathname.match(/@(-?(?:\d+(?:\.\d+)?)),(-?(?:\d+(?:\.\d+)?))/);
  return coordinatePair(pathMatch ? `${pathMatch[1]},${pathMatch[2]}` : url.searchParams.get('query') || url.searchParams.get('q') || url.searchParams.get('ll'));
}

export function isSupportedGoogleMapsUrl(raw: string | null | undefined) {
  if (!raw?.trim()) return false;
  try {
    const url = new URL(raw.trim());
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:'
      && (host === 'google.com' || host.endsWith('.google.com') || host === 'maps.app.goo.gl');
  } catch { return false; }
}

export function getGoogleMapsDirectionsUrl(destination: MapDestination, origin?: MapDestination) {
  const destinationValue = destination.placeId
    ? `place_id:${destination.placeId}`
    : isValidCoordinate(destination.latitude, destination.longitude)
      ? `${destination.latitude},${destination.longitude}`
      : destination.address?.trim();
  if (!destinationValue) return null;
  const params = new URLSearchParams({ api: '1', destination: destinationValue });
  if (origin?.placeId) params.set('origin', `place_id:${origin.placeId}`);
  else if (origin && isValidCoordinate(origin.latitude, origin.longitude)) params.set('origin', `${origin.latitude},${origin.longitude}`);
  else if (origin?.address?.trim()) params.set('origin', origin.address.trim());
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function getGoogleMapsPlaceUrl(destination: MapDestination) {
  if (destination.placeId) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination.address || 'Destination')}&query_place_id=${encodeURIComponent(destination.placeId)}`;
  if (isValidCoordinate(destination.latitude, destination.longitude)) return `https://www.google.com/maps/search/?api=1&query=${destination.latitude},${destination.longitude}`;
  return destination.address?.trim() ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination.address.trim())}` : null;
}

export function getGoogleMapsSearchUrl(query: string) {
  const normalized = query.trim();
  return normalized ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(normalized)}` : null;
}
