'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Building2, MapPinned, Package, Store } from 'lucide-react';
import { SearchBar } from '@/components/shared/search-bar';

interface HeroProps {
  vendorCount: number;
  universityCount: number;
  productCount: number;
}

const campusBackgrounds = [
  { src: '/assets/homepage/knust-landmark.jpg', alt: 'KNUST campus landmark', position: 'center 48%' },
  { src: '/assets/homepage/ucc-gate.jpg', alt: 'University of Cape Coast entrance', position: 'center 50%' },
  { src: '/assets/homepage/campus-building.jpg', alt: 'University campus building', position: 'center 52%' },
  { src: '/assets/homepage/campus-clocktower.jpg', alt: 'Campus clock tower', position: 'center 45%' },
];

export function Hero({ vendorCount, universityCount, productCount }: HeroProps) {
  const [activeBackground, setActiveBackground] = useState(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => {
      setActiveBackground((current) => (current + 1) % campusBackgrounds.length);
    }, 7000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section className="relative isolate overflow-hidden bg-[#062d27] text-white">
      <div className="absolute inset-0 -z-20 overflow-hidden bg-[#062d27]" aria-hidden="true">
        {campusBackgrounds.map((background, index) => (
          <Image
            key={background.src}
            src={background.src}
            alt=""
            fill
            priority={index === 0}
            sizes="100vw"
            style={{
              objectPosition: background.position,
              opacity: activeBackground === index ? 1 : 0,
            }}
            className="object-cover saturate-[0.86] transition-opacity duration-1000 motion-reduce:transition-none"
          />
        ))}
      </div>

      <div
        className="absolute inset-0 -z-10"
        aria-hidden="true"
        style={{
          background: 'linear-gradient(90deg, rgba(6,45,39,.94) 0%, rgba(6,45,39,.84) 42%, rgba(6,45,39,.62) 100%), linear-gradient(0deg, rgba(6,45,39,.36), rgba(6,45,39,.14))',
        }}
      />
      <div className="absolute -left-36 top-16 -z-10 h-72 w-72 rounded-full bg-emerald-400/10 blur-3xl" aria-hidden="true" />

      <div className="container relative max-w-7xl py-12 sm:py-16 lg:flex lg:min-h-[690px] lg:items-center lg:py-20">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-[#062d27]/55 px-3.5 py-2 text-xs font-semibold text-white/90 shadow-sm backdrop-blur-md sm:text-sm">
            <span className="h-2 w-2 rounded-full bg-[#f4bd35] shadow-[0_0_12px_rgba(244,189,53,.7)]" />
            Your campus. Your marketplace. Your community.
          </div>

          <h1 className="mt-6 max-w-[13ch] font-display text-[2.75rem] font-bold leading-[1.02] tracking-[-0.045em] sm:text-6xl lg:text-[4.6rem]">
            Campus life,
            <span className="mt-1 block text-[#f4c343]">all in one place.</span>
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-white/80 sm:text-lg sm:leading-8">
            Find campus businesses, useful services, events and places across universities in Ghana.
          </p>

          <div className="mt-7 flex flex-col gap-3 min-[420px]:flex-row">
            <Link
              href="/discover"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#f4c343] px-5 text-sm font-bold text-[#172719] shadow-lg shadow-black/15 transition-colors hover:bg-[#ffda70] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#062d27]"
            >
              Explore campus <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/signup"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/30 bg-white/10 px-5 text-sm font-bold text-white backdrop-blur-sm transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              Join UniEco Ghana
            </Link>
          </div>

          <div className="mt-7 max-w-xl rounded-2xl border border-white/25 bg-white p-1.5 shadow-[0_16px_50px_rgba(0,0,0,.2)] sm:p-2">
            <SearchBar className="w-full" autoFocus={false} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-medium text-white/75 sm:text-sm">
            <span className="mr-1">Try:</span>
            {[
              { label: 'Food', href: '/discover?category=Food%20%26%20Drinks' },
              { label: 'Hostels', href: '/discover?category=Accommodation' },
              { label: 'Events', href: '/events' },
              { label: 'Campus Mate', href: '/campus-mate' },
            ].map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="inline-flex min-h-9 items-center rounded-full border border-white/20 bg-black/10 px-3.5 transition-colors hover:border-white/50 hover:bg-white/10 hover:text-white"
              >
                {item.label}
              </Link>
            ))}
          </div>

          <div className="mt-9 grid max-w-xl grid-cols-3 border-t border-white/20 pt-5">
            <Stat icon={Store} value={vendorCount} label="Businesses" />
            <Stat icon={Building2} value={universityCount} label="Universities" />
            <Stat icon={Package} value={productCount} label="Listings" />
          </div>

          <Link href="/campus-mate" className="mt-6 inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-white/85 transition-colors hover:text-white">
            <MapPinned className="h-4 w-4 text-[#f4c343]" />
            Find your way around campus <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
      <div className="ghana-stripe relative h-1 w-full" aria-hidden="true" />
    </section>
  );
}

function Stat({ icon: Icon, value, label }: { icon: typeof Store; value: number; label: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 pr-2 first:pl-0 sm:pr-4">
      <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/65 sm:text-xs">
        <Icon className="h-3.5 w-3.5 shrink-0 text-[#f4c343]" /> {label}
      </span>
      <span className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">{value.toLocaleString()}</span>
    </div>
  );
}
