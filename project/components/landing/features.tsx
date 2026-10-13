'use client';

import { motion } from 'framer-motion';
import { Search, ShoppingBag, Calendar, MessageSquare, Map, Bell } from 'lucide-react';
import { Section, Reveal, SectionHeading } from '@/components/landing/section';

const features = [
  {
    icon: Search,
    title: 'Find businesses fast',
    description:
      'Search for "waakye", "printing", or "phone repair" and get relevant campus businesses instantly. Filter by category, rating, or verification status.',
  },
  {
    icon: ShoppingBag,
    title: 'Browse products and services',
    description:
      'See what each business sells — from jollof rice to screen protectors to graduation photo packages. Prices in cedis, no guessing.',
  },
  {
    icon: Calendar,
    title: 'Campus events in one place',
    description:
      'Tech fairs, food festivals, hall weeks, career fairs. See what is happening at your university and never miss an event again.',
  },
  {
    icon: MessageSquare,
    title: 'Contact businesses directly',
    description:
      'Call or WhatsApp a vendor straight from their profile. No middleman, no waiting — talk to the person selling and get what you need.',
  },
  {
    icon: Map,
    title: 'Know where to go',
    description:
      'Every business has a map pin. Get directions from your hall, your lecture block, or wherever you are on campus.',
  },
  {
    icon: Bell,
    title: 'Stay in the loop',
    description:
      'New businesses, upcoming events, and campus updates — we keep you informed about what matters at your university.',
  },
];

export function Features() {
  return (
    <Section id="features">
      <SectionHeading
        eyebrow="Features"
        title="What you can do on UniEco Ghana"
        description="Everything you need to navigate campus life — finding food, fixing your phone, printing an assignment, or discovering an event."
      />
      <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((feature, i) => (
          <Reveal key={feature.title} delay={i * 0.08}>
            <FeatureCard {...feature} />
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Search;
  title: string;
  description: string;
}) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className="group relative h-full overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-sm transition-colors hover:border-primary/40"
    >
      <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-primary/5 transition-transform group-hover:scale-150" />
      <div className="relative">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
          <Icon className="h-6 w-6" />
        </span>
        <h3 className="mt-5 font-display text-lg font-semibold text-foreground">
          {title}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
    </motion.div>
  );
}
