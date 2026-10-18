import { MapPin, Navigation, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GoogleMap } from '@/components/maps/google-map';
import { getGoogleMapsDirectionsUrl, getGoogleMapsPlaceUrl } from '@/lib/maps';

interface MapPreviewProps {
  latitude: number | null;
  longitude: number | null;
  label?: string;
  address?: string | null;
  city?: string | null;
}

export function MapPreview({
  latitude,
  longitude,
  label,
  address,
  city,
}: MapPreviewProps) {
  if (latitude == null || longitude == null) {
    return (
      <div className="rounded-xl border border-border bg-muted/30 p-6 text-center">
        <MapPin className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-2 text-sm text-muted-foreground">
          Location coordinates not available
        </p>
      </div>
    );
  }

  const destination = { latitude, longitude, address: [address, city].filter(Boolean).join(', ') };
  const directionsUrl = getGoogleMapsDirectionsUrl(destination);
  const placeUrl = getGoogleMapsPlaceUrl(destination);

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-xl border border-border">
        <GoogleMap latitude={latitude} longitude={longitude} label={label} />
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
    </div>
  );
}
