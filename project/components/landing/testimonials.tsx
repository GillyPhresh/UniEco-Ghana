'use client';

import { motion } from 'framer-motion';
import { Star, Quote } from 'lucide-react';
import { Section, Reveal, SectionHeading } from '@/components/landing/section';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

const testimonials = [
  {
    name: 'Ama Serwaa',
    role: 'Level 200, Computer Science',
    university: 'UENR',
    rating: 5,
    quote:
      'I was running late for a submission and needed printing fast. Found the print hub near the library on UniEco, called them, and my work was ready by the time I walked over.',
  },
  {
    name: 'Kwame Mensah',
    role: 'Student Vendor — Campus Bites',
    university: 'UENR',
    rating: 5,
    quote:
      'I started selling food from my hall. After listing on UniEco, students from other halls started finding me. My sales went up in the first two weeks.',
  },
  {
    name: 'Akosua Darko',
    role: 'Level 300, Engineering',
    university: 'UENR',
    rating: 5,
    quote:
      'I cracked my phone screen and found TechPoint on here. Read the reviews, saw they were verified, and went straight there. Fixed in under an hour.',
  },
];

export function Testimonials() {
  return (
    <Section id="testimonials" className="bg-muted/30">
      <SectionHeading
        eyebrow="Student Stories"
        title="What students say about UniEco"
        description="Real experiences from students using UniEco Ghana at UENR."
      />
      <div className="mt-14 grid gap-6 md:grid-cols-3">
        {testimonials.map((t, i) => (
          <Reveal key={t.name} delay={i * 0.1}>
            <motion.div
              whileHover={{ y: -4 }}
              className="flex h-full flex-col rounded-2xl border border-border bg-card p-6 shadow-sm"
            >
              <Quote className="h-8 w-8 text-primary/20" />
              <div className="mt-3 flex gap-0.5">
                {Array.from({ length: t.rating }).map((_, idx) => (
                  <Star
                    key={idx}
                    className="h-4 w-4 fill-secondary text-secondary"
                  />
                ))}
              </div>
              <p className="mt-4 flex-1 text-sm leading-relaxed text-foreground/90">
                &ldquo;{t.quote}&rdquo;
              </p>
              <div className="mt-6 flex items-center gap-3 border-t border-border pt-4">
                <Avatar>
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {t.name
                      .split(' ')
                      .map((n) => n[0])
                      .join('')}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-semibold text-foreground">{t.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.role} · {t.university}
                  </p>
                </div>
              </div>
            </motion.div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
