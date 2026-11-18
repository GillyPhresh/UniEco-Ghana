# Campus Mate journey previews

Campus Mate renders route geometry as a UniEco SVG diagram. The walking,
bicycle, motorcycle and car animations are route replays, not live GPS,
traffic or safety guidance. The separate Google Maps handoff uses Maps URLs;
no Google tiles, Places coordinates or turn-by-turn data are ingested by the
journey-preview endpoint.

## Enable route previews

1. Provide a trusted, production-authorized HTTPS Valhalla deployment with
   up-to-date OpenStreetMap routing graphs for Ghana. Validate the
   `pedestrian`, `bicycle`, `motorcycle` and `auto` profiles.
2. Set `CAMPUS_MATE_VALHALLA_URL` on the app service to the exact
   `https://your-approved-routing-host/route` endpoint. If the gateway requires
   a bearer token, set `CAMPUS_MATE_VALHALLA_TOKEN` as a server secret. Do not use
   a `NEXT_PUBLIC_` prefix. Unset the endpoint to turn previews off.
3. In staging, sign in and plan a short trip between two public pins in each
   mode. Verify route steps, time, distance, the Google Maps fallback, location
   denial and a listing without a public pin. Check 320 px, tablet and desktop
   widths and the reduced-motion setting.
4. Review provider limits and location-data handling before enabling production.
   Public Valhalla demo infrastructure is not the default production provider.
   The app limits per-user requests and concurrent route calls per process;
   use gateway quotas if scaling to multiple replicas.

The app forwards only the two rounded coordinates and the selected mode on an
explicit preview request. The UI does not watch or store location history, and
the API does not cache routes. Check the provider's retention policy before
sending user locations. A private vendor location is not included in Campus
Mate's page payload or linked from a marketplace item.

No Supabase migration is required for this feature. Until a provider is
configured, learners can try the clearly labeled animation demo or use the
external directions link.
