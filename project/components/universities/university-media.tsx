'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Building2, CalendarDays, ChevronRight, Megaphone } from 'lucide-react';

type MediaKind = 'logo' | 'campus';

interface UniversityMediaProps {
  src?: string | null;
  fallbackSrc?: string | null;
  alt: string;
  name: string;
  shortName?: string | null;
  kind: MediaKind;
  className?: string;
  loading?: 'eager' | 'lazy';
}

function getInitials(name: string, shortName?: string | null) {
  const value = shortName?.trim() || name.trim();
  const words = value.split(/\s+/).filter(Boolean);
  const initials = words.length > 1 ? words.slice(0, 3).map((word) => word[0]).join('') : value.slice(0, 3);
  return initials.toUpperCase();
}

function FallbackMedia({ name, shortName, kind, className = '' }: Pick<UniversityMediaProps, 'name' | 'shortName' | 'kind' | 'className'>) {
  if (kind === 'logo') {
    return (
      <span className={`flex h-full w-full items-center justify-center rounded-[inherit] bg-gradient-to-br from-primary/15 via-white to-accent/20 text-center text-xs font-bold tracking-wide text-primary ${className}`} aria-label={`${name} logo placeholder`}>
        <span className="flex h-9 w-9 items-center justify-center rounded-full border border-primary/20 bg-white/80 px-1 text-[10px] font-extrabold shadow-sm">
          {getInitials(name, shortName)}
        </span>
      </span>
    );
  }

  return (
    <span className={`relative flex h-full w-full items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_18%_20%,rgba(255,255,255,.9),transparent_30%),linear-gradient(135deg,#d1fae5,#dbeafe_52%,#fef3c7)] ${className}`} aria-label={`${name} campus image placeholder`}>
      <span className="absolute -right-8 -top-10 select-none text-[10rem] font-black leading-none text-primary/10">{getInitials(name, shortName)}</span>
      <span className="relative flex max-w-[86%] flex-col items-center gap-2 text-center text-primary">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/80 bg-white/75 shadow-sm backdrop-blur-sm">
          <Building2 className="h-7 w-7" aria-hidden="true" />
        </span>
        <span className="rounded-full border border-white/80 bg-white/85 px-3 py-1 text-xs font-bold shadow-sm backdrop-blur-sm">
          {shortName || name} campus profile
        </span>
        <span className="text-[11px] font-medium text-slate-600">Official campus image pending</span>
      </span>
    </span>
  );
}

export function UniversityMedia({ src, fallbackSrc, alt, name, shortName, kind, className, loading = 'lazy' }: UniversityMediaProps) {
  const candidates = useMemo(() => Array.from(new Set([src, fallbackSrc].filter((value): value is string => Boolean(value)))), [src, fallbackSrc]);
  const [candidateIndex, setCandidateIndex] = useState(0);

  useEffect(() => setCandidateIndex(0), [candidates]);

  const currentSrc = candidates[candidateIndex];
  if (!currentSrc) return <FallbackMedia name={name} shortName={shortName} kind={kind} className={className} />;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={currentSrc}
      alt={alt}
      loading={loading}
      className={className}
      onError={() => setCandidateIndex((index) => index + 1)}
    />
  );
}

export function UniversityLogo({ src, fallbackSrc, name, shortName, alt, className = '' }: Omit<UniversityMediaProps, 'kind'>) {
  return <UniversityMedia src={src} fallbackSrc={fallbackSrc} alt={alt} name={name} shortName={shortName} kind="logo" className={className} />;
}

export type CampusStory = {
  id: string;
  kind: 'campus' | 'event' | 'news';
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  href?: string | null;
  label?: string;
  dateLabel?: string | null;
};

interface CampusShowcaseProps {
  universityName: string;
  universityShortName: string;
  campusImageUrl?: string | null;
  localCampusImageUrl?: string | null;
  stories: CampusStory[];
}

function storyLabel(story: CampusStory) {
  if (story.label) return story.label;
  if (story.kind === 'event') return 'Campus event';
  if (story.kind === 'news') return 'Campus news';
  return 'Campus spotlight';
}

export function CampusShowcase({ universityName, universityShortName, campusImageUrl, localCampusImageUrl, stories }: CampusShowcaseProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);

  const campusStory: CampusStory = {
    id: 'campus-spotlight',
    kind: 'campus',
    title: `${universityShortName} campus life`,
    description: `Explore what is happening around ${universityName}.`,
    imageUrl: campusImageUrl || localCampusImageUrl,
    label: 'Campus spotlight',
  };
  const slides = [campusStory, ...stories].slice(0, 7);
  const activeStory = slides[activeIndex] || slides[0];
  const hasMultipleSlides = slides.length > 1;

  useEffect(() => {
    if (!hasMultipleSlides || paused) return;
    const timer = window.setInterval(() => setActiveIndex((index) => (index + 1) % slides.length), 5600);
    return () => window.clearInterval(timer);
  }, [hasMultipleSlides, paused, slides.length]);

  const move = (direction: 1 | -1) => {
    setActiveIndex((index) => (index + direction + slides.length) % slides.length);
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    touchStartX.current = event.changedTouches[0]?.clientX ?? null;
    touchEndX.current = null;
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    touchEndX.current = event.changedTouches[0]?.clientX ?? null;
    if (touchStartX.current === null || touchEndX.current === null) return;
    const distance = touchStartX.current - touchEndX.current;
    if (Math.abs(distance) < 42 || !hasMultipleSlides) return;
    move(distance > 0 ? 1 : -1);
  };

  if (!activeStory) return null;

  return (
    <div
      className="relative overflow-hidden rounded-[1.75rem] border border-white/15 bg-slate-950 shadow-xl shadow-primary/10"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      aria-roledescription="carousel"
      aria-label={`${universityShortName} campus stories`}
    >
      <div className="relative aspect-[16/11] min-h-[260px] sm:aspect-[16/9]">
        <UniversityMedia
          key={`${activeStory.id}-${activeIndex}`}
          src={activeStory.imageUrl}
          fallbackSrc={localCampusImageUrl}
          alt={activeStory.title}
          name={universityName}
          shortName={universityShortName}
          kind="campus"
          loading="eager"
          className="absolute inset-0 h-full w-full object-cover transition-opacity duration-500"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/35 to-slate-950/5" />

        <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full border border-white/20 bg-slate-950/45 px-3 py-1.5 text-[11px] font-semibold text-white backdrop-blur-md">
          {activeStory.kind === 'event' ? <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" /> : activeStory.kind === 'news' ? <Megaphone className="h-3.5 w-3.5" aria-hidden="true" /> : <Building2 className="h-3.5 w-3.5" aria-hidden="true" />}
          {storyLabel(activeStory)}
        </div>

        {hasMultipleSlides && (
          <div className="absolute right-4 top-4 flex gap-2">
            <button type="button" onClick={() => move(-1)} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/25 bg-slate-950/45 text-white backdrop-blur-md transition hover:bg-slate-950/70" aria-label="Previous campus story">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => move(1)} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/25 bg-slate-950/45 text-white backdrop-blur-md transition hover:bg-slate-950/70" aria-label="Next campus story">
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="absolute inset-x-4 bottom-4 pr-2 text-white sm:bottom-5 sm:inset-x-6">
          {activeStory.dateLabel && <p className="mb-1 text-xs font-medium text-white/75">{activeStory.dateLabel}</p>}
          <h2 className="max-w-xl text-xl font-bold tracking-tight sm:text-2xl">{activeStory.title}</h2>
          {activeStory.description && <p className="mt-1 line-clamp-2 max-w-xl text-sm text-white/80">{activeStory.description}</p>}
          {activeStory.href && (
            <Link href={activeStory.href} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-white underline-offset-4 hover:underline">
              View details <ChevronRight className="h-4 w-4" />
            </Link>
          )}
          {hasMultipleSlides && (
            <div className="mt-4 flex items-center gap-1.5" role="tablist" aria-label="Campus stories">
              {slides.map((slide, index) => (
                <button
                  key={slide.id}
                  type="button"
                  role="tab"
                  aria-selected={index === activeIndex}
                  aria-label={`Show ${storyLabel(slide)} ${index + 1}`}
                  onClick={() => setActiveIndex(index)}
                  className={`h-1.5 rounded-full transition-all ${index === activeIndex ? 'w-7 bg-white' : 'w-1.5 bg-white/45'}`}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
