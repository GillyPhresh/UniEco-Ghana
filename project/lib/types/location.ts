export type VendorLocationSource = 'owner_address' | 'owner_pin' | 'google_maps_link';

export type VendorLocationValue = {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  capturedAt: string | null;
  address: string;
  city: string;
  region: string;
  mapsUrl: string;
  source: VendorLocationSource;
};
