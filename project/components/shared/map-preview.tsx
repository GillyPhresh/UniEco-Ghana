import { MapPin, Navigation, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getGoogleMapsDirectionsUrl, getGoogleMapsPlaceUrl, isSupportedGoogleMapsUrl } from '@/lib/maps';

interface MapPreviewProps {
  latitude: number | null;
  longitude: number | null;
  label?: string;
  address?: string | null;
  city?: string | null;
  mapsUrl?: string | null;
}

export function MapPreview({
  latitude,
  longitude,
  label,
  address,
  city,
  mapsUrl,
}: MapPreviewProps) {
  const destination = { latitude, longitude, address: [address, city].filter(Boolean).join(', ') };
  const directionsUrl = getGoogleMapsDirectionsUrl(destination);
  const placeUrl = isSupportedGoogleMapsUrl(mapsUrl) ? mapsUrl : getGoogleMapsPlaceUrl(destination);

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-muted/30 p-5">
        <div className="flex items-start gap-3">
          <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <p className="font-medium text-foreground">{label || 'Business location'}</p>
            <p className="mt-1 text-sm text-muted-foreground">{address || city || 'Address not provided'}</p>
            {address && city && <p className="text-sm text-muted-foreground">{city}</p>}
            {latitude != null && longitude != null && <p className="mt-2 text-xs text-muted-foreground">Coordinates available for precise directions</p>}
          </div>
        </div>
      </div>
      {(address || city) && (
        <div className="flex items-start gap-2 text-sm text-muted-foreground">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>
            {address}
            {address && city ? ', ' : ''}
            {city}
          </span>
        </div>
      )}
      {directionsUrl && <Button asChild variant="outline" size="sm">
        <a href={directionsUrl} target="_blank" rel="noopener noreferrer">
          <Navigation className="mr-2 h-4 w-4" />
          Get directions
        </a>
      </Button>}
      {placeUrl && <Button asChild variant="outline" size="sm"><a href={placeUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-2 h-4 w-4" />Open in Google Maps</a></Button>}
      {!directionsUrl && <p className="text-sm text-muted-foreground">The vendor has not provided a usable location yet.</p>}
    </div>
  );
}
