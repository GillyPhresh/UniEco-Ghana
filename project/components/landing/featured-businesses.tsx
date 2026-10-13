'use client';

import Link from 'next/link';
import { Section, SectionHeading, Reveal } from '@/components/landing/section';
import { BusinessCard } from '@/components/shared/business-card';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import type { VendorWithRelations } from '@/lib/data/public-queries';

export function FeaturedBusinesses({ vendors }: { vendors: VendorWithRelations[] }) {
  if (vendors.length === 0) return null;

  return (
    <Section id="featured-businesses">
      <div className="flex items-end justify-between">
        <SectionHeading
          eyebrow="Featured"
          title="Popular businesses on campus"
          description="Top-rated businesses loved by students at UENR."
          align="left"
        />
        <Button asChild variant="ghost" size="sm" className="hidden shrink-0 sm:inline-flex">
          <Link href="/discover">
            View all
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Link>
        </Button>
      </div>

      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {vendors.map((vendor, i) => (
          <Reveal key={vendor.id} delay={i * 0.08}>
            <BusinessCard vendor={vendor} />
          </Reveal>
        ))}
      </div>

      <div className="mt-8 text-center sm:hidden">
        <Button asChild variant="outline">
          <Link href="/discover">
            View all businesses
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </Section>
  );
}
