'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Flag, Loader2, LocateFixed, MapPin, Pause, Play, RotateCcw, Route, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getGoogleMapsDirectionsUrl } from '@/lib/maps';
import { distanceMetres, formatJourneyDistance, formatJourneyTime, isJourneyPoint, journeyModes,
  type JourneyMode, type JourneyPoint, type JourneyRoute } from '@/lib/campus-mate/journey';
import { projectJourney } from '@/lib/campus-mate/route-diagram';
import { JourneyDiagram, journeyIcons } from './journey-diagram';
import { supabase } from '@/lib/supabase/client';

export type JourneyPlace = { id: string; name: string; position: JourneyPoint | null; address?: string | null; details?: string | null };
const demoRoute = [
  { x: 118, y: 250 }, { x: 208, y: 250 }, { x: 235, y: 232 }, { x: 235, y: 174 },
  { x: 298, y: 140 }, { x: 376, y: 140 }, { x: 409, y: 101 }, { x: 506, y: 101 },
];

export function CampusJourneyPlanner({ destination, startingPlaces, deviceLocation, onLocate, locating, locationMessage,
  onClear, mapFallback, enabled }: {
  destination: JourneyPlace | null;
  startingPlaces: JourneyPlace[];
  deviceLocation: JourneyPoint | null;
  onLocate: () => void;
  locating: boolean;
  locationMessage: string;
  onClear: () => void;
  mapFallback: string | null;
  enabled: boolean;
}) {
  const [mode, setMode] = useState<JourneyMode>('walk');
  const [startChoice, setStartChoice] = useState('device');
  const [route, setRoute] = useState<JourneyRoute | null>(null);
  const [demo, setDemo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [available, setAvailable] = useState(enabled);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [accessMessage, setAccessMessage] = useState('');
  const [accessAttempt, setAccessAttempt] = useState(0);
  const progressRef = useRef(0);
  const requestRef = useRef<AbortController | null>(null);
  const headingId = useId();
  const origin = startChoice === 'device' ? deviceLocation : startingPlaces.find(item => item.id === startChoice)?.position;
  const straightDistance = origin && destination?.position ? distanceMetres(origin, destination.position) : null;
  const samePoint = straightDistance != null && straightDistance < 12;
  const tooFar = straightDistance != null && straightDistance > 100_000;
  const points = useMemo(() => demo ? demoRoute : route ? projectJourney(route.shape) : [], [demo, route]);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort('timeout'), 12_000);
    setCheckingAccess(true);
    const check = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const response = await fetch('/api/maps/journey', {
          cache: 'no-store', signal: controller.signal,
          headers: session?.access_token ? { Authorization: 'Bearer ' + session.access_token } : {},
        });
        const result = await response.json();
        if (controller.signal.aborted) return;
        setAvailable(response.ok && result.enabled === true);
        setAccessMessage(response.ok ? '' : result.error || 'Routing is unavailable. Open Google Maps for directions.');
      } catch {
        if (!controller.signal.aborted || controller.signal.reason === 'timeout') {
          setAvailable(false);
          setAccessMessage('Couldn’t check routing. Retry below or open Google Maps.');
        }
      } finally {
        window.clearTimeout(timeout);
        if (!controller.signal.aborted || controller.signal.reason === 'timeout') setCheckingAccess(false);
      }
    };
    void check();
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [accessAttempt]);

  function seek(value: number) {
    progressRef.current = value;
    setProgress(value);
  }

  useEffect(() => () => { requestRef.current?.abort(); }, []);
  useEffect(() => {
    if (!playing || points.length < 2) return;
    let frame = 0;
    let previous: number | undefined;
    const replayDuration = demo ? 6500 : 9000;
    const render = (now: number) => {
      const delta = previous == null ? 0 : Math.min(now - previous, 70);
      previous = now;
      const value = Math.min(1, progressRef.current + delta / replayDuration);
      progressRef.current = value;
      setProgress(value);
      if (value < 1) frame = requestAnimationFrame(render);
      else setPlaying(false);
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [playing, points, demo]);

  const reset = () => {
    requestRef.current?.abort();
    requestRef.current = null;
    setPlaying(false);
    setRoute(null);
    setBusy(false);
    setDemo(false);
    setError('');
    seek(0);
  };

  const plan = async () => {
    const target = destination?.position;
    if (!isJourneyPoint(origin) || !isJourneyPoint(target) || busy || !available || checkingAccess || samePoint || tooFar) return;
    reset();
    const controller = new AbortController();
    requestRef.current = controller;
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (controller.signal.aborted) return;
      const response = await fetch('/api/maps/journey', {
        method: 'POST', cache: 'no-store', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: 'Bearer ' + session.access_token } : {}) },
        body: JSON.stringify({ from: origin, to: target, mode }),
      });
      const data = await response.json().catch(() => null) as { route?: JourneyRoute; error?: string } | null;
      const nextRoute = data?.route;
      if (!response.ok || !nextRoute || !Array.isArray(nextRoute.shape) || nextRoute.shape.length < 2) {
        throw new Error(data?.error || 'The route is temporarily unavailable. Try again or open directions.');
      }
      if (controller.signal.aborted) return;
      setRoute(nextRoute);
      setPlaying(!window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Couldn’t load the route.');
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };

  const handoff = destination ? getGoogleMapsDirectionsUrl({
    ...destination.position, address: destination.address,
  }, startChoice === 'device' ? undefined : origin ?? undefined, journeyModes[mode].google) : null;

  return <section aria-labelledby={headingId} className="overflow-hidden rounded-[1.6rem] border bg-card shadow-sm">
    <div className="flex items-start justify-between gap-3 border-b px-4 py-4 sm:px-6">
      <div className="min-w-0">
        <p className="inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[.17em] text-primary"><Route className="h-3.5 w-3.5" aria-hidden /> Campus Mate · Journey</p>
        <h2 id={headingId} className="mt-1 break-words text-xl font-extrabold tracking-tight sm:text-2xl">{destination?.name || 'Plan a trip'}</h2>
        {!destination && <p className="mt-1 text-sm text-muted-foreground">Select a place, choose how to travel, and preview the route.</p>}
      </div>
      {destination && <Button type="button" variant="ghost" onClick={onClear} aria-label="Clear place" className="h-11 w-11 shrink-0 px-2 sm:w-auto">
        <X className="h-4 w-4" aria-hidden /><span className="ml-1 hidden sm:inline">Clear place</span>
      </Button>}
    </div>
    <div className="grid min-w-0 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,.85fr)]">
      <div className="min-w-0 bg-[#0b2724]">
        {route || (demo && !destination) ? <JourneyDiagram points={points} mode={mode} progress={progress} playing={playing} demo={demo} /> :
          <div className="flex min-h-44 flex-col justify-center gap-3 p-5 text-white sm:p-7">
            <MapPin className="h-8 w-8 text-emerald-200" aria-hidden />
            <p className="text-lg font-bold">{destination ? 'Your route to ' + destination.name : 'Where would you like to go?'}</p>
            <p className="text-sm leading-6 text-emerald-50">{busy ? 'Finding a mapped route…' : destination ? 'Choose your starting point and travel mode below. Your real route appears here after it is calculated.' : 'Choose a place from the campus results to get started.'}</p>
          </div>}
        {(route || (demo && !destination)) && points.length > 1 && <div className="flex flex-wrap items-center gap-2 bg-card p-3 sm:px-5">
          <Button type="button" variant="outline" size="icon" onClick={() => { if (progressRef.current >= 1) seek(0); setPlaying(!playing); }}
            aria-label={playing ? 'Pause preview' : 'Play preview'} className="h-11 w-11 shrink-0">
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <Button type="button" variant="ghost" size="icon" onClick={() => { setPlaying(false); seek(0); }} className="h-11 w-11 shrink-0" aria-label="Reset preview"><RotateCcw className="h-4 w-4" /></Button>
          <label className="ml-1 flex min-w-28 flex-1 items-center gap-2 text-xs font-semibold">
            <span className="sr-only">Route preview progress</span>
            <input className="h-11 min-w-0 flex-1 accent-primary" type="range" min={0} max={100} value={Math.round(progress * 100)} onChange={(event) => { setPlaying(false); seek(Number(event.target.value) / 100); }} />
            <span className="w-9 shrink-0 text-right tabular-nums" aria-hidden>{Math.round(progress * 100)}%</span>
          </label>
        </div>}
      </div>
      <div className="min-w-0 space-y-4 p-4 sm:p-6">
        <fieldset className="min-w-0">
          <legend className="mb-2 text-xs font-bold">How are you travelling?</legend>
          <div className="grid grid-cols-4 gap-1.5">
            {(Object.keys(journeyModes) as JourneyMode[]).map((key) => {
              const Icon = journeyIcons[key];
              return <button type="button" key={key} aria-pressed={key === mode}
                onClick={() => { if (key !== mode) { const keepDemo = demo; reset(); setMode(key); if (keepDemo) setDemo(true); } }}
                className={cn('flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl border px-0.5 text-[10px] font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring sm:text-xs',
                  key === mode ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted')}>
                <Icon className="h-5 w-5" aria-hidden /><span>{journeyModes[key].label}</span>
              </button>;
            })}
          </div>
        </fieldset>
        {destination?.position && available && !checkingAccess && <div className="space-y-2">
          <label className="flex min-w-0 flex-col gap-1.5 text-xs font-bold">Starting point
            <select value={startChoice} onChange={(event) => { reset(); setStartChoice(event.target.value); }} className="min-h-11 min-w-0 w-full rounded-xl border bg-background px-2.5 text-sm font-medium">
              <option value="device">My location</option>
              {startingPlaces.filter(place => place.id !== destination.id).map(place => <option value={place.id} key={place.id}>{place.name}</option>)}
            </select>
          </label>
          {startChoice === 'device' && !deviceLocation && <Button type="button" variant="outline" disabled={locating} onClick={onLocate} className="min-h-11 w-full">
            {locating ? <Loader2 className="mr-1.5 h-4 w-4 motion-safe:animate-spin" /> : <LocateFixed className="mr-1.5 h-4 w-4" />} Use my location
          </Button>}
          {startChoice === 'device' && !deviceLocation && locationMessage && <p role="status" className="text-xs text-muted-foreground">{locationMessage}</p>}
          {startChoice === 'device' && <p className="text-[11px] leading-4 text-muted-foreground">Location is sent to the routing service only when you request a route. No live tracking.</p>}
          {samePoint && <p className="text-xs text-muted-foreground">You’re already near this pin. Choose a different starting point to preview the route.</p>}
          {tooFar && <p className="text-xs text-muted-foreground">Choose a starting point within 100 km of the destination for a Campus Mate preview.</p>}
        </div>}
        {destination && !destination.position && <p className="text-sm text-muted-foreground"><MapPin className="mr-1 inline h-4 w-4" aria-hidden /> This place has no public map pin. {handoff ? 'Open the address in Google Maps instead.' : 'Check the listing for location details.'}</p>}
        {checkingAccess && <p role="status" className="text-sm text-muted-foreground">Checking route access…</p>}
        {!checkingAccess && !available && <div role="status" className="space-y-2 rounded-xl border p-3">
          <p className="text-sm text-muted-foreground">{accessMessage || 'Routing is unavailable. Open Google Maps for directions.'}</p>
          <Button type="button" variant="outline" className="min-h-11" onClick={() => setAccessAttempt(value => value + 1)}>Recheck route access</Button>
        </div>}
        {error && <p role="status" className="rounded-xl border border-amber-600/35 bg-amber-500/10 p-2.5 text-xs leading-5">{error}</p>}
        {route && <div aria-live="polite" className="grid grid-cols-2 divide-x rounded-xl border bg-muted/30">
          <span className="px-3 py-2.5 text-xs text-muted-foreground"><strong className="block text-lg font-extrabold text-foreground">{formatJourneyTime(route.seconds)}</strong>Estimated time</span>
          <span className="px-3 py-2.5 text-xs text-muted-foreground"><strong className="block text-lg font-extrabold text-foreground">{formatJourneyDistance(route.metres)}</strong>Route distance</span>
        </div>}
        <div className="flex flex-wrap gap-2">
          {destination?.position && available && !checkingAccess && <Button type="button" disabled={!origin || busy || locating || samePoint || tooFar} onClick={() => void plan()} className="min-h-11 flex-1 rounded-xl">
            {busy ? <><Loader2 className="mr-2 h-4 w-4 motion-safe:animate-spin" /> Finding route…</> : <><Flag className="mr-2 h-4 w-4" /> {route ? 'Recalculate' : 'Preview route'}</>}
          </Button>}
          {(handoff || (!destination && mapFallback)) && <Button variant="outline" asChild className="min-h-11 rounded-xl">
            <a href={(handoff || mapFallback)!} target="_blank" rel="noopener noreferrer">Google Maps <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" /></a>
          </Button>}
          {!destination && !route && !busy && <Button type="button" variant="ghost" className="min-h-11 rounded-xl" onClick={() => {
            reset(); setDemo(true); setPlaying(!window.matchMedia('(prefers-reduced-motion: reduce)').matches);
          }}>Try animation</Button>}
          {destination?.details && <Button variant="ghost" className="min-h-11 rounded-xl" asChild><a href={destination.details}>Place details <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" /></a></Button>}
        </div>
        {route?.steps.length ? <details open className="rounded-xl border p-3 text-sm">
          <summary className="cursor-pointer font-bold">Route steps</summary>
          <ol className="mt-2 max-h-60 list-decimal space-y-2 overflow-auto pl-5 text-xs leading-5">
            {route.steps.map((step, index) => <li key={index}>{step.instruction}{step.metres > 0 ? ` · ${formatJourneyDistance(step.metres)}` : ''}</li>)}
          </ol>
        </details> : null}
        {route && <p className="text-[11px] text-muted-foreground">Routing by Valhalla · © <a className="underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>. Check local road and access conditions.</p>}
      </div>
    </div>
  </section>;
}
