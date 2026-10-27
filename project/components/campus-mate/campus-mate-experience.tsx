'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  BadgeCheck,
  CalendarDays,
  Check,
  ChevronRight,
  Compass,
  Globe2,
  ExternalLink,
  LocateFixed,
  Map,
  MapPinned,
  Navigation,
  Phone,
  Search,
  Star,
  Store,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UniversityLogo } from '@/components/universities/university-media';
import { CATEGORY_ICONS } from '@/lib/constants/categories';
import { getGoogleMapsDirectionsUrl, getGoogleMapsPlaceUrl, getGoogleMapsSearchUrl } from '@/lib/maps';
import { cn } from '@/lib/utils';

export type CampusMateUniversity = {
  id: string;
  name: string;
  official_name: string;
  short_name: string;
  abbreviation: string | null;
  slug: string;
  city: string | null;
  region: string | null;
  logo_url: string | null;
  hero_image_url: string | null;
  landmark_image_url: string | null;
  logo_alt_text: string | null;
};

export type CampusMatePlace = {
  id: string;
  kind: 'business' | 'event';
  name: string;
  category: string;
  description: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  latitude: number | null;
  longitude: number | null;
  image_url: string | null;
  href: string | null;
  rating: number | null;
  verified: boolean;
  start_time: string | null;
};

type GoogleDiscoveredPlace = {
  id: string;
  name: string;
  category: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  googleMapsUri: string;
  websiteUri: string;
  phone: string;
  rating: number | null;
  userRatingCount: number | null;
  businessStatus: string;
};

type CampusMateExperienceProps = {
  university: CampusMateUniversity;
  universities: CampusMateUniversity[];
  places: CampusMatePlace[];
};

type Coordinates = { latitude: number; longitude: number };

const filters = [
  { id: 'all', label: 'Everything' },
  { id: 'event', label: 'Events' },
  { id: 'Food & Drinks', label: 'Food' },
  { id: 'Printing & Photocopy', label: 'Printing' },
  { id: 'Repairs', label: 'Repairs' },
  { id: 'Accommodation', label: 'Hostels' },
  { id: 'Other Services', label: 'Services' },
] as const;

function campusSearchText(university: CampusMateUniversity) {
  return [university.short_name || university.name, university.city, university.region, 'Ghana']
    .filter(Boolean)
    .join(', ');
}

function placeSearchText(place: CampusMatePlace, university: CampusMateUniversity) {
  return [place.name, place.address, place.city || university.city, place.region || university.region, 'Ghana']
    .filter(Boolean)
    .join(', ');
}

function formatDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-GH', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

function distanceInKm(from: Coordinates, to: Coordinates) {
  const earthRadiusKm = 6371;
  const latitudeDelta = ((to.latitude - from.latitude) * Math.PI) / 180;
  const longitudeDelta = ((to.longitude - from.longitude) * Math.PI) / 180;
  const latitudeOne = (from.latitude * Math.PI) / 180;
  const latitudeTwo = (to.latitude * Math.PI) / 180;
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.sin(longitudeDelta / 2) ** 2 * Math.cos(latitudeOne) * Math.cos(latitudeTwo);
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function getPlaceCoordinates(place: CampusMatePlace) {
  return place.latitude != null && place.longitude != null
    ? { latitude: place.latitude, longitude: place.longitude }
    : null;
}

export function CampusMateExperience({ university, universities, places }: CampusMateExperienceProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<(typeof filters)[number]['id']>('all');
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [mapTarget, setMapTarget] = useState(campusSearchText(university));
  const [mapLoaded, setMapLoaded] = useState(false);
  const [deviceLocation, setDeviceLocation] = useState<Coordinates | null>(null);
  const [locationMessage, setLocationMessage] = useState('');
  const [googlePlaces, setGooglePlaces] = useState<GoogleDiscoveredPlace[]>([]);
  const [googlePlacesLoading, setGooglePlacesLoading] = useState(false);
  const [googlePlacesError, setGooglePlacesError] = useState('');
  const [googleSearchCompleted, setGoogleSearchCompleted] = useState(false);
  const [selectedGooglePlace, setSelectedGooglePlace] = useState<GoogleDiscoveredPlace | null>(null);

  const campusMapUrl = `https://www.google.com/maps?q=${encodeURIComponent(mapTarget)}&output=embed`;
  const campusDirectionsUrl = getGoogleMapsSearchUrl(campusSearchText(university));

  const visiblePlaces = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return places
      .filter((place) => {
        const matchesFilter = activeFilter === 'all'
          || (activeFilter === 'event' ? place.kind === 'event' : place.category === activeFilter);
        if (!matchesFilter) return false;
        if (!normalizedQuery) return true;
        return [place.name, place.category, place.description, place.address, place.city]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .map((place) => ({ place, distance: deviceLocation && getPlaceCoordinates(place) ? distanceInKm(deviceLocation, getPlaceCoordinates(place) as Coordinates) : null }))
      .sort((left, right) => {
        if (left.distance != null && right.distance != null) return left.distance - right.distance;
        if (left.distance != null) return -1;
        if (right.distance != null) return 1;
        return left.place.kind === right.place.kind ? left.place.name.localeCompare(right.place.name) : left.place.kind === 'event' ? -1 : 1;
      });
  }, [activeFilter, deviceLocation, places, searchQuery]);

  const selectedPlace = visiblePlaces.find(({ place }) => place.id === selectedPlaceId)?.place || null;
  const selectedMapName = selectedPlace?.name || selectedGooglePlace?.name;

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocationMessage('Location is not available on this device. You can still use Google Maps directions.');
      return;
    }
    setLocationMessage('Finding your location…');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setDeviceLocation({ latitude: coords.latitude, longitude: coords.longitude });
        setLocationMessage('Nearby places are now sorted first.');
      },
      () => setLocationMessage('Location permission was not granted. You can still search and get directions.'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  const choosePlace = (place: CampusMatePlace) => {
    setSelectedPlaceId(place.id);
    setSelectedGooglePlace(null);
    setMapLoaded(false);
    setMapTarget(placeSearchText(place, university));
  };

  const chooseGooglePlace = (place: GoogleDiscoveredPlace) => {
    setSelectedPlaceId(null);
    setSelectedGooglePlace(place);
    setMapLoaded(false);
    setMapTarget([place.name, place.address].filter(Boolean).join(', '));
  };

  const clearSelection = () => {
    setSelectedPlaceId(null);
    setSelectedGooglePlace(null);
    setMapLoaded(false);
    setMapTarget(campusSearchText(university));
  };

  const searchGooglePlaces = async () => {
    const query = searchQuery.trim();
    if (query.length < 2) {
      setGooglePlacesError('Type what you are looking for first, for example food, hostel, pharmacy, bank, printing or transport.');
      setGoogleSearchCompleted(true);
      return;
    }

    setGooglePlacesLoading(true);
    setGooglePlacesError('');
    setGoogleSearchCompleted(true);
    try {
      const params = new URLSearchParams({
        q: query,
        context: campusSearchText(university),
        radius: '3000',
      });
      if (deviceLocation) {
        params.set('lat', String(deviceLocation.latitude));
        params.set('lng', String(deviceLocation.longitude));
      }
      const response = await fetch(`/api/maps/places/search?${params.toString()}`, { cache: 'no-store' });
      const result = await response.json() as { places?: GoogleDiscoveredPlace[]; error?: string };
      if (!response.ok) {
        if (response.status === 503) throw new Error('In-app place discovery is not enabled, but you can search Google Maps for free below.');
        throw new Error(result.error || 'Google place search is temporarily unavailable.');
      }
      setGooglePlaces(result.places || []);
      if (!result.places?.length) setGooglePlacesError('Google Maps did not find a matching place around this campus.');
    } catch (error) {
      setGooglePlaces([]);
      setGooglePlacesError(error instanceof Error ? error.message : 'Google place search is temporarily unavailable.');
    } finally {
      setGooglePlacesLoading(false);
    }
  };

  const resetMapPreview = () => setMapLoaded(false);

  const searchEverywhereUrl = getGoogleMapsSearchUrl(
    searchQuery.trim() ? `${searchQuery.trim()}, ${campusSearchText(university)}` : campusSearchText(university),
  );

  return (
    <main className="min-h-[calc(100dvh-4rem)] bg-slate-50 pb-6 dark:bg-slate-950">
      <section className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto max-w-6xl px-4 pb-5 pt-5 sm:px-6 sm:pb-7 sm:pt-8">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="mb-2 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.18em] text-primary">
                <MapPinned className="h-4 w-4" /> Campus Mate
              </p>
              <h1 className="font-display text-2xl font-bold tracking-tight text-slate-950 sm:text-4xl dark:text-white">
                Find your way around campus
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base dark:text-slate-300">
                Discover businesses, events, services and useful places near your university, then open live directions in Google Maps.
              </p>
            </div>
            <div className="hidden shrink-0 rounded-2xl bg-primary/10 p-3 text-primary sm:block">
              <Compass className="h-8 w-8" />
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <label className="relative block">
              <span className="sr-only">Choose your campus</span>
              <select
                value={university.slug}
                onChange={(event) => { window.location.href = `/campus-mate?campus=${encodeURIComponent(event.target.value)}`; }}
                className="h-12 w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-4 pr-10 text-sm font-semibold text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                {universities.map((item) => <option key={item.id} value={item.slug}>{item.short_name || item.name} · {item.city || item.region || 'Ghana'}</option>)}
              </select>
              <ChevronRight className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 rotate-90 text-slate-500" />
            </label>
            <Button type="button" variant="outline" className="h-12 justify-center rounded-xl border-slate-200 bg-white px-4 dark:border-slate-700 dark:bg-slate-800" onClick={requestLocation}>
              <LocateFixed className="mr-2 h-4 w-4 text-primary" /> Use my location
            </Button>
          </div>
          {locationMessage && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{locationMessage}</p>}
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-4 px-4 py-4 sm:space-y-6 sm:px-6 sm:py-6">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="relative aspect-[1.35/1] min-h-[270px] bg-slate-200 sm:aspect-[2.5/1] sm:min-h-[340px]">
            <iframe
              title={`Google Maps view of ${university.name}`}
              src={campusMapUrl}
              className="absolute inset-0 h-full w-full border-0"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
              onLoad={() => setMapLoaded(true)}
              onError={resetMapPreview}
            />
            {!mapLoaded && (
              <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_20%_20%,rgba(16,185,129,0.18),transparent_35%),linear-gradient(135deg,#e2e8f0,#f8fafc)] p-6 text-center">
                <div className="max-w-xs rounded-2xl border border-white/80 bg-white/95 p-5 shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary"><Map className="h-6 w-6" /></div>
                  <p className="mt-3 font-bold text-slate-950 dark:text-white">Campus map preview</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">Open Google Maps for the live map and turn-by-turn navigation.</p>
                  {campusDirectionsUrl && <a href={campusDirectionsUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-10 items-center rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground"><ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Open Google Maps</a>}
                </div>
              </div>
            )}
            <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-2 sm:inset-x-5 sm:top-5">
              <div className="pointer-events-auto max-w-[calc(100%-3.25rem)] rounded-xl border border-white/70 bg-white/95 px-3 py-2 shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">You are exploring</p>
                <p className="mt-0.5 truncate text-sm font-bold text-slate-950 dark:text-white">{selectedMapName || university.short_name || university.name}</p>
                <p className="truncate text-xs text-slate-500">{selectedPlace ? 'UniEco place' : selectedGooglePlace ? 'Google Maps place' : campusSearchText(university)}</p>
              </div>
              {selectedMapName && <button type="button" onClick={clearSelection} className="pointer-events-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/70 bg-white/95 text-slate-700 shadow-lg dark:border-slate-700 dark:bg-slate-900/95 dark:text-white" aria-label="Show whole campus"><X className="h-4 w-4" /></button>}
            </div>
            <div className="absolute inset-x-3 bottom-3 flex flex-wrap gap-2 sm:inset-x-5 sm:bottom-5">
              {campusDirectionsUrl && <a href={campusDirectionsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground shadow-lg transition hover:bg-primary/90"><Navigation className="mr-2 h-4 w-4" /> Open live map</a>}
              <button type="button" onClick={requestLocation} className="inline-flex min-h-11 items-center rounded-xl border border-white/70 bg-white/95 px-4 text-sm font-bold text-slate-900 shadow-lg backdrop-blur transition hover:bg-white dark:border-slate-700 dark:bg-slate-900/95 dark:text-white"><LocateFixed className="mr-2 h-4 w-4 text-primary" /> Near me</button>
            </div>
          </div>
          <div className="flex items-center gap-2 border-t border-slate-100 px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <Map className="h-4 w-4 shrink-0 text-primary" />
            <span>Live map and turn-by-turn navigation are provided by Google Maps.</span>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Campus directory</p>
              <h2 className="mt-1 text-lg font-bold text-slate-950 dark:text-white">What are you looking for?</h2>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-80 sm:flex-row">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void searchGooglePlaces(); }} placeholder="Search this campus" aria-label="Search this campus" className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-800" />
              </div>
              <button type="button" onClick={() => void searchGooglePlaces()} disabled={googlePlacesLoading} className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-primary px-3 text-xs font-bold text-primary-foreground disabled:cursor-wait disabled:opacity-70">
                <Globe2 className="mr-1.5 h-4 w-4" /> {googlePlacesLoading ? 'Searching…' : 'Search all places'}
              </button>
            </div>
          </div>

          <div className="mt-4 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Campus Mate filters">
            {filters.map((filter) => {
              const active = activeFilter === filter.id;
              return <button key={filter.id} type="button" onClick={() => setActiveFilter(filter.id)} role="tab" aria-selected={active} className={cn('shrink-0 rounded-full border px-3.5 py-2 text-xs font-bold transition', active ? 'border-primary bg-primary text-primary-foreground' : 'border-slate-200 bg-white text-slate-600 hover:border-primary/50 hover:text-primary dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300')}>
                {filter.id !== 'all' && filter.id !== 'event' && <span className="mr-1">{CATEGORY_ICONS[filter.id] || '•'}</span>}{filter.label}
              </button>;
            })}
          </div>
        </section>

        {(googleSearchCompleted || googlePlacesLoading) && (
          <section className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 shadow-sm sm:p-5 dark:border-blue-900/60 dark:bg-blue-950/20">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700 dark:text-blue-300">Google Maps discovery</p>
                <h2 className="mt-1 text-lg font-bold text-slate-950 dark:text-white">Places around this campus</h2>
                <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">These places are discovered live from Google Maps. They are not UniEco vendors unless the owner joins and verifies the business.</p>
              </div>
              <Globe2 className="h-6 w-6 shrink-0 text-blue-600 dark:text-blue-300" />
            </div>

            {googlePlacesLoading ? (
              <div className="mt-4 rounded-xl border border-blue-200 bg-white/80 p-5 text-center text-sm text-slate-600 dark:border-blue-900/60 dark:bg-slate-900/60 dark:text-slate-300">Finding places around {university.short_name || university.name}…</div>
            ) : googlePlacesError ? (
              <div className="mt-4 rounded-xl border border-dashed border-blue-300 bg-white/70 p-5 text-center text-sm text-slate-600 dark:border-blue-900/60 dark:bg-slate-900/60 dark:text-slate-300">
                <p>{googlePlacesError}</p>
                {searchEverywhereUrl && <a href={searchEverywhereUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-10 items-center rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground"><ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Open free Google Maps search</a>}
              </div>
            ) : (
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {googlePlaces.map((place) => {
                  const directionsUrl = getGoogleMapsDirectionsUrl({ latitude: place.latitude, longitude: place.longitude, address: place.address }, deviceLocation ? { latitude: deviceLocation.latitude, longitude: deviceLocation.longitude } : undefined);
                  return (
                    <article key={place.id} className="rounded-xl border border-blue-100 bg-white p-3 shadow-sm dark:border-blue-900/50 dark:bg-slate-900">
                      <div className="flex gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300"><Globe2 className="h-5 w-5" /></div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0"><p className="truncate font-bold text-slate-950 dark:text-white">{place.name}</p><p className="mt-0.5 text-xs font-medium text-blue-700 dark:text-blue-300">{place.category}</p></div>
                            {place.rating != null && <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-amber-600"><Star className="h-3.5 w-3.5 fill-current" /> {place.rating.toFixed(1)}</span>}
                          </div>
                          <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{place.address || 'Address available in Google Maps'}</p>
                          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                            <button type="button" onClick={() => chooseGooglePlace(place)} className="inline-flex min-h-9 items-center rounded-lg bg-blue-100 px-3 font-bold text-blue-800 dark:bg-blue-950/60 dark:text-blue-200"><Map className="mr-1.5 h-3.5 w-3.5" /> View on map</button>
                            {directionsUrl && <a href={directionsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center rounded-lg bg-primary px-3 font-bold text-primary-foreground"><Navigation className="mr-1.5 h-3.5 w-3.5" /> Directions</a>}
                            {place.googleMapsUri && <a href={place.googleMapsUri} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center rounded-lg border border-blue-200 px-2.5 font-semibold text-blue-800 dark:border-blue-900/60 dark:text-blue-200"><ExternalLink className="mr-1 h-3.5 w-3.5" /> Google Maps</a>}
                            {place.phone && <a href={`tel:${place.phone}`} className="inline-flex min-h-9 items-center rounded-lg border border-slate-200 px-2.5 font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"><Phone className="mr-1 h-3.5 w-3.5" /> Call</a>}
                            {place.websiteUri && <a href={place.websiteUri} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center rounded-lg border border-slate-200 px-2.5 font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"><Globe2 className="mr-1 h-3.5 w-3.5" /> Website</a>}
                          </div>
                          {place.businessStatus && place.businessStatus !== 'OPERATIONAL' && <p className="mt-2 text-[11px] font-semibold text-amber-700 dark:text-amber-300">Google status: {place.businessStatus.toLowerCase().replaceAll('_', ' ')}</p>}
                          {place.userRatingCount != null && <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">{place.userRatingCount.toLocaleString()} Google reviews · Google Maps</p>}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
            <p className="mt-4 text-[11px] text-slate-500 dark:text-slate-400">Google Maps data and place information are provided by Google Maps. Open a place in Google Maps for the latest details.</p>
          </section>
        )}

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-950 dark:text-white">Nearby places</h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{visiblePlaces.length} {visiblePlaces.length === 1 ? 'place' : 'places'} found</p>
              </div>
              {deviceLocation && <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary"><Check className="h-3.5 w-3.5" /> Sorted near you</span>}
            </div>

            {visiblePlaces.length > 0 ? (
              <div className="space-y-3">
                {visiblePlaces.map(({ place, distance }) => {
                  const coordinates = getPlaceCoordinates(place);
                  const directionsUrl = getGoogleMapsDirectionsUrl({ latitude: place.latitude, longitude: place.longitude, address: placeSearchText(place, university) }, deviceLocation ? { latitude: deviceLocation.latitude, longitude: deviceLocation.longitude } : undefined);
                  const placeUrl = getGoogleMapsPlaceUrl({ latitude: place.latitude, longitude: place.longitude, address: placeSearchText(place, university) });
                  const date = formatDate(place.start_time);
                  return (
                    <article key={`${place.kind}-${place.id}`} className={cn('rounded-xl border p-3 transition', selectedPlaceId === place.id ? 'border-primary bg-primary/5' : 'border-slate-200 hover:border-primary/40 dark:border-slate-700')}>
                      <div className="flex gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary/10 text-primary">
                          {place.image_url ? <img src={place.image_url} alt="" className="h-full w-full object-cover" /> : place.kind === 'event' ? <CalendarDays className="h-5 w-5" /> : <Store className="h-5 w-5" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate font-bold text-slate-950 dark:text-white">{place.name}</p>
                              <p className="mt-0.5 text-xs font-medium text-primary">{place.kind === 'event' ? 'Campus event' : `${CATEGORY_ICONS[place.category] || '📍'} ${place.category || 'Campus business'}`}</p>
                            </div>
                            {place.verified && <BadgeCheck className="h-4 w-4 shrink-0 text-primary" aria-label="Verified" />}
                          </div>
                          <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{place.address || 'Campus location available in Google Maps'}{date ? ` · ${date}` : ''}</p>
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <button type="button" onClick={() => choosePlace(place)} className="inline-flex min-h-9 items-center rounded-lg bg-slate-100 px-3 text-xs font-bold text-slate-700 transition hover:bg-primary/10 hover:text-primary dark:bg-slate-800 dark:text-slate-200"><Map className="mr-1.5 h-3.5 w-3.5" /> View on map</button>
                            {directionsUrl && <a href={directionsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground transition hover:bg-primary/90"><Navigation className="mr-1.5 h-3.5 w-3.5" /> Directions</a>}
                            {place.href && <Link href={place.href} className="inline-flex min-h-9 items-center rounded-lg px-2 text-xs font-bold text-primary hover:bg-primary/10">Details <ArrowUpRight className="ml-1 h-3.5 w-3.5" /></Link>}
                            {distance != null && <span className="ml-auto text-xs font-semibold text-slate-500">{distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1)} km`}</span>}
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center dark:border-slate-700">
                <MapPinned className="mx-auto h-8 w-8 text-primary/70" />
                <h3 className="mt-3 font-bold text-slate-900 dark:text-white">No UniEco places match that search</h3>
                <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">Search the wider campus area in Google Maps to find any place, even if it is not listed on UniEco yet.</p>
                {searchEverywhereUrl && <a href={searchEverywhereUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground"><Search className="mr-2 h-4 w-4" /> Search Google Maps</a>}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Navigation className="h-5 w-5" /></div>
                <div>
                  <h2 className="font-bold text-slate-950 dark:text-white">Need to go somewhere else?</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">Search any hostel, lecture hall, food spot, bank, transport stop or landmark around {university.short_name || university.name}.</p>
                  {campusDirectionsUrl && <a href={campusDirectionsUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-10 items-center rounded-lg border border-primary/30 bg-white px-3 text-xs font-bold text-primary dark:bg-slate-900"><ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Explore all places</a>}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-start gap-3">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700">
                  <UniversityLogo src={university.logo_url} fallbackSrc={university.hero_image_url || university.landmark_image_url} name={university.name} shortName={university.short_name} alt={university.logo_alt_text || `${university.name} logo`} className="h-full w-full object-contain" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Your campus</p>
                  <h2 className="mt-1 truncate font-bold text-slate-950 dark:text-white">{university.name}</h2>
                  <p className="mt-1 text-xs text-slate-500">{[university.city, university.region].filter(Boolean).join(' · ') || 'Ghana'}</p>
                </div>
              </div>
              <Link href={`/university/${university.slug}`} className="mt-4 flex min-h-11 items-center justify-between rounded-xl bg-slate-50 px-3 text-sm font-bold text-slate-700 transition hover:bg-primary/10 hover:text-primary dark:bg-slate-800 dark:text-slate-200">
                View campus community <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
