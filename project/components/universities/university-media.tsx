'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, ChevronLeft, ChevronRight, GraduationCap, Images, Pause, Play } from 'lucide-react';
import type { CampusPhoto } from '@/lib/data/campus-presentation';

interface UniversityMediaProps {
  src?: string | null;
  fallbackSrc?: string | null;
  alt: string;
  name: string;
  shortName?: string | null;
  kind: 'logo' | 'campus';
  className?: string;
  loading?: 'eager' | 'lazy';
  logoObjectPosition?: 'left' | 'center' | 'right';
  priority?: boolean;
  onUnavailable?: (src: string) => void;
}

function getInitials(name: string, shortName?: string | null) {
  const value = shortName?.trim() || name.trim();
  const words = value.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return (words.length > 1 ? words.slice(0, 4).map((word) => word[0]).join('') : value.slice(0, 4)).toUpperCase();
}

function FallbackMedia({ name, shortName, kind, className = '' }: Pick<UniversityMediaProps, 'name' | 'shortName' | 'kind' | 'className'>) {
  if (kind === 'logo') {
    return <span className={`flex h-full w-full items-center justify-center rounded-[inherit] bg-emerald-950 text-center text-xs font-bold tracking-wide text-emerald-100 ${className}`} aria-hidden="true">
      {getInitials(name, shortName)}
    </span>;
  }

  return <div className={`relative isolate flex h-full w-full items-center justify-center overflow-hidden bg-[#082b27] text-white ${className}`}>
    <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_10%_5%,#176456,transparent_67%),repeating-linear-gradient(140deg,transparent_0_32px,#ffffff09_33px_34px)]" />
    <span aria-hidden="true" className="pointer-events-none absolute -bottom-6 right-3 select-none text-[clamp(4.5rem,15vw,9rem)] font-black leading-none tracking-tighter text-white/[0.085]">{getInitials(name, shortName)}</span>
    <div className="relative flex max-w-[80%] flex-col items-center gap-3 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl border border-white/20 bg-white/10"><GraduationCap className="h-6 w-6" aria-hidden="true" /></span>
      <span className="text-xs font-semibold uppercase tracking-[0.15em] text-emerald-100">Campus directory</span>
    </div>
  </div>;
}

export function UniversityMedia({ src, fallbackSrc, ...props }: UniversityMediaProps) {
  // Reset failed-source tracking when the gallery or a filtered card changes.
  return <MediaImage key={JSON.stringify([src, fallbackSrc])} src={src} fallbackSrc={fallbackSrc} {...props} />;
}

function MediaImage({ src, fallbackSrc, alt, name, shortName, kind, className, loading = 'lazy', logoObjectPosition, priority, onUnavailable }: UniversityMediaProps) {
  const [failed, setFailed] = useState(0);
  const [wide, setWide] = useState(false);
  const candidates = Array.from(new Set([src, fallbackSrc].filter(Boolean)));
  const currentSrc = candidates[failed];
  if (!currentSrc) return <FallbackMedia name={name} shortName={shortName} kind={kind} className={className} />;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={currentSrc}
      src={currentSrc}
      alt={alt}
      loading={priority ? 'eager' : loading}
      fetchPriority={priority ? 'high' : undefined}
      className={className}
      decoding="async"
      referrerPolicy="no-referrer"
      style={kind === 'logo' ? {
        objectFit: wide && logoObjectPosition ? 'cover' : 'contain',
        objectPosition: logoObjectPosition || 'center',
      } : undefined}
      onLoad={(event) => {
        if (kind === 'logo' && logoObjectPosition) setWide(event.currentTarget.naturalWidth / Math.max(event.currentTarget.naturalHeight, 1) > 1.7);
      }}
      onError={() => {
        if (failed + 1 >= candidates.length) onUnavailable?.(currentSrc);
        setWide(false);
        setFailed((index) => index + 1);
      }}
    />
  );
}

export function UniversityLogo({ className = '', ...props }: Omit<UniversityMediaProps, 'kind'>) {
  return <UniversityMedia {...props} kind="logo" className={`block h-full w-full ${className}`} />;
}

const galleryButton = 'grid h-11 w-11 shrink-0 place-items-center rounded-full text-white transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white';

export function CampusPhotoGallery({ photos: suppliedPhotos, name, shortName, href, variant = 'profile', priority = false }: {
  photos: CampusPhoto[];
  name: string;
  shortName: string;
  href?: string;
  variant?: 'profile' | 'card';
  priority?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [motionOverride, setMotionOverride] = useState<boolean | null>(null);
  const [reduceMotion, setReduceMotion] = useState(true);
  const [isInView, setIsInView] = useState(false);
  const [isTabVisible, setIsTabVisible] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const galleryRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const photos = useMemo(() => suppliedPhotos.filter((photo) => !unavailable.includes(photo.src)), [suppliedPhotos, unavailable]);
  const moreThanOne = photos.length > 1;
  const activeIndex = index % (photos.length || 1);
  const activePhoto = photos[activeIndex];
  const autoRotate = motionOverride ?? !reduceMotion;

  useEffect(() => {
    if (!moreThanOne) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncPreference = () => setReduceMotion(preference.matches);
    const syncVisibility = () => setIsTabVisible(!document.hidden);
    syncPreference();
    syncVisibility();
    preference.addEventListener?.('change', syncPreference);
    document.addEventListener('visibilitychange', syncVisibility);
    return () => {
      preference.removeEventListener?.('change', syncPreference);
      document.removeEventListener('visibilitychange', syncVisibility);
    };
  }, [moreThanOne]);

  useEffect(() => {
    if (!moreThanOne || !galleryRef.current) return;
    // Without visibility events, leave manual browsing available.
    if (!('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(([entry]) => setIsInView(entry.intersectionRatio >= 0.3), { threshold: [0, 0.3] });
    observer.observe(galleryRef.current);
    return () => observer.disconnect();
  }, [moreThanOne]);

  useEffect(() => {
    if (!moreThanOne || !autoRotate || !isInView || !isTabVisible || isHovered || isFocused) return;
    const offset = variant === 'card' ? Array.from(name).reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % 1300 : 0;
    const next = photos[(activeIndex + 1) % photos.length];
    const preloader = new window.Image();
    preloader.referrerPolicy = 'no-referrer';
    preloader.src = next.src;
    const timer = window.setTimeout(() => setIndex((activeIndex + 1) % photos.length), 6500 + offset);
    return () => window.clearTimeout(timer);
  }, [activeIndex, autoRotate, isFocused, isHovered, isInView, isTabVisible, moreThanOne, name, photos, variant]);

  function move(direction: -1 | 1) {
    if (!moreThanOne) return;
    const next = (activeIndex + direction + photos.length) % photos.length;
    setIndex(next);
    setMotionOverride(false);
    setAnnouncement(`Photo ${next + 1} of ${photos.length}: ${photos[next].alt}`);
  }

  const card = variant === 'card';
  return <div
    ref={galleryRef}
    role="group"
    aria-roledescription={moreThanOne ? 'carousel' : undefined}
    aria-label={`${shortName} campus photos`}
    className={`relative isolate overflow-hidden bg-[#082b27] ${card ? 'aspect-[2/1]' : 'aspect-[5/3] max-h-[420px] sm:aspect-[2.2/1] lg:aspect-[3/1]'}`}
    onMouseEnter={() => setIsHovered(true)}
    onMouseLeave={() => setIsHovered(false)}
    onFocusCapture={() => setIsFocused(true)}
    onBlurCapture={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setIsFocused(false);
    }}
    onTouchStart={(event) => {
      const touch = event.touches[0];
      touchStart.current = !card && touch ? { x: touch.clientX, y: touch.clientY } : null;
    }}
    onTouchEnd={(event) => {
      if (!touchStart.current || !moreThanOne) return;
      const start = touchStart.current;
      touchStart.current = null;
      const touch = event.changedTouches[0];
      if (!touch) return;
      const distance = start.x - touch.clientX;
      if (Math.abs(distance) > 45 && Math.abs(distance) > Math.abs(start.y - touch.clientY) * 1.3) move(distance > 0 ? 1 : -1);
    }}
  >
    <UniversityMedia
      src={activePhoto?.src}
      onUnavailable={(src) => setUnavailable((current) => current.includes(src) ? current : [...current, src])}
      alt={activePhoto?.alt || `${name} campus`}
      name={name}
      shortName={shortName}
      kind="campus"
      priority={priority && activeIndex === 0}
      loading={activeIndex ? 'eager' : 'lazy'}
      className="absolute inset-0 h-full w-full object-cover"
    />
    {href && <Link href={href} prefetch={false} tabIndex={-1} aria-hidden="true" className="absolute inset-0 z-10" />}
    {activePhoto && (!card || moreThanOne) && <>
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/60 to-transparent" />
      {!card && <span className="absolute left-3 top-3 z-20 inline-flex items-center gap-1.5 rounded-full bg-slate-950/90 px-3 py-1.5 text-xs font-semibold text-white sm:left-5 sm:top-5"><Images className="h-4 w-4" aria-hidden="true" /> Campus in pictures</span>}
      {!card && activePhoto.sourceUrl && <a href={activePhoto.sourceUrl} target="_blank" rel="noopener noreferrer" className="absolute right-3 top-3 z-20 inline-flex min-h-11 items-center gap-1 rounded-full bg-slate-950/90 px-3 text-xs font-semibold text-white hover:bg-slate-900 sm:right-5 sm:top-5" aria-label="View the original photo source">Source <ArrowUpRight className="h-4 w-4" aria-hidden="true" /></a>}
      {moreThanOne && <div className={`absolute z-20 flex items-center gap-0.5 rounded-full border border-white/25 bg-slate-950/90 p-0.5 shadow-lg ${card ? 'bottom-2 right-2' : 'bottom-3 right-3 sm:bottom-5 sm:right-5'}`}>
        <button type="button" onClick={() => move(-1)} className={galleryButton} aria-label="Previous campus photo"><ChevronLeft className="h-5 w-5" /></button>
        <span className="min-w-8 select-none text-center text-xs font-semibold tabular-nums text-white" aria-hidden="true">{activeIndex + 1}/{photos.length}</span>
        <button type="button" onClick={() => move(1)} className={galleryButton} aria-label="Next campus photo"><ChevronRight className="h-5 w-5" /></button>
        <button type="button" onClick={() => setMotionOverride(!autoRotate)} className={galleryButton} aria-label={autoRotate ? 'Pause campus photo rotation' : 'Play campus photo rotation'}>{autoRotate ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</button>
      </div>}
      {!card && <span className="sr-only" role="status">{announcement}</span>}
    </>}
  </div>;
}
