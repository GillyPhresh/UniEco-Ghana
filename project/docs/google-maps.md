# UniEco Ghana directions and location policy

UniEco does not require a Google Maps Platform API key for core marketplace discovery, vendor profiles, location capture, or directions. It uses ordinary Google Maps URLs to hand navigation to Google Maps in a browser or installed mobile app.

## Directions

Vendor directions use the vendor's own approved coordinates when available. If coordinates are missing, UniEco uses the submitted public address. The destination is encoded using Google's Maps URL format; UniEco does not calculate routes, travel time, or continuous user location.

## Vendor location submission

Onboarding collects the business address, town/city, region, optional latitude/longitude, and an optional Google Maps link copied by the owner. Supported Google Maps URL shapes are validated. Coordinates are extracted only from recognizable coordinate-bearing URL forms; short links without coordinates are retained for review but are not treated as precise coordinates.

A vendor may submit an address without coordinates. Every submission is marked `pending_review`. UniEco administrators can review or reject the location, and changing a reviewed location sends it through review again. Google Maps links do not prove ownership and do not create a Google verification badge.

## External search

When a user wants a destination that is not registered on UniEco, the app can open an encoded Google Maps search URL. Google Places results are not scraped, cached as vendor records, or mixed into the UniEco marketplace.

The migration `20261018130000_0110_external_maps_location_workflow.sql` must be applied after `20261018120000_0109_google_maps_vendor_locations.sql` before the revised onboarding RPC is used.
