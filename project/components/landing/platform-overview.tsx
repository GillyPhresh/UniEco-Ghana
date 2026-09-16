'use client';

import { motion } from 'framer-motion';
import { Section, Reveal } from '@/components/landing/section';
import { CheckCircle2 } from 'lucide-react';

const platformPillars = [
  {
    number: '01',
    title: 'Built for every campus in Ghana',
    description:
      'We started at UENR, but the platform is ready for KNUST, University of Ghana, UCC, and every tertiary institution. Each campus gets its own ecosystem — same app, local businesses.',
  },
  {
    number: '02',
    title: 'Works on the phones students actually have',
    description:
      'Most students browse on mid-range Androids with varying data bundles. UniEco loads fast, uses minimal data, and installs as an app without visiting the Play Store.',
  },
  {
    number: '03',
    title: 'Safe and verified',
    description:
      'Every vendor is checked — student businesses need a valid student ID, external businesses need registration. Reviews come from real users so you know what to expect.',
  },
];

export function PlatformOverview() {
  return (
    <Section id="platform" className="bg-muted/30">
      <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
        <Reveal>
          <span className="inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
            Platform Overview
          </span>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Not a directory. A living campus ecosystem.
          </h2>
          <p className="mt-4 text-base text-muted-foreground sm:text-lg">
            UniEco Ghana is built and maintained by a team that understands
            campus life here. We know what it means to chase a print shop at
            midnight or find food after a long lab session. That is why this
            platform exists.
          </p>

          <ul className="mt-8 space-y-4">
            {[
              'Businesses, products, services, and events in one place',
              'Works as a phone app — install it, use it offline',
              'Vendors verified with student ID or business registration',
              'Built and supported in Ghana, for Ghanaian campuses',
            ].map((item) => (
              <li key={item} className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <span className="text-sm text-foreground/90">{item}</span>
              </li>
            ))}
          </ul>
        </Reveal>

        <div className="space-y-5">
          {platformPillars.map((pillar, i) => (
            <Reveal key={pillar.number} delay={i * 0.12}>
              <motion.div
                whileHover={{ x: 4 }}
                className="flex gap-5 rounded-2xl border border-border bg-card p-6 shadow-sm"
              >
                <span className="font-display text-3xl font-bold text-primary/30">
                  {pillar.number}
                </span>
                <div>
                  <h3 className="font-display text-lg font-semibold text-foreground">
                    {pillar.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {pillar.description}
                  </p>
                </div>
              </motion.div>
            </Reveal>
          ))}
        </div>
      </div>
    </Section>
  );
}
