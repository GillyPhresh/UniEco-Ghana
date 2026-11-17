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
  placeId?: string | null;
}

export function MapPreview({
  latitude,
  longitude,
  label,
  address,
  city,
  mapsUrl,
  placeId,
}: MapPreviewProps) {
  const destination = { latitude, longitude, placeId, address: [address, city].filter(Boolean).join(', ') || (placeId ? label : undefined) };
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
          </div>
        </div>
      </div>
      {directionsUrl && <Button asChild variant="outline" size="sm">
        <a href={directionsUrl} target="_blank" rel="noopener noreferrer">
          <Navigation className="mr-2 h-4 w-4" />
          Get directions
        </a>
      </Button>}
      {placeUrl && <Button asChild variant="outline" size="sm"><a href={placeUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-2 h-4 w-4" />Open in Google Maps</a></Button>}
      {!directionsUrl && !placeUrl && <p className="text-sm text-muted-foreground">No public location yet.</p>}
    </div>
  );
}
