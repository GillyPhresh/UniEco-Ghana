'use client';

import { motion } from 'framer-motion';
import { Building2, Layers, Eye, Handshake } from 'lucide-react';
import { Section, Reveal, SectionHeading } from '@/components/landing/section';

const uniBenefits = [
  {
    icon: Building2,
    title: 'A digital home for your campus',
    description:
      'Give your institution a modern, branded presence where students, businesses, and events come together in one place.',
  },
  {
    icon: Layers,
    title: 'Isolated, secure data',
    description:
      'Each university operates in its own data boundary. Your campus data stays yours — protected by row-level security.',
  },
  {
    icon: Eye,
    title: 'Visibility into campus commerce',
    description:
      'Understand the economic activity happening across your campus — from student businesses to event participation.',
  },
  {
    icon: Handshake,
    title: 'Foster student entrepreneurship',
    description:
      'Provide a platform where student ventures can launch, grow, and thrive — building the next generation of Ghanaian entrepreneurs.',
  },
];

export function UniversityBenefits() {
  return (
    <Section id="university-benefits">
      <SectionHeading
        eyebrow="For Universities"
        title="Empower your campus community"
        description="UniEco Ghana partners with institutions to create a thriving, connected, and entrepreneurial campus ecosystem."
      />
      <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {uniBenefits.map((benefit, i) => (
          <Reveal key={benefit.title} delay={i * 0.08}>
            <motion.div
              whileHover={{ y: -6 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className="flex h-full flex-col rounded-2xl border border-border bg-card p-6 text-center shadow-sm"
            >
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15 text-accent">
                <benefit.icon className="h-7 w-7" />
              </span>
              <h3 className="mt-5 font-display text-base font-semibold text-foreground">
                {benefit.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {benefit.description}
              </p>
            </motion.div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
