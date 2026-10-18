'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { SearchBar } from '@/components/shared/search-bar';
import { Button } from '@/components/ui/button';
import {
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  MapPin,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Store,
} from 'lucide-react';

interface HeroProps {
  vendorCount: number;
  universityCount: number;
  reviewCount: number;
}
export function Hero({ vendorCount, universityCount, reviewCount }: HeroProps) {
  return (
    <section className="relative overflow-hidden border-b border-border/60 bg-gradient-to-br from-primary-50/70 via-background to-accent/5 pt-10 sm:pt-16 lg:pt-20">
      <div className="absolute inset-0 bg-grid opacity-30 [mask-image:linear-gradient(to_bottom,black,transparent_78%)]" />
      <div className="absolute -right-40 -top-32 h-[28rem] w-[28rem] rounded-full bg-primary/15 blur-3xl" />
      <div className="absolute -left-40 bottom-0 h-72 w-72 rounded-full bg-secondary/10 blur-3xl" />

      <div className="container relative">
        <div className="grid items-center gap-12 pb-16 lg:grid-cols-[1.02fr_0.98fr] lg:gap-16 lg:pb-24">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
            className="max-w-2xl"
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-background/80 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-primary shadow-sm">
              <Sparkles className="h-3.5 w-3.5" />
              Ghana’s campus marketplace
            </span>

            <h1 className="mt-6 max-w-xl font-display text-4xl font-bold leading-[1.08] tracking-tight text-foreground text-balance sm:text-5xl lg:text-7xl">
              Your campus.
              <span className="block bg-gradient-to-r from-primary via-primary-600 to-accent bg-clip-text text-transparent">
                Your community.
              </span>
              Everything in one place.
            </h1>

            <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
              Discover trusted student businesses, food, services, and events around you—then connect with the people making campus life happen.
            </p>

            <div className="mt-8 max-w-xl">
              <SearchBar className="w-full" autoFocus={false} />
              <div className="mt-4 flex flex-wrap gap-3">
                <Button asChild size="lg" className="rounded-full px-6 shadow-lg shadow-primary/20">
                  <Link href="/discover">
                    Explore campus businesses
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg" className="rounded-full bg-background/70 px-6">
                  <Link href="/start-business">List your business</Link>
                </Button>
              </div>
              <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-success" />
                Browse freely. Connect locally. Support student-led businesses.
              </p>
            </div>

            <div className="mt-10 grid max-w-xl grid-cols-3 divide-x divide-border rounded-2xl border border-border/70 bg-background/70 p-4 shadow-sm backdrop-blur">
              <Stat icon={Store} value={vendorCount} label="businesses" />
              <Stat icon={Building2} value={universityCount} label="universities" />
              <Stat icon={ShieldCheck} value={reviewCount} label="reviews" />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
            className="relative mx-auto w-full max-w-[30rem] lg:max-w-none"
          >
            <div className="absolute -inset-5 rounded-[2rem] bg-gradient-to-br from-primary/20 via-transparent to-secondary/20 blur-2xl" />
            <div className="relative overflow-hidden rounded-[2rem] border border-border/80 bg-card p-4 shadow-2xl shadow-primary/10 sm:p-5">
              <div className="flex items-center justify-between border-b border-border/70 pb-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Discover near you</p>
                  <p className="mt-1 font-display text-xl font-bold">UENR, Sunyani</p>
                </div>
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <MapPin className="h-5 w-5" />
                </span>
              </div>

              <div className="mt-4 flex gap-2 overflow-hidden">
                {['Food', 'Services', 'Events'].map((item, index) => (
                  <span key={item} className={index === 0 ? 'rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground' : 'rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground'}>
                    {item}
                  </span>
                ))}
              </div>

              <div className="mt-5 space-y-3">
                <DiscoveryCard icon="🍛" title="Auntie Ama’s Kitchen" category="Local food · 0.4 km away" rating="4.9" color="bg-secondary/20" />
                <DiscoveryCard icon="🖨️" title="Campus Print Hub" category="Printing & design · Open now" rating="4.8" color="bg-accent/15" />
                <DiscoveryCard icon="🎓" title="Student Innovation Fair" category="Event · This Friday" rating="—" color="bg-primary/10" />
              </div>

              <div className="mt-5 flex items-center justify-between rounded-2xl bg-primary p-4 text-primary-foreground">
                <div>
                  <p className="text-sm font-semibold">Find your next favourite</p>
                  <p className="mt-1 text-xs text-primary-foreground/75">Real people. Real campus value.</p>
                </div>
                <Search className="h-5 w-5" />
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
function Stat({ icon: Icon, value, label }: { icon: typeof Store; value: number; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1 px-2 text-center first:pl-0 last:pr-0">
      <Icon className="h-4 w-4 text-primary" />
      <span className="font-display text-xl font-bold text-foreground">{value}</span>
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
    </div>
  );
}
function DiscoveryCard({ icon, title, category, rating, color }: { icon: string; title: string; category: string; rating: string; color: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-background p-3 transition-transform hover:-translate-y-0.5">
      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl ${color}`}>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-foreground">{title}</p>
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" />
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground">{category}</p>
      </div>
      <span className="flex items-center gap-1 text-xs font-semibold text-foreground">
        <Star className="h-3.5 w-3.5 fill-secondary text-secondary" />
        {rating}
      </span>
    </div>
  );
}

