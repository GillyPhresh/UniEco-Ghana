'use client';

import { motion, useInView } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { Section } from '@/components/landing/section';

interface StatisticsProps {
  vendorCount: number;
  universityCount: number;
  reviewCount: number;
  productCount: number;
}

export function Statistics({ vendorCount, universityCount, reviewCount, productCount }: StatisticsProps) {
  const stats = [
    { value: vendorCount, suffix: '', label: 'Businesses listed' },
    { value: productCount, suffix: '+', label: 'Products available' },
    { value: reviewCount, suffix: '', label: 'Student reviews' },
    { value: universityCount, suffix: '', label: 'Universities live' },
  ];

  return (
    <Section className="py-16">
      <div className="overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/10 via-card to-accent/5 p-8 shadow-sm sm:p-12">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.6 }}
              className="text-center"
            >
              <div className="font-display text-4xl font-bold text-foreground sm:text-5xl">
                <Counter value={stat.value} suffix={stat.suffix} />
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{stat.label}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </Section>
  );
}

function Counter({ value, suffix }: { value: number; suffix: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!inView) return;
    let frame: number;
    const start = performance.now();
    const duration = 1800;

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * value));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inView, value]);

  return (
    <span ref={ref}>
      {count.toLocaleString()}
      {suffix}
    </span>
  );
}
