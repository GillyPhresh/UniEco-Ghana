'use client';

import { motion } from 'framer-motion';
import { GraduationCap, TrendingUp, Wallet, Users } from 'lucide-react';
import { Section, Reveal, SectionHeading } from '@/components/landing/section';

const studentBenefits = [
  {
    icon: GraduationCap,
    title: 'Everything on your campus',
    description:
      'Food near your hall, a print shop by the library, a tailor who knows your style. Find it all without walking around asking people.',
  },
  {
    icon: Wallet,
    title: 'Compare before you buy',
    description:
      'See prices, ratings, and reviews before you spend your cedis. No more overpaying because you did not know the shop next door was cheaper.',
  },
  {
    icon: TrendingUp,
    title: 'Turn your side hustle into a business',
    description:
      'Selling pastries, doing alterations, offering tutorials? List it on UniEco and reach every student on campus — not just the ones in your hall.',
  },
  {
    icon: Users,
    title: 'A campus community you can trust',
    description:
      'Reviews from real students, verified businesses, and direct contact with vendors. You always know who you are dealing with.',
  },
];

export function StudentBenefits() {
  return (
    <Section id="student-benefits">
      <SectionHeading
        eyebrow="For Students"
        title="Spend less time searching, more time living"
        description="UniEco puts your campus in your pocket — the businesses, the events, the services, and the people."
      />
      <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {studentBenefits.map((benefit, i) => (
          <Reveal key={benefit.title} delay={i * 0.08}>
            <motion.div
              whileHover={{ y: -6 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className="flex h-full flex-col rounded-2xl border border-border bg-card p-6 text-center shadow-sm"
            >
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
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
