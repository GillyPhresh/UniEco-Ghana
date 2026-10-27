'use client';

import { useState } from 'react';
import { Check, ExternalLink, LocateFixed, Loader2, MapPin, Navigation, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { regions } from '@/lib/validation';
import { getGoogleMapsDirectionsUrl, getGoogleMapsPlaceUrl, isSupportedGoogleMapsUrl, parseGoogleMapsLinkCoordinates } from '@/lib/maps';
import type { VendorLocationValue } from '@/lib/types/location';

type VendorLocationCaptureProps = {
  value: VendorLocationValue;
  onChange: (value: VendorLocationValue) => void;
  showAddressFields?: boolean;
  disabled?: boolean;
};

export function VendorLocationCapture({ value, onChange, showAddressFields = false, disabled = false }: VendorLocationCaptureProps) {
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const update = (changes: Partial<VendorLocationValue>) => onChange({ ...value, ...changes });

  const captureCurrentLocation = () => {
    if (!navigator.geolocation) {
      setMessage('Location access is not available on this device. You can enter a Google Maps link instead.');
      return;
    }

    setLocating(true);
    setMessage('Stand at your shop entrance and keep this screen open while we capture the pin…');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        update({
          latitude: Number(coords.latitude.toFixed(6)),
          longitude: Number(coords.longitude.toFixed(6)),
          accuracy: Number.isFinite(coords.accuracy) ? Math.round(coords.accuracy) : null,
          capturedAt: new Date().toISOString(),
          source: 'owner_pin',
        });
        setMessage('Exact shop pin captured. Review it below, then save your business profile.');
        setLocating(false);
      },
      (error) => {
        const reason = error.code === error.PERMISSION_DENIED
          ? 'Location permission was denied. Allow location access in your browser settings and try again.'
          : 'We could not read your location. Move outside or try again with GPS enabled.';
        setMessage(reason);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  };

  const handleMapsUrlChange = (mapsUrl: string) => {
    const coordinates = parseGoogleMapsLinkCoordinates(mapsUrl);
    update({
      mapsUrl,
      ...(coordinates ? { latitude: coordinates.latitude, longitude: coordinates.longitude, accuracy: null, capturedAt: new Date().toISOString(), source: 'google_maps_link' as const } : {}),
    });
    if (mapsUrl && !isSupportedGoogleMapsUrl(mapsUrl)) setMessage('Use a secure Google Maps link copied from Google Maps.');
    else if (coordinates) setMessage('Coordinates found in the Google Maps link.');
    else setMessage(null);
  };

  const hasCoordinates = value.latitude != null && value.longitude != null;
  const destination = {
    latitude: value.latitude,
    longitude: value.longitude,
    address: [value.address, value.city, value.region, 'Ghana'].filter(Boolean).join(', '),
  };
  const directionsUrl = getGoogleMapsDirectionsUrl(destination);
  const placeUrl = getGoogleMapsPlaceUrl(destination);

  return (
    <div className="space-y-4 rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <MapPin className="h-5 w-5" />
        </div>
        <div>
          <p className="font-semibold text-foreground">Pin your exact shop location</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">Stand at the entrance of your shop and tap the button. Students will use this pin for directions after UniEco verifies it.</p>
        </div>
      </div>

      {showAddressFields && (
        <div className="space-y-4 rounded-xl border border-border bg-background/70 p-3">
          <div className="space-y-2">
            <Label htmlFor="vendor_location_address">Shop address or landmark</Label>
            <Input id="vendor_location_address" maxLength={180} placeholder="e.g. Hall 4, Room 12 or Main Market, Stall 5" value={value.address} onChange={(event) => update({ address: event.target.value, source: value.source === 'owner_pin' ? value.source : 'owner_address' })} disabled={disabled} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="vendor_location_city">City</Label>
              <Input id="vendor_location_city" maxLength={80} placeholder="e.g. Sunyani" value={value.city} onChange={(event) => update({ city: event.target.value })} disabled={disabled} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vendor_location_region">Region</Label>
              <Select value={value.region} onValueChange={(region) => update({ region })} disabled={disabled}>
                <SelectTrigger id="vendor_location_region"><SelectValue placeholder="Select region" /></SelectTrigger>
                <SelectContent>{regions.map((region) => <SelectItem key={region} value={region}>{region}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}

      <Button type="button" onClick={captureCurrentLocation} disabled={disabled || locating} className="min-h-12 w-full rounded-xl text-sm font-bold sm:w-auto">
        {locating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LocateFixed className="mr-2 h-4 w-4" />}
        {locating ? 'Capturing shop location…' : hasCoordinates ? 'Capture location again' : 'Use my current location'}
      </Button>

      {message && <p className="text-xs leading-5 text-muted-foreground" role="status">{message}</p>}

      <div className="space-y-3 rounded-xl border border-border bg-background/70 p-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-foreground"><ShieldCheck className="h-4 w-4 text-primary" /> Location confirmation</div>
        {hasCoordinates ? (
          <div className="rounded-lg bg-primary/10 p-3 text-xs text-foreground">
            <div className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span><strong>{value.latitude?.toFixed(6)}, {value.longitude?.toFixed(6)}</strong> is ready for review.{value.accuracy != null ? ` GPS accuracy: approximately ±${value.accuracy} m.` : ''}</span></div>
            {value.capturedAt && <p className="mt-1 pl-6 text-muted-foreground">Captured {new Intl.DateTimeFormat('en-GH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value.capturedAt))}</p>}
          </div>
        ) : <p className="text-xs leading-5 text-muted-foreground">No exact coordinates yet. Capture them while you are standing at the shop, or paste a Google Maps link below.</p>}

        <div className="space-y-2">
          <Label htmlFor="vendor_google_maps_url">Google Maps link (optional)</Label>
          <Input id="vendor_google_maps_url" inputMode="url" placeholder="Paste a Google Maps share link" value={value.mapsUrl} onChange={(event) => handleMapsUrlChange(event.target.value)} disabled={disabled} />
          <p className="text-[11px] leading-4 text-muted-foreground">In Google Maps, tap Share → Copy link, then paste it here if you prefer.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="vendor_latitude">Latitude</Label><Input id="vendor_latitude" type="number" step="any" inputMode="decimal" placeholder="Latitude" value={value.latitude ?? ''} onChange={(event) => update({ latitude: event.target.value ? Number(event.target.value) : null, accuracy: null, capturedAt: null, source: 'owner_pin' })} disabled={disabled} /></div>
          <div className="space-y-2"><Label htmlFor="vendor_longitude">Longitude</Label><Input id="vendor_longitude" type="number" step="any" inputMode="decimal" placeholder="Longitude" value={value.longitude ?? ''} onChange={(event) => update({ longitude: event.target.value ? Number(event.target.value) : null, accuracy: null, capturedAt: null, source: 'owner_pin' })} disabled={disabled} /></div>
        </div>
      </div>

      {hasCoordinates && (
        <div className="flex flex-wrap gap-2">
          {directionsUrl && <a href={directionsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground"><Navigation className="mr-1.5 h-3.5 w-3.5" /> Test directions</a>}
          {placeUrl && <a href={placeUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center rounded-lg border border-border bg-background px-3 text-xs font-bold text-foreground"><ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Preview pin in Google Maps</a>}
        </div>
      )}
    </div>
  );
}
