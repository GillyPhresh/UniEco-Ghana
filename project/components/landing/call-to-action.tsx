'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Section } from '@/components/landing/section';

export function CallToAction() {
  return (
    <Section id="cta" className="py-16">
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-primary-600 px-6 py-16 text-center shadow-xl sm:px-12 sm:py-20"
      >
        <div className="absolute inset-0 bg-dot opacity-20" />
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-secondary/20 blur-3xl" />

        <div className="relative">
          <h2 className="font-display text-3xl font-bold tracking-tight text-primary-foreground sm:text-4xl lg:text-5xl">
            Ready to join the UniEco community?
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-primary-foreground/80 sm:text-lg">
            Create your free account today and start exploring everything your
            campus has to offer. Students, vendors, and universities are all
            welcome.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button
              asChild
              size="lg"
              variant="secondary"
              className="group h-12 px-7 text-base"
            >
              <Link href="/signup">
                Get started for free
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-12 border-primary-foreground/30 bg-transparent px-7 text-base text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
            >
              <Link href="/signin">Sign in</Link>
            </Button>
          </div>
        </div>
      </motion.div>
    </Section>
  );
}
