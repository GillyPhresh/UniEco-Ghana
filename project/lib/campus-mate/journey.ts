export type JourneyPoint = { latitude: number; longitude: number };
export const journeyModes = {
  walk: { label: 'Walk', costing: 'pedestrian', google: 'walking' },
  bike: { label: 'Bicycle', costing: 'bicycle', google: 'bicycling' },
  motor: { label: 'Motorbike', costing: 'motorcycle', google: 'two-wheeler' },
  car: { label: 'Car', costing: 'auto', google: 'driving' },
} as const;
export type JourneyMode = keyof typeof journeyModes;
export type JourneyRequest = { mode: JourneyMode; from: JourneyPoint; to: JourneyPoint };
export type JourneyStep = { instruction: string; metres: number };
export type JourneyRoute = { shape: JourneyPoint[]; metres: number; seconds: number; steps: JourneyStep[] };

export const MAX_ROUTE_RESPONSE_BYTES = 750_000;

export function isJourneyMode(value: unknown): value is JourneyMode {
  return typeof value === 'string' && Object.hasOwn(journeyModes, value);
}

export function isJourneyPoint(value: unknown): value is JourneyPoint {
  if (!value || typeof value !== 'object') return false;
  const p = value as Partial<JourneyPoint>;
  return typeof p.latitude === 'number' && p.latitude >= 4 && p.latitude <= 12
    && typeof p.longitude === 'number' && p.longitude >= -5 && p.longitude <= 3;
}

export function distanceMetres(a: JourneyPoint, b: JourneyPoint) {
  const rad = Math.PI / 180;
  const h = Math.sin((b.latitude - a.latitude) * rad / 2) ** 2
    + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin((b.longitude - a.longitude) * rad / 2) ** 2;
  return 12_742_000 * Math.asin(Math.sqrt(Math.min(1, h)));
}

export function parseJourneyRequest(input: unknown): JourneyRequest | null {
  if (!input || typeof input !== 'object') return null;
  const { mode, from, to } = input as Partial<JourneyRequest>;
  if (!isJourneyMode(mode) || !isJourneyPoint(from) || !isJourneyPoint(to)) return null;
  const distance = distanceMetres(from, to);
  if (distance < 12 || distance > 100_000) return null;
  const rounded = ({ latitude, longitude }: JourneyPoint) => ({
    latitude: Math.round(latitude * 1e5) / 1e5, longitude: Math.round(longitude * 1e5) / 1e5,
  });
  return { mode, from: rounded(from), to: rounded(to) };
}

export function decodeRouteShape(value: string): JourneyPoint[] {
  if (!value || value.length > 130_000) return [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;
  const points: JourneyPoint[] = [];
  function readDelta() {
    let result = 0;
    for (let shift = 0; shift <= 25 && index < value.length; shift += 5) {
      const flag = value.charCodeAt(index++) - 63;
      if (flag < 0 || flag > 63) return null;
      result += (flag & 31) * 2 ** shift;
      if (flag < 32) return result % 2 ? -(result + 1) / 2 : result / 2;
    }
    return null;
  }
  while (index < value.length && points.length < 12_000) {
    const y = readDelta();
    const x = readDelta();
    if (y == null || x == null) return [];
    latitude += y;
    longitude += x;
    const p = { latitude: latitude / 1e6, longitude: longitude / 1e6 };
    if (!isJourneyPoint(p)) return [];
    points.push(p);
  }
  return index === value.length ? points : [];
}

export function parseValhallaRoute(payload: unknown, request: JourneyRequest): JourneyRoute | null {
  const trip = (payload as { trip?: { summary?: { length?: number; time?: number }; legs?: unknown[]; units?: string } } | null)?.trip;
  if (trip?.units !== 'kilometers' || !Array.isArray(trip.legs) || trip.legs.length !== 1) return null;
  const leg = trip.legs[0] as { shape?: string; maneuvers?: Array<{ instruction?: string; length?: number }> } | null;
  if (typeof leg?.shape !== 'string') return null;
  const shape = decodeRouteShape(leg.shape);
  const metres = Number(trip.summary?.length) * 1000;
  const seconds = Number(trip.summary?.time);
  if (shape.length < 2 || !Number.isFinite(metres) || metres < 1 || metres > 300_000
    || !Number.isFinite(seconds) || seconds < 1 || seconds > 86_400
    || distanceMetres(request.from, shape[0]) > 450
    || distanceMetres(request.to, shape[shape.length - 1]) > 450) return null;
  const steps = (Array.isArray(leg.maneuvers) ? leg.maneuvers : []).slice(0, 80).flatMap((step) =>
    typeof step?.instruction === 'string' && step.instruction.trim()
      ? [{ instruction: step.instruction.trim().slice(0, 180), metres: typeof step.length === 'number'
        && step.length >= 0 && step.length * 1000 <= metres ? Math.round(step.length * 1000) : 0 }]
      : []);
  return { shape, metres: Math.round(metres), seconds: Math.round(seconds), steps };
}

export function formatJourneyDistance(metres: number) {
  return metres >= 1000 ? `${(metres / 1000).toFixed(metres < 10_000 ? 1 : 0)} km` : `${Math.round(metres)} m`;
}

export function formatJourneyTime(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} hr ${minutes % 60} min`;
}
