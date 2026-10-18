'use client';

import { useEffect, useRef, useState } from 'react';
import { MapPin, Navigation } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GOOGLE_MAPS_API_KEY, isValidCoordinate } from '@/lib/maps';

type GoogleMapProps = {
  latitude: number | null;
  longitude: number | null;
  label?: string;
  interactive?: boolean;
  onLocationChange?: (location: { latitude: number; longitude: number }) => void;
  height?: number;
};

export type GooglePlaceSelection = {
  latitude: number;
  longitude: number;
  address: string;
  city?: string;
  region?: string;
  placeId?: string;
};

declare global { interface Window { __uniecoGoogleMapsPromise?: Promise<void>; google?: any; } }

function loadGoogleMaps() {
  if (!GOOGLE_MAPS_API_KEY) return Promise.reject(new Error('Google Maps is not configured'));
  if (window.__uniecoGoogleMapsPromise) return window.__uniecoGoogleMapsPromise;
  window.__uniecoGoogleMapsPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector('script[data-unieco-google-maps]');
    if (existing) { existing.addEventListener('load', () => resolve()); existing.addEventListener('error', () => reject(new Error('Google Maps failed to load'))); return; }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}&libraries=places`;
    script.async = true; script.defer = true; script.dataset.uniecoGoogleMaps = 'true';
    script.onload = () => resolve(); script.onerror = () => reject(new Error('Google Maps failed to load')); document.head.appendChild(script);
  });
  return window.__uniecoGoogleMapsPromise;
}

export function GoogleMap({ latitude, longitude, label, interactive = false, onLocationChange, height = 280 }: GoogleMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);
  const hasCoordinates = isValidCoordinate(latitude, longitude);

  useEffect(() => {
    if (!containerRef.current || !hasCoordinates) return;
    let cancelled = false;
    loadGoogleMaps().then(() => {
      if (cancelled || !containerRef.current || !window.google?.maps) return;
      const position = { lat: latitude as number, lng: longitude as number };
      mapRef.current = new window.google.maps.Map(containerRef.current, { center: position, zoom: 16, mapTypeControl: false, streetViewControl: false, fullscreenControl: true });
      markerRef.current = new window.google.maps.Marker({ map: mapRef.current, position, title: label || 'UniEco location', draggable: interactive });
      if (interactive) {
        mapRef.current.addListener('click', (event: any) => {
          const next = { latitude: event.latLng.lat(), longitude: event.latLng.lng() };
          markerRef.current.setPosition({ lat: next.latitude, lng: next.longitude }); onLocationChange?.(next);
        });
        markerRef.current.addListener('dragend', (event: any) => onLocationChange?.({ latitude: event.latLng.lat(), longitude: event.latLng.lng() }));
      }
    }).catch((reason: Error) => { if (!cancelled) setError(reason.message); });
    return () => { cancelled = true; };
  }, [latitude, longitude, label, interactive, onLocationChange, hasCoordinates]);

  if (!hasCoordinates) return <div className="flex min-h-36 items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground"><MapPin className="mr-2 h-4 w-4" />Select a precise location to show the map.</div>;
  if (error) return <div className="flex min-h-36 items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground"><div><MapPin className="mx-auto mb-2 h-5 w-5" />Google Maps is not configured for this deployment.</div></div>;
  return <div ref={containerRef} style={{ height }} className="w-full rounded-xl bg-muted" aria-label={label || 'Google map'} />;
}

export function CurrentLocationButton({ onLocation }: { onLocation: (location: { latitude: number; longitude: number }) => void }) {
  const [loading, setLoading] = useState(false);
  const locate = () => { if (!navigator.geolocation) return; setLoading(true); navigator.geolocation.getCurrentPosition(({ coords }) => { onLocation({ latitude: coords.latitude, longitude: coords.longitude }); setLoading(false); }, () => setLoading(false), { enableHighAccuracy: true, timeout: 10000 }); };
  return <Button type="button" variant="outline" size="sm" onClick={locate} disabled={loading}><Navigation className="mr-2 h-4 w-4" />{loading ? 'Locating…' : 'Use current location'}</Button>;
}

export function GooglePlaceSearch({
  value,
  onSelect,
  placeholder = 'Search the exact business address',
}: {
  value: string;
  onSelect: (selection: GooglePlaceSelection) => void;
  placeholder?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!inputRef.current) return;
    if (!GOOGLE_MAPS_API_KEY) {
      setMessage('Google address search is not configured. You can still place the pin manually.');
      return;
    }
    let cancelled = false;
    loadGoogleMaps().then(() => {
      if (cancelled || !inputRef.current || !window.google?.maps?.places) return;
      const autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, {
        fields: ['place_id', 'formatted_address', 'geometry', 'address_components'],
      });
      autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        const location = place.geometry?.location;
        if (!location) {
          setMessage('That result has no precise map location. Choose another result or place the pin manually.');
          return;
        }
        const components = (place.address_components || []) as Array<{ long_name: string; types: string[] }>;
        const find = (type: string) => components.find((component) => component.types.includes(type))?.long_name;
        onSelect({
          latitude: location.lat(),
          longitude: location.lng(),
          address: place.formatted_address || inputRef.current?.value || '',
          city: find('locality') || find('postal_town'),
          region: find('administrative_area_level_1'),
          placeId: place.place_id,
        });
        setMessage(null);
      });
    }).catch(() => setMessage('Google address search could not load. You can place the pin manually.'));
    return () => { cancelled = true; };
  }, [onSelect]);

  return (
    <div className="space-y-1">
      <Input ref={inputRef} defaultValue={value} placeholder={placeholder} aria-label="Search business address" />
      {message && <p className="text-xs text-muted-foreground">{message}</p>}
    </div>
  );
}
