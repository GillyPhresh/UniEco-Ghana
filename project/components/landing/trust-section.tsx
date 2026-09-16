'use client';

import { motion } from 'framer-motion';
import { Section, Reveal } from '@/components/landing/section';
import { ShieldCheck, GraduationCap, Star, CheckCircle2 } from 'lucide-react';

export function TrustSection() {
  return (
    <Section id="trust" className="bg-muted/30">
      <div className="mx-auto max-w-3xl text-center">
        <span className="inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
          Trust & Verification
        </span>
        <h2 className="mt-3 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          How you know a business is legit
        </h2>
        <p className="mt-3 text-sm text-muted-foreground sm:text-base">
          Every business on UniEco Ghana goes through verification. Here is what
          the badges mean and why they matter.
        </p>
      </div>

      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <Reveal delay={0}>
          <motion.div
            whileHover={{ y: -4 }}
            className="flex h-full flex-col rounded-2xl border border-border bg-card p-6 shadow-sm"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <GraduationCap className="h-6 w-6" />
            </span>
            <h3 className="mt-4 font-display font-semibold text-foreground">
              Verified Student Business
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Run by a student at the university with a valid student ID. These
              are your mates selling food, doing alterations, offering tutorials
              — side hustles built right on campus.
            </p>
          </motion.div>
        </Reveal>

        <Reveal delay={0.1}>
          <motion.div
            whileHover={{ y: -4 }}
            className="flex h-full flex-col rounded-2xl border border-border bg-card p-6 shadow-sm"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-accent">
              <ShieldCheck className="h-6 w-6" />
            </span>
            <h3 className="mt-4 font-display font-semibold text-foreground">
              Verified Vendor
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              A registered business operating near campus — shops, salons, repair
              centres, and service providers that have been checked and approved
              by our team.
            </p>
          </motion.div>
        </Reveal>

        <Reveal delay={0.2}>
          <motion.div
            whileHover={{ y: -4 }}
            className="flex h-full flex-col rounded-2xl border border-border bg-card p-6 shadow-sm"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary/15 text-secondary">
              <Star className="h-6 w-6" />
            </span>
            <h3 className="mt-4 font-display font-semibold text-foreground">
              Ratings & Reviews
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Real reviews from students who have used the business. Star ratings
              and review counts are visible on every profile so you can decide
              with confidence.
            </p>
          </motion.div>
        </Reveal>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <CheckCircle2 className="h-4 w-4 text-success" />
          ID-checked vendors
        </span>
        <span className="flex items-center gap-1.5">
          <CheckCircle2 className="h-4 w-4 text-success" />
          Student-verified businesses
        </span>
        <span className="flex items-center gap-1.5">
          <CheckCircle2 className="h-4 w-4 text-success" />
          Real student reviews
        </span>
      </div>
    </Section>
  );
}
