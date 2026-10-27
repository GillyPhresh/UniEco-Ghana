# UniEco Ghana directions and location policy

UniEco does not require a Google Maps Platform API key for core marketplace discovery, vendor profiles, location capture, or directions. It uses ordinary Google Maps URLs to hand navigation to Google Maps in a browser or installed mobile app. The optional live Google Places discovery feature uses a server-only `GOOGLE_MAPS_PLACES_API_KEY`.

## Directions

Vendor directions use the vendor's own approved coordinates when available. If coordinates are missing, UniEco uses the submitted public address. The destination is encoded using Google's Maps URL format; UniEco does not calculate routes, travel time, or continuous user location.

## Vendor location submission

Onboarding collects the business address, town/city, region, optional latitude/longitude, and an optional Google Maps link copied by the owner. Supported Google Maps URL shapes are validated. Coordinates are extracted only from recognizable coordinate-bearing URL forms; short links without coordinates are retained for review but are not treated as precise coordinates.

A vendor may submit an address without coordinates. Every submission is marked `pending_review`. UniEco administrators can review or reject the location, and changing a reviewed location sends it through review again. Google Maps links do not prove ownership and do not create a Google verification badge.

## External search and Google Places discovery

When a user wants a destination that is not registered on UniEco, the app can open an encoded Google Maps search URL. Campus Mate can also perform an on-demand Google Places search through `/api/maps/places/search`. Results are shown as clearly labelled **Google Maps discovery** cards with attribution, live addresses, ratings, phone numbers, websites, and directions.

Google-discovered places are deliberately not inserted into the `vendors` table or presented as UniEco-verified businesses. A Google listing does not prove that the owner has joined UniEco or authorised a UniEco profile. A future claim flow may let the actual owner submit the Google `place_id` and complete UniEco verification. The route does not persist Google place content; only the Google place ID is suitable for later claim matching.

The Places API key must remain server-only in Railway as `GOOGLE_MAPS_PLACES_API_KEY`. Do not prefix it with `NEXT_PUBLIC_`, put it in client code, or commit it to Git. Google Places responses are requested on demand with a field mask and `Cache-Control: no-store`; add the Google Maps attribution whenever these cards are displayed. Google Maps Platform billing and API restrictions must be configured in the Google Cloud project before enabling this feature.

The migration `20261018130000_0110_external_maps_location_workflow.sql` must be applied after `20261018120000_0109_google_maps_vendor_locations.sql` before the revised onboarding RPC is used.
