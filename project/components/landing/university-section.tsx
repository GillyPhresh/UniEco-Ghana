'use client';

import Link from 'next/link';
import { Building2, MapPin, ArrowRight, Store } from 'lucide-react';
import { Section, SectionHeading, Reveal } from '@/components/landing/section';

interface UniversitySectionProps {
  universities: {
    id: string;
    name: string;
    short_name: string;
    slug: string;
    city: string | null;
    region: string | null;
    logo_url: string | null;
    hero_image_url: string | null;
    logo_alt_text: string | null;
    hero_alt_text: string | null;
    description: string | null;
  }[];
  vendorCounts: Record<string, number>;
}

export function UniversitySection({ universities, vendorCounts }: UniversitySectionProps) {
  return (
    <Section id="universities" className="bg-muted/30">
      <SectionHeading
        eyebrow="Universities"
        title="Find your campus"
        description="UniEco Ghana is live at UENR and expanding to every tertiary institution. Explore what each campus has to offer."
      />

      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {universities.map((uni, i) => (
          <Reveal key={uni.id} delay={i * 0.08}>
            <Link
              href={`/university/${uni.slug}`}
              className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
            >
              {/* Hero image as card background if available */}
              {uni.hero_image_url && (
                <div className="relative h-28 overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={uni.hero_image_url}
                    alt={uni.hero_alt_text || `${uni.name} campus`}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-card via-card/30 to-transparent" />
                  {uni.logo_url && (
                    <div className="absolute bottom-3 left-4 flex h-10 w-10 items-center justify-center rounded-lg bg-white/90 p-1 shadow-sm">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={uni.logo_url}
                        alt={uni.logo_alt_text || `${uni.name} logo`}
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-start gap-4 p-6">
                {!uni.hero_image_url && (
                  uni.logo_url ? (
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white p-1.5 shadow-sm">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={uni.logo_url}
                        alt={uni.logo_alt_text || `${uni.name} logo`}
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                  ) : (
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Building2 className="h-7 w-7" />
                    </span>
                  )
                )}
                <div className={uni.hero_image_url ? 'flex-1' : 'flex-1'}>
                  <h3 className="font-display font-semibold text-foreground group-hover:text-primary transition-colors">
                    {uni.short_name}
                  </h3>
                  <p className="mt-0.5 text-sm text-muted-foreground line-clamp-1">
                    {uni.name}
                  </p>
                </div>
              </div>

              {uni.description && (
                <p className="px-6 line-clamp-2 text-sm text-muted-foreground">
                  {uni.description}
                </p>
              )}

              <div className="mt-4 flex items-center gap-4 px-6 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {uni.city || 'Ghana'}
                </span>
                <span className="flex items-center gap-1">
                  <Store className="h-3.5 w-3.5" />
                  {vendorCounts[uni.id] || 0} businesses
                </span>
              </div>

              <div className="mt-auto p-6 pt-4">
                <span className="inline-flex items-center text-sm font-medium text-primary group-hover:gap-2 transition-all">
                  Explore campus
                  <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </span>
              </div>
            </Link>
          </Reveal>
        ))}

        {/* Coming soon card */}
        <Reveal delay={universities.length * 0.08}>
          <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/20 p-6 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <Building2 className="h-7 w-7" />
            </span>
            <h3 className="mt-4 font-display font-semibold text-foreground">
              More campuses coming
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              KNUST, University of Ghana, UCC, UEW, UDS and more are on the way.
            </p>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
