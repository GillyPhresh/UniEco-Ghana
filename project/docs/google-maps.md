# UniEco Ghana location services

UniEco uses Google Maps Platform only when a deployment supplies a browser-restricted key.

## Required configuration

Set:

```env
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your-browser-restricted-key
```

In Google Cloud, enable Maps JavaScript API and Places API for the project. Restrict the key by HTTP referrer to the deployed UniEco origins and restrict it to the APIs above. Google Cloud billing and any applicable quota approval are deployment responsibilities; this code does not create or activate a paid Google Cloud service.

If the key is absent or cannot load, UniEco keeps the marketplace usable and shows a clear configuration message. Vendors can still enter coordinates manually or use browser geolocation where permission is granted.

## Location workflow

Vendor onboarding lets an owner search an address with Places Autocomplete, select the exact place, adjust the draggable map pin, use current location, or enter latitude and longitude manually. The selected coordinates are stored with the selection source and remain `pending_review` until an authorized UniEco administrator reviews them. A changed verified location is submitted for review again.

The app stores UniEco location metadata and, when available, a Google Place ID. Google Places results are not copied into the UniEco vendor directory and do not become vendors automatically.

## Directions and privacy

Vendor profiles generate official Google Maps URLs using verified coordinates, a Place ID, or the public address. Navigation opens in Google Maps or its web fallback. UniEco requests browser location only after a user activates the current-location control; it does not retain continuous background location. Private or service-area vendors can be kept from exposing a residential address through the vendor visibility setting.

The Supabase migration `20261018120000_0109_google_maps_vendor_locations.sql` must be applied to the target database before the new onboarding and admin location-review RPCs are used.
