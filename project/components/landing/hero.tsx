'use client';

import Link from 'next/link';
import { SearchBar } from '@/components/shared/search-bar';
import { ArrowRight, Building2, CheckCircle2, ChevronDown, MapPin, ShieldCheck, Star, Store, Users } from 'lucide-react';

interface HeroProps {
  vendorCount: number;
  universityCount: number;
  reviewCount: number;
  featuredBusinesses: Array<{
    id: string;
    business_name: string;
    business_type: string | null;
    rating_avg: number;
    rating_count: number;
  }>;
}

export function Hero({ vendorCount, universityCount, reviewCount, featuredBusinesses }: HeroProps) {
  return (
    <section className="relative overflow-hidden border-b border-primary-900/40 bg-[#073b31] text-white">
      <div className="pointer-events-none absolute inset-0 bg-dot opacity-20" aria-hidden="true" />
      <div className="pointer-events-none absolute -right-32 -top-32 h-80 w-80 rounded-full bg-primary/20 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-40 left-1/3 h-96 w-96 rounded-full bg-accent/10 blur-3xl" aria-hidden="true" />

      <div className="container relative max-w-7xl py-12 sm:py-16 lg:py-20">
        <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/90 backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-[#f2b134]" /> Ghana&apos;s campus network
            </div>
            <h1 className="mt-5 max-w-3xl font-display text-4xl font-bold leading-[1.06] tracking-tight sm:text-5xl lg:text-6xl">
              Connect with the people, services and opportunities around you.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-white/75 sm:text-lg">
              UniEco Ghana brings students, businesses and universities into one trusted platform built for discovery, collaboration and growth across the country.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/discover" className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-3 text-sm font-bold text-[#073b31] shadow-lg shadow-black/10 transition-transform hover:-translate-y-0.5">
                Explore the network <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/universities" className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-white/15">
                <MapPin className="h-4 w-4" /> Choose your campus <ChevronDown className="h-4 w-4" />
              </Link>
            </div>

            <div className="mt-8 max-w-2xl rounded-2xl border border-white/15 bg-white p-2 shadow-2xl shadow-black/10">
              <SearchBar className="w-full" autoFocus={false} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium text-white/65">
              <span className="mr-1 py-2">Popular:</span>
              {[
                { label: 'Food', href: '/discover?category=food' },
                { label: 'Services', href: '/discover?category=services' },
                { label: 'Products', href: '/marketplace' },
                { label: 'Events', href: '/events' },
              ].map((item) => <Link key={item.label} href={item.href} className="rounded-full border border-white/15 px-3 py-1.5 transition-colors hover:border-white/40 hover:text-white">{item.label}</Link>)}
            </div>

            <div className="mt-9 grid max-w-2xl grid-cols-3 divide-x divide-white/15 border-t border-white/15 pt-5">
              <Stat icon={Store} value={vendorCount} label="Businesses" />
              <Stat icon={Building2} value={universityCount} label="Universities" />
              <Stat icon={ShieldCheck} value={reviewCount} label="Reviews" />
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-md lg:ml-auto">
            <div className="absolute -inset-4 rounded-[2rem] bg-white/5 blur-xl" aria-hidden="true" />
            <div className="relative overflow-hidden rounded-[1.5rem] border border-white/15 bg-white p-5 text-foreground shadow-2xl shadow-black/20 sm:p-6">
              <div className="flex items-start justify-between gap-4 border-b border-border pb-5">
                <div>
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-primary"><span className="h-2 w-2 rounded-full bg-primary" /> Campus pulse</div>
                  <h2 className="mt-2 font-display text-2xl font-bold tracking-tight">What&apos;s happening around Ghana</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Discover trusted listings from the UniEco community.</p>
                </div>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Users className="h-5 w-5" /></span>
              </div>

              <div className="mt-5 space-y-3">
                {featuredBusinesses.slice(0, 3).map((business) => (
                  <DiscoveryCard key={business.id} title={business.business_name} category={business.business_type || 'Campus business'} rating={business.rating_count && Number.isFinite(Number(business.rating_avg)) ? Number(business.rating_avg).toFixed(1) : ''} />
                ))}
                {!featuredBusinesses.length && <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">Businesses will appear here as campus listings go live.</p>}
              </div>

              <Link href="/discover" className="mt-5 flex items-center justify-between rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90">Browse all businesses <ArrowRight className="h-4 w-4" /></Link>
              <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><CheckCircle2 className="h-4 w-4 text-primary" /> Verified people and businesses from your community.</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Stat({ icon: Icon, value, label }: { icon: typeof Store; value: number; label: string }) {
  return <div className="flex flex-col items-center gap-1 px-2 text-center first:pl-0 last:pr-0"><Icon className="h-4 w-4 text-[#f2b134]" /><span className="font-display text-xl font-bold text-white sm:text-2xl">{value.toLocaleString()}</span><span className="text-[10px] font-semibold uppercase tracking-wide text-white/60">{label}</span></div>;
}

function DiscoveryCard({ title, category, rating }: { title: string; category: string; rating: string }) {
  return <div className="flex items-center gap-3 rounded-xl border border-border bg-background p-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Store className="h-5 w-5" /></span><div className="min-w-0 flex-1"><div className="flex items-center gap-1.5"><p className="truncate text-sm font-semibold text-foreground">{title}</p><CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" /></div><p className="mt-0.5 truncate text-xs text-muted-foreground">{category}</p></div>{rating && <span className="flex items-center gap-1 text-xs font-semibold text-foreground"><Star className="h-3.5 w-3.5 fill-secondary text-secondary" />{rating}</span>}</div>;
}
