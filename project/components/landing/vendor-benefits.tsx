'use client';

import { motion } from 'framer-motion';
import { Store, BarChart3, Megaphone, ShieldCheck } from 'lucide-react';
import { Section, Reveal, SectionHeading } from '@/components/landing/section';

const vendorBenefits = [
  {
    icon: Store,
    title: 'Reach students where they already are',
    description:
      'Students browse UniEco to find food, services, and products. List your business and get discovered by thousands of students on your campus.',
  },
  {
    icon: BarChart3,
    title: 'See what students want',
    description:
      'Track views, reviews, and interest in your products. Understand demand and stock what actually sells on your campus.',
  },
  {
    icon: Megaphone,
    title: 'Promote to your campus',
    description:
      'Boost your visibility with targeted placements where students browse. Put your business in front of the right people at the right time.',
  },
  {
    icon: ShieldCheck,
    title: 'Build trust with a verified badge',
    description:
      'A verified badge tells students you are the real deal. Stand out from unverified sellers and win more customers.',
  },
];

export function VendorBenefits() {
  return (
    <Section id="vendor-benefits" className="bg-muted/30">
      <SectionHeading
        eyebrow="For Vendors"
        title="Grow your business on campus"
        description="Whether you are a student selling from your dorm or a shop near campus, UniEco helps you reach more students."
      />
      <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {vendorBenefits.map((benefit, i) => (
          <Reveal key={benefit.title} delay={i * 0.08}>
            <motion.div
              whileHover={{ y: -6 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className="flex h-full flex-col rounded-2xl border border-border bg-card p-6 text-center shadow-sm"
            >
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary/15 text-secondary">
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
