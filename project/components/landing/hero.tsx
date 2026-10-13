'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { SearchBar } from '@/components/shared/search-bar';
import { Button } from '@/components/ui/button';
import { Store, Building2, ShieldCheck, ArrowRight } from 'lucide-react';

interface HeroProps {
  vendorCount: number;
  universityCount: number;
  reviewCount: number;
}

export function Hero({ vendorCount, universityCount, reviewCount }: HeroProps) {
  return (
    <section className="relative overflow-hidden pt-16 pb-20 sm:pt-20 sm:pb-24 lg:pt-24 lg:pb-28">
      <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />
      <div className="absolute inset-0 bg-dot opacity-30 mask-fade-bottom" />
      <div className="absolute -right-20 top-20 h-72 w-72 rounded-full bg-primary/20 blur-3xl animate-pulse-glow" />
      <div className="absolute -left-20 bottom-0 h-72 w-72 rounded-full bg-accent/15 blur-3xl animate-pulse-glow" />

      <div className="container relative">
        <div className="mx-auto max-w-3xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
              </span>
              Live at UENR, Sunyani
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="mt-6 font-display text-4xl font-bold tracking-tight text-foreground text-balance sm:text-5xl lg:text-6xl"
          >
            Find businesses, food, and services{' '}
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              around your campus
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="mt-6 text-base text-muted-foreground text-pretty sm:text-lg"
          >
            Search for waakye near your lecture hall, a print shop before a
            deadline, or a phone repair between classes. No account needed to
            browse.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="mt-8 flex flex-col items-center gap-3"
          >
            <SearchBar className="w-full max-w-xl" autoFocus={false} />
            <div className="flex flex-wrap items-center justify-center gap-3 text-sm">
              <Button asChild variant="outline" size="sm">
                <Link href="/discover">
                  Browse all businesses
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link href="/events">See campus events</Link>
              </Button>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground"
          >
            <span className="flex items-center gap-1.5">
              <Store className="h-4 w-4 text-primary" />
              {vendorCount} businesses listed
            </span>
            <span className="flex items-center gap-1.5">
              <Building2 className="h-4 w-4 text-primary" />
              {universityCount} {universityCount === 1 ? 'university' : 'universities'}
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-primary" />
              {reviewCount} student reviews
            </span>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
