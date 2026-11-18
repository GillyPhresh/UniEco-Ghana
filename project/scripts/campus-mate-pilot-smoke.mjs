const pilot = 'http://campus-mate-valhalla-pilot.railway.internal:8002/route';
const modes = ['pedestrian', 'bicycle', 'motorcycle', 'auto'];
const pins = [{ lat: 5.6500, lon: -0.1870, radius: 350 }, { lat: 5.6550, lon: -0.1850, radius: 350 }];

// This read-only check uses two fixed public sample pins, never account or
// device location data. Failure does not delay the web app's startup.
export async function verifyCampusMatePilot() {
  const lease = process.env.CAMPUS_MATE_VALHALLA_PILOT_UNTIL || '';
  const remaining = Date.parse(lease) - Date.now();
  if (process.env.UNIECO_ENV !== 'production' || process.env.CAMPUS_MATE_VALHALLA_URL !== pilot
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(lease)
    || !(remaining > 0 && remaining <= 24 * 60 * 60 * 1000)) return;
  const result = {};
  for (const costing of modes) {
    if (Date.now() >= Date.parse(lease)) return;
    try {
      const response = await fetch(pilot, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(4_000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locations: pins, costing, units: 'kilometers', language: 'en-US' }),
      });
      const { trip } = response.ok ? await response.json() : {};
      const leg = trip?.legs?.[0];
      if (trip?.units !== 'kilometers' || !leg?.shape?.length || !leg?.maneuvers?.length
        || !(trip?.summary?.length > 0) || !(trip?.summary?.time > 0)) {
        result[costing] = `no-route:${response.status}`;
      } else {
        result[costing] = { metres: Math.round(trip.summary.length * 1000), seconds: Math.round(trip.summary.time) };
      }
    } catch {
      result[costing] = 'unavailable';
    }
  }
  console.log('[campus-mate] private pilot smoke', JSON.stringify(result));
}
