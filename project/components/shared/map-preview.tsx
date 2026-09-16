import { MapPin, Navigation } from 'lucide-react';
import { Button } from '@/components/ui/button';

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

  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-xl border border-border">
        <iframe
          title={`Map of ${label || 'location'}`}
          width="100%"
          height="280"
          loading="lazy"
          src={`https://www.openstreetmap.org/export/embed.html?bbox=${longitude - 0.01}%2C${latitude - 0.01}%2C${longitude + 0.01}%2C${latitude + 0.01}&layer=mapnik&marker=${latitude}%2C${longitude}`}
          className="block"
        />
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
      <Button asChild variant="outline" size="sm">
        <a href={directionsUrl} target="_blank" rel="noopener noreferrer">
          <Navigation className="mr-2 h-4 w-4" />
          Get directions
        </a>
      </Button>
    </div>
  );
}
