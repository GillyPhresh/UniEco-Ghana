'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  Compass,
  ExternalLink,
  LocateFixed,
  Loader2,
  MapPinned,
  Navigation,
  Share2,
  Search,
  Store,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UniversityLogo, UniversityMedia } from '@/components/universities/university-media';
import { CatalogPhoto } from '@/components/marketplace/catalog-photo';
import { CampusPlaceCard } from '@/components/campus-mate/campus-place-card';
import { CampusJourneyPlanner, type JourneyPlace } from '@/components/campus-mate/campus-journey-planner';
import { campusMateCategories, findCampusMateCategory, campusPlaceTelephone, campusPlaceWebsite } from '@/lib/campus-mate/categories';
import { getGoogleMapsSearchUrl, isValidCoordinate } from '@/lib/maps';
import { isJourneyPoint } from '@/lib/campus-mate/journey';
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
  photoAlt?: string;
  photoCredit?: string;
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
  logo_url?: string | null;
  href: string | null;
  rating: number | null;
  verified: boolean;
  start_time: string | null;
};

type DiscoveredPlace = {
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
  source: 'Google Maps' | 'OpenStreetMap';
  osmUrl: string;
};

type CampusMateExperienceProps = {
  university: CampusMateUniversity;
  universities: CampusMateUniversity[];
  places: CampusMatePlace[];
  initialPlaceId?: string;
  routingEnabled: boolean;
};

type Coordinates = { latitude: number; longitude: number };

const filters = [
  { id: 'all', label: 'Everything', query: '' },
  { id: 'event', label: 'Events', query: '' },
  { id: 'Food & Drinks', label: 'Food', query: 'food' },
  { id: 'Pharmacy', label: 'Pharmacy', query: 'pharmacy' },
  { id: 'Banks & ATMs', label: 'Banks', query: 'bank' },
  { id: 'Transport', label: 'Transport', query: 'transport' },
  { id: 'Supermarkets', label: 'Groceries', query: 'supermarket' },
  { id: 'Hospitals & Clinics', label: 'Health', query: 'hospital clinic' },
  { id: 'Printing & Photocopy', label: 'Printing', query: 'printing' },
  { id: 'Repairs', label: 'Repairs', query: 'repairs' },
  { id: 'Accommodation', label: 'Hostels', query: 'hostel' },
  { id: 'Markets', label: 'Markets', query: 'market' },
  { id: 'Places of Worship', label: 'Worship', query: 'church mosque' },
  { id: 'Fitness', label: 'Fitness', query: 'gym fitness' },
  { id: 'Fuel Stations', label: 'Fuel', query: 'fuel station' },
  { id: 'Police & Safety', label: 'Safety', query: 'police' },
  { id: 'Other Services', label: 'Services', query: 'services' },
] as const;

function campusSearchText(university: CampusMateUniversity) {
  return [university.official_name || university.name, university.city, university.region, 'Ghana']
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
  return new Intl.DateTimeFormat('en-GH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Accra' }).format(date);
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
  return place.latitude != null && place.longitude != null && isValidCoordinate(place.latitude, place.longitude)
    ? { latitude: place.latitude, longitude: place.longitude }
    : null;
}

export function CampusMateExperience({ university, universities, places, initialPlaceId, routingEnabled }: CampusMateExperienceProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<(typeof filters)[number]['id']>('all');
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(initialPlaceId || null);
  const [deviceLocation, setDeviceLocation] = useState<Coordinates | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState('');
  const [googlePlaces, setGooglePlaces] = useState<DiscoveredPlace[]>([]);
  const [googlePlacesLoading, setGooglePlacesLoading] = useState(false);
  const [googlePlacesError, setGooglePlacesError] = useState('');
  const [googleSearchCompleted, setGoogleSearchCompleted] = useState(false);
  const [selectedGooglePlace, setSelectedGooglePlace] = useState<DiscoveredPlace | null>(null);
  const [shareMessage, setShareMessage] = useState('');
  const [resultsLimit, setResultsLimit] = useState(12);
  const nearbyRequest = useRef<AbortController | null>(null);
  const mapPanel = useRef<HTMLDivElement>(null);
  const resultsPanel = useRef<HTMLElement>(null);
  useEffect(() => () => nearbyRequest.current?.abort(), []);

  const campusDirectionsUrl = getGoogleMapsSearchUrl(campusSearchText(university));

  const visiblePlaces = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return places
      .filter((place) => {
        const matchesFilter = activeFilter === 'all'
          || (activeFilter === 'event' ? place.kind === 'event'
            : place.kind === 'business' && (place.category === activeFilter || findCampusMateCategory(place.category)?.id === activeFilter));
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

  const selectedPlace = places.find(place => place.id === selectedPlaceId) ?? null;
  const toStoredPlace = (place: CampusMatePlace): JourneyPlace => {
    const position = getPlaceCoordinates(place);
    return { id: 'unieco:' + place.id, name: place.name, position: isJourneyPoint(position) ? position : null,
      address: place.address ? placeSearchText(place, university) : null, details: place.href };
  };
  const toCommunityPlace = (place: DiscoveredPlace): JourneyPlace => {
    const position = { latitude: place.latitude, longitude: place.longitude };
    return { id: 'osm:' + place.id, name: place.name,
      position: place.source === 'OpenStreetMap' && isJourneyPoint(position) ? position : null,
      address: [place.name, place.address].filter(Boolean).join(', ') };
  };
  const journeyDestination = selectedPlace ? toStoredPlace(selectedPlace) : selectedGooglePlace ? toCommunityPlace(selectedGooglePlace) : null;
  const journeyStarts = [...places.map(toStoredPlace), ...googlePlaces.map(toCommunityPlace)]
    .filter(place => place.position).sort((a, b) => a.name.localeCompare(b.name));

  const visibleGooglePlaces = useMemo(() => {
    if (!deviceLocation) return googlePlaces;
    return [...googlePlaces].sort((left, right) => {
      const leftCoordinates = left.latitude != null && left.longitude != null ? { latitude: left.latitude, longitude: left.longitude } : null;
      const rightCoordinates = right.latitude != null && right.longitude != null ? { latitude: right.latitude, longitude: right.longitude } : null;
      if (leftCoordinates && rightCoordinates) return distanceInKm(deviceLocation, leftCoordinates) - distanceInKm(deviceLocation, rightCoordinates);
      if (leftCoordinates) return -1;
      if (rightCoordinates) return 1;
      return left.name.localeCompare(right.name);
    });
  }, [deviceLocation, googlePlaces]);

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocationMessage('Location is not available on this device. You can still use Google Maps directions.');
      return;
    }
    if (locating) return;
    setLocating(true);
    setLocationMessage('Finding your location…');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const location = { latitude: coords.latitude, longitude: coords.longitude };
        if (!isJourneyPoint(location)) {
          setLocationMessage('You’re outside the route preview area. Choose a mapped campus place as your starting point.');
          setLocating(false);
          return;
        }
        setDeviceLocation(location);
        setLocationMessage('Places with a matched map pin are sorted by distance.');
        setLocating(false);
      },
      (error) => {
        setLocationMessage(error.code === error.PERMISSION_DENIED
          ? 'Location permission was not granted. Allow location in your browser settings, then try Near me again.'
          : 'We could not get your location yet. Check GPS or network access and try again.');
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  };

  const showJourney = () => {
    mapPanel.current?.focus({ preventScroll: true });
    mapPanel.current?.scrollIntoView({ block: 'start' });
  };

  const choosePlace = (place: CampusMatePlace) => {
    setSelectedPlaceId(place.id);
    setSelectedGooglePlace(null);
    showJourney();
  };

  const chooseGooglePlace = (place: DiscoveredPlace) => {
    setSelectedPlaceId(null);
    setSelectedGooglePlace(place);
    showJourney();
  };

  const clearSelection = () => {
    setSelectedPlaceId(null);
    setSelectedGooglePlace(null);
  };

  const shareCampus = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${university.short_name || university.name} Campus Mate`,
          text: `Explore places around ${university.name} on UniEco Ghana.`,
          url,
        });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShareMessage('Campus link copied.');
    } catch {
      setShareMessage('Sharing was cancelled.');
    }
    window.setTimeout(() => setShareMessage(''), 2500);
  };

  const searchGooglePlaces = async (queryOverride?: string) => {
    nearbyRequest.current?.abort();
    const query = (queryOverride ?? searchQuery).trim();
    if (query.length < 2) {
      setGooglePlacesLoading(false);
      setGooglePlacesError('Choose a category or type what you’re looking for.');
      setGoogleSearchCompleted(true);
      return;
    }

    const controller = new AbortController();
    nearbyRequest.current = controller;
    setGooglePlacesLoading(true);
    setGooglePlacesError('');
    setGoogleSearchCompleted(true);
    setGooglePlaces([]);
    try {
      const params = new URLSearchParams({
        q: query,
        campus: campusSearchText(university),
      });
      const response = await fetch(`/api/maps/open-places/search?${params.toString()}`, { cache: 'no-store', signal: controller.signal });
      const responseText = await response.text();
      let result: { places?: DiscoveredPlace[]; error?: string } = {};
      try {
        result = JSON.parse(responseText) as { places?: DiscoveredPlace[]; error?: string };
      } catch {
        throw new Error(response.ok
          ? 'Free community place search returned an unreadable response.'
          : 'Free community place search is temporarily unavailable. Please try again in a moment.');
      }
      if (!response.ok) {
        throw new Error(result.error || 'Free community place search is temporarily unavailable.');
      }
      if (controller.signal.aborted) return;
      setGooglePlaces(result.places || []);
      if (!result.places?.length) setGooglePlacesError('No mapped community places matched that search around this campus yet.');
    } catch (error) {
      if (controller.signal.aborted) return;
      setGooglePlaces([]);
      setGooglePlacesError(error instanceof Error ? error.message : 'Community place search is temporarily unavailable.');
    } finally {
      if (!controller.signal.aborted) setGooglePlacesLoading(false);
    }
  };

  const resetNearby = () => {
    nearbyRequest.current?.abort();
    setGooglePlacesLoading(false);
    setGoogleSearchCompleted(false);
    setGooglePlacesError('');
    setGooglePlaces([]);
  };

  const selectedCategory = filters.find(item => item.id === activeFilter);
  const widerSearch = searchQuery.trim() || selectedCategory?.query || '';
  const searchEverywhereUrl = getGoogleMapsSearchUrl(
    widerSearch ? `${widerSearch}, ${campusSearchText(university)}` : campusSearchText(university),
  );

  const campusName = university.short_name || university.name;
  const campusLocation = Array.from(new Set([university.city, university.region].filter(Boolean))).join(' · ') || 'Ghana';
  const cardGrid = 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3';
  const updateCategory = (id: (typeof filters)[number]['id'], query?: string) => {
    setActiveFilter(id);
    setSearchQuery('');
    setResultsLimit(12);
    resetNearby();
    if (query) {
      void searchGooglePlaces(query);
      resultsPanel.current?.scrollIntoView({ block: 'start' });
    }
  };

  return (
    <main data-campus-mate-layout="photo-first" className="min-h-[calc(100dvh-4rem)] bg-background pb-8">
      <div className="mx-auto w-full max-w-6xl space-y-7 px-3 py-4 sm:space-y-9 sm:px-6 sm:py-7">
        <section aria-labelledby="campus-mate-heading" className="grid overflow-hidden rounded-[1.65rem] border border-emerald-900 bg-[#082b27] text-white shadow-lg sm:grid-cols-[minmax(0,1fr)_minmax(0,.88fr)]">
          <div className="min-w-0 p-4 sm:p-7 lg:p-9">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[.14em] text-emerald-100"><Compass className="h-4 w-4" aria-hidden="true" /> Campus Mate</p>
            <h1 id="campus-mate-heading" className="mt-3 text-[clamp(1.7rem,6vw,3.1rem)] font-extrabold leading-tight tracking-tight">Explore your campus</h1>
            <p className="mt-2 max-w-md text-sm leading-6 text-emerald-50/90">Find food, shops, services and events. Pick a place, choose a ride, and see the journey before you go.</p>
            <div className="mt-4 flex items-center gap-2.5">
              <span className="h-10 w-10 shrink-0 rounded-xl bg-white/95 p-1"><UniversityLogo src={university.logo_url} name={university.name} shortName={campusName} alt="" /></span>
              <div className="min-w-0"><p className="break-words text-sm font-bold">{campusName}</p><p className="text-xs text-emerald-100/90">{campusLocation}</p></div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" onClick={showJourney} className="min-h-11 rounded-xl bg-emerald-100 font-bold text-emerald-950 hover:bg-white"><Navigation className="mr-2 h-4 w-4" aria-hidden="true" /> Plan a trip</Button>
              <button type="button" onClick={requestLocation} disabled={locating} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/30 px-3 text-sm font-semibold hover:bg-white/10 disabled:opacity-60">
                {locating ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" /> : <LocateFixed className="h-4 w-4" aria-hidden="true" />} Near me
              </button>
              <button type="button" onClick={() => void shareCampus()} aria-label="Share this campus" className="grid h-11 w-11 place-items-center rounded-xl border border-white/30 hover:bg-white/10"><Share2 className="h-4 w-4" aria-hidden="true" /></button>
            </div>
            {(locationMessage || shareMessage) && <p role="status" className="mt-3 text-xs leading-5 text-emerald-100">{shareMessage || locationMessage}</p>}
          </div>
          {university.hero_image_url || university.landmark_image_url ? <figure className="relative order-first m-0 aspect-[2/1] min-w-0 overflow-hidden sm:order-none sm:aspect-auto">
            <UniversityMedia kind="campus" name={university.name} shortName={campusName} src={university.hero_image_url} fallbackSrc={university.landmark_image_url}
              alt={university.photoAlt || ('Campus view of ' + university.name)} priority className="absolute inset-0 h-full w-full object-cover" />
            {university.photoCredit && <figcaption className="absolute bottom-2 right-2"><a href={university.photoCredit} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-1 rounded-full bg-black/75 px-3 text-xs font-semibold text-white">Campus photo source <ArrowUpRight className="h-3 w-3" aria-hidden="true" /></a></figcaption>}
          </figure> : <div className="relative hidden min-h-[180px] place-items-center overflow-hidden border-l border-white/15 bg-[radial-gradient(ellipse_at_38%_30%,#1d6b56,transparent_70%)] sm:grid" aria-hidden="true">
            <MapPinned className="h-24 w-24 text-emerald-100/55" />
          </div>}
        </section>

        <section aria-label="Campus and place search" className="grid gap-2.5 rounded-2xl border bg-card p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] sm:p-4">
          <label className="relative flex min-w-0 flex-col gap-1.5 text-xs font-bold">
            Your campus
            <select value={university.slug} onChange={(event) => { window.location.href = '/campus-mate?campus=' + encodeURIComponent(event.target.value); }}
              className="h-12 w-full appearance-none rounded-xl border bg-background pl-3 pr-9 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring">
              {universities.map(item => <option key={item.id} value={item.slug}>{item.short_name || item.name} · {item.city || item.region || 'Ghana'}</option>)}
            </select>
            <ChevronRight className="pointer-events-none absolute bottom-4 right-3 h-4 w-4 rotate-90 text-muted-foreground" aria-hidden="true" />
          </label>
          <form onSubmit={(event) => { event.preventDefault(); void searchGooglePlaces(widerSearch); resultsPanel.current?.scrollIntoView({ block: 'start' }); }} className="min-w-0">
            <label htmlFor="campus-mate-search" className="mb-1.5 block text-xs font-bold">Find a place</label>
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-4 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <input id="campus-mate-search" value={searchQuery} maxLength={80} placeholder="Food, hostels, banks…"
                  onChange={(event) => { setSearchQuery(event.target.value); setActiveFilter('all'); setResultsLimit(12); resetNearby(); }}
                  className="h-12 w-full rounded-xl border bg-background pl-9 pr-2 text-sm focus-visible:ring-2 focus-visible:ring-ring" />
              </div>
              <Button type="submit" disabled={googlePlacesLoading || widerSearch.length < 2} className="h-12 shrink-0 rounded-xl px-3 sm:px-4">Search nearby</Button>
            </div>
          </form>
        </section>

        <section aria-labelledby="campus-essentials">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div><h2 id="campus-essentials" className="text-xl font-extrabold tracking-tight sm:text-2xl">Campus essentials</h2><p className="mt-0.5 text-xs text-muted-foreground">Tap a picture to find places around this campus.</p></div>
            <span className="text-[11px] font-medium text-muted-foreground">Category photos</span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3 lg:grid-cols-8">
            {campusMateCategories.map((category, index) => <button key={category.id} type="button" aria-pressed={activeFilter === category.id}
              onClick={() => updateCategory(category.id, category.query)}
              className={cn('group overflow-hidden rounded-2xl border bg-card text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', activeFilter === category.id ? 'border-primary ring-2 ring-primary/20' : 'hover:border-primary/60')}>
              <span className="relative block aspect-[1.55/1] overflow-hidden bg-muted"><CatalogPhoto sources={[category.photo.image]} alt="" sizes="(max-width: 639px) 46vw, (max-width: 1023px) 23vw, 14vw" priority={index < 2} fallback={Store} /></span>
              <span className="flex min-h-11 items-center justify-between gap-1.5 px-2.5 text-xs font-bold leading-tight"><span>{category.label}</span><ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" /></span>
            </button>)}
          </div>
        </section>

        <section ref={resultsPanel} aria-labelledby="campus-places" className="scroll-mt-20 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="campus-places" className="text-xl font-extrabold tracking-tight sm:text-2xl">{activeFilter === 'event' ? 'Campus events' : 'Places & events on UniEco'}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{visiblePlaces.length} {visiblePlaces.length === 1 ? 'match' : 'matches'}{deviceLocation ? ' · Closest mapped places first' : ''}</p>
            </div>
            <label className="inline-flex items-center gap-2 text-xs font-semibold">
              Filter
              <select value={activeFilter} onChange={event => updateCategory(event.target.value as (typeof filters)[number]['id'])}
                className="min-h-11 max-w-[11rem] rounded-xl border bg-card px-2 text-xs font-semibold focus-visible:ring-2 focus-visible:ring-ring">
                {filters.map(filter => <option key={filter.id} value={filter.id}>{filter.label}</option>)}
              </select>
            </label>
          </div>

          {visiblePlaces.length ? <div className={cardGrid}>
            {visiblePlaces.slice(0, resultsLimit).map(({ place, distance }) => {
              return <CampusPlaceCard key={place.kind + '-' + place.id} name={place.name} source={place.kind}
                category={place.kind === 'event' ? 'Campus event' : place.category}
                address={place.address || (place.kind === 'business' ? 'Exact location not published' : null)}
                date={formatDate(place.start_time)} distance={distance} rating={place.rating} verified={place.verified}
                photo={place.image_url} logo={place.logo_url} backdrop={findCampusMateCategory(place.category)?.photo.image}
                active={selectedPlaceId === place.id} details={place.href} onJourney={() => choosePlace(place)} />;
            })}
          </div> : <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed bg-card p-4 sm:p-5">
            <div><p className="font-bold">No matching UniEco listings yet</p><p className="mt-1 text-xs text-muted-foreground">Try a different category or search the wider area.</p></div>
            {searchEverywhereUrl && <a href={searchEverywhereUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold hover:bg-muted"><ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Google Maps</a>}
          </div>}
          {visiblePlaces.length > resultsLimit && <Button type="button" variant="outline" className="min-h-11" onClick={() => setResultsLimit(current => current + 12)}>Show more places</Button>}

          {(googleSearchCompleted || googlePlacesLoading) && <section aria-labelledby="community-places" className="space-y-3 rounded-2xl border bg-muted/30 p-3 sm:p-5">
            <div>
              <h3 id="community-places" className="text-lg font-extrabold tracking-tight">Around campus{widerSearch ? ' · ' + widerSearch : ''}</h3>
              <p className="mt-1 text-xs text-muted-foreground">Community map results, not UniEco-verified businesses.</p>
            </div>
            {googlePlacesLoading ? <p role="status" className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" /> Finding nearby places…</p>
              : googlePlacesError ? <div className="rounded-xl border bg-card p-3 text-sm"><p role="status">{googlePlacesError}</p>
                {searchEverywhereUrl && <a href={searchEverywhereUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-11 items-center gap-1.5 font-semibold text-primary underline"><ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Search Google Maps</a>}
              </div> : <div className={cardGrid}>
                {visibleGooglePlaces.map(place => {
                  const coords = place.latitude != null && place.longitude != null && isValidCoordinate(place.latitude, place.longitude) ? { latitude: place.latitude, longitude: place.longitude } : null;
                  return <CampusPlaceCard key={place.id} name={place.name} source="community" category={place.category} address={place.address}
                    distance={deviceLocation && coords ? distanceInKm(deviceLocation, coords) : null}
                    backdrop={findCampusMateCategory(place.category)?.photo.image}
                    active={selectedGooglePlace?.id === place.id} externalDetails={campusPlaceWebsite(place.osmUrl)}
                    telephone={campusPlaceTelephone(place.phone)} website={campusPlaceWebsite(place.websiteUri)} onJourney={() => chooseGooglePlace(place)} />;
                })}
              </div>}
            <p className="text-[11px] leading-5 text-muted-foreground">Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline">OpenStreetMap contributors</a>. Coverage varies by campus.</p>
          </section>}
        </section>

        <div id="campus-journey" ref={mapPanel} tabIndex={-1} className="scroll-mt-20 focus:outline-none">
          <CampusJourneyPlanner key={journeyDestination?.id || 'empty'} destination={journeyDestination}
            startingPlaces={journeyStarts} deviceLocation={deviceLocation} onLocate={requestLocation}
            locating={locating} locationMessage={locationMessage} onClear={clearSelection}
            mapFallback={campusDirectionsUrl} enabled={routingEnabled} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <Link href={'/university/' + university.slug} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary">View campus profile <ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Link>
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer py-2 font-medium">Photo credits</summary>
            <ul className="mt-1 space-y-1">{campusMateCategories.map(item => <li key={item.id}><a href={item.photo.source} target="_blank" rel="noopener noreferrer" className="underline">{item.label} · {item.photo.creator}</a></li>)}</ul>
            <p className="mt-2"><a href="https://www.pexels.com/license/" target="_blank" rel="noopener noreferrer" className="underline">Pexels License</a></p>
          </details>
        </div>
      </div>
    </main>
  );
}
