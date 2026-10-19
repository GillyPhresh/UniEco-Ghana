'use client';

import Link from 'next/link';
import { SearchBar } from '@/components/shared/search-bar';
import { ArrowRight, Building2, CalendarDays, CheckCircle2, ChevronDown, MapPin, Search, ShieldCheck, Star, Store } from 'lucide-react';

interface HeroProps { vendorCount: number; universityCount: number; reviewCount: number; }

export function Hero({ vendorCount, universityCount, reviewCount }: HeroProps) {
  return (
    <section className="border-b border-border bg-[#f7faf9]">
      <div className="container max-w-6xl py-5 sm:py-8">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-primary">Campus marketplace</p>
              <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">What do you need today?</h1>
            </div>
            <Link href="/universities" className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground shadow-sm">
              <MapPin className="h-3.5 w-3.5 text-primary" /> UENR <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </Link>
          </div>

          <div className="mt-5 rounded-2xl border border-border bg-card p-2 shadow-sm">
            <SearchBar className="w-full" autoFocus={false} />
          </div>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
            {[
              { label: 'Food', href: '/discover?category=food' },
              { label: 'Services', href: '/discover?category=services' },
              { label: 'Products', href: '/marketplace' },
              { label: 'Events', href: '/events' },
            ].map((item, index) => (
              <Link key={item.label} href={item.href} className={`shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${index === 0 ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground'}`}>
                {item.label}
              </Link>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-3 divide-x divide-border rounded-2xl border border-border bg-card p-3 shadow-sm">
            <Stat icon={Store} value={vendorCount} label="Businesses" />
            <Stat icon={Building2} value={universityCount} label="Universities" />
            <Stat icon={ShieldCheck} value={reviewCount} label="Reviews" />
          </div>
        </div>

        <div className="mx-auto mt-5 max-w-3xl rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <div className="flex items-start justify-between gap-3 border-b border-border pb-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">Discover near you</p>
              <h2 className="mt-1 font-display text-xl font-bold text-foreground">UENR, Sunyani</h2>
              <p className="mt-1 text-sm text-muted-foreground">Real campus businesses, services, and events.</p>
            </div>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><MapPin className="h-5 w-5" /></span>
          </div>

          <div className="mt-4 space-y-3">
            <DiscoveryCard icon={Store} title="Auntie Ama's Kitchen" category="Local food · 0.4 km away" rating="4.9" />
            <DiscoveryCard icon={Search} title="Campus Print Hub" category="Printing & design · Open now" rating="4.8" />
            <DiscoveryCard icon={CalendarDays} title="Student Innovation Fair" category="Event · This Friday" rating="" />
          </div>

          <Link href="/discover" className="mt-4 flex items-center justify-between rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
            Find your next favourite <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <p className="mx-auto mt-4 flex max-w-3xl items-center gap-2 px-1 text-xs text-muted-foreground"><CheckCircle2 className="h-4 w-4 shrink-0 text-primary" /> Verified campus businesses and opportunities from your community.</p>
      </div>
    </section>
  );
}

function Stat({ icon: Icon, value, label }: { icon: typeof Store; value: number; label: string }) {
  return <div className="flex flex-col items-center gap-1 px-2 text-center first:pl-0 last:pr-0"><Icon className="h-4 w-4 text-primary" /><span className="font-display text-lg font-bold text-foreground sm:text-xl">{value}</span><span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span></div>;
}

function DiscoveryCard({ icon: Icon, title, category, rating }: { icon: typeof Store; title: string; category: string; rating: string }) {
  return <div className="flex items-center gap-3 rounded-xl border border-border bg-background p-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span><div className="min-w-0 flex-1"><div className="flex items-center gap-1.5"><p className="truncate text-sm font-semibold text-foreground">{title}</p><CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" /></div><p className="mt-0.5 truncate text-xs text-muted-foreground">{category}</p></div>{rating && <span className="flex items-center gap-1 text-xs font-semibold text-foreground"><Star className="h-3.5 w-3.5 fill-secondary text-secondary" />{rating}</span>}</div>;
}
