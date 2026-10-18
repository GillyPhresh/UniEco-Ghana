export const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

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

export function getGoogleMapsDirectionsUrl(destination: MapDestination, origin?: MapDestination) {
  const destinationValue = destination.placeId
    ? `place_id:${encodeURIComponent(destination.placeId)}`
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
