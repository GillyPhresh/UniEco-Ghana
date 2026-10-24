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
    landmark_image_url: string | null;
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
        description="Choose a campus to see its businesses, services, events, and student community."
      />

      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {universities.map((uni, i) => {
          const landmarkImage = uni.landmark_image_url || uni.hero_image_url;
          const initials = uni.short_name.slice(0, 3).toUpperCase();

          return (
            <Reveal key={uni.id} delay={i * 0.08}>
              <Link
                href={`/university/${uni.slug}`}
                className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
              >
                <div className="relative h-32 overflow-hidden">
                  {landmarkImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={landmarkImage}
                      alt={uni.hero_alt_text || `${uni.name} campus landmark`}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div className="relative flex h-full items-center justify-center overflow-hidden bg-gradient-to-br from-primary/20 via-emerald-50 to-accent/20 dark:from-primary/20 dark:via-emerald-950/40 dark:to-accent/20">
                      <Building2 className="h-14 w-14 text-primary/25" aria-hidden="true" />
                      <span className="absolute bottom-2 right-3 rounded-full bg-background/75 px-2 py-1 text-[10px] font-medium text-muted-foreground backdrop-blur-sm">Campus image coming soon</span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-card via-card/25 to-transparent" />
                  <div className="absolute bottom-3 left-4 flex h-12 w-12 items-center justify-center rounded-xl border border-white/70 bg-white p-1.5 text-xs font-bold text-primary shadow-sm">
                    {uni.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={uni.logo_url}
                        alt={uni.logo_alt_text || `${uni.name} logo`}
                        className="max-h-full max-w-full object-contain"
                        loading="lazy"
                      />
                    ) : <span aria-label={`${uni.name} logo placeholder`}>{initials}</span>}
                  </div>
                </div>

                <div className="flex items-start gap-4 p-6">
                  <div className="flex-1">
                    <h3 className="font-display font-semibold text-foreground transition-colors group-hover:text-primary">{uni.short_name}</h3>
                    <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">{uni.name}</p>
                  </div>
                </div>

                {uni.description && <p className="line-clamp-2 px-6 text-sm text-muted-foreground">{uni.description}</p>}

                <div className="mt-4 flex items-center gap-4 px-6 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{uni.city || 'Ghana'}</span>
                  <span className="flex items-center gap-1"><Store className="h-3.5 w-3.5" />{vendorCounts[uni.id] || 0} businesses</span>
                </div>

                <div className="mt-auto p-6 pt-4">
                  <span className="inline-flex items-center text-sm font-medium text-primary transition-all group-hover:gap-2">
                    Explore campus <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </span>
                </div>
              </Link>
            </Reveal>
          );
        })}
      </div>

      <div className="mt-8 text-center">
        <Link href="/universities" className="inline-flex items-center text-sm font-semibold text-primary hover:underline">
          Browse the complete university directory <ArrowRight className="ml-1 h-4 w-4" />
        </Link>
      </div>
    </Section>
  );
}
