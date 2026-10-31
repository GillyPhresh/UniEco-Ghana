'use client';

import Link from 'next/link';
import { MapPin, ArrowRight, Store } from 'lucide-react';
import { Section, SectionHeading, Reveal } from '@/components/landing/section';
import { getLocalUniversityBranding, getUniversityLogoObjectPosition } from '@/lib/data/university-branding';
import { UniversityLogo, UniversityMedia } from '@/components/universities/university-media';

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
          const localBranding = getLocalUniversityBranding(uni.slug);
          const landmarkImage = uni.landmark_image_url || uni.hero_image_url;
          const logoUrl = localBranding.logoUrl || uni.logo_url;

          return (
            <Reveal key={uni.id} delay={i * 0.08}>
              <Link
                href={`/university/${uni.slug}`}
                className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all hover:border-primary/30 hover:shadow-md active:scale-[0.995]"
              >
                <div className="relative h-28 overflow-hidden sm:h-32">
                  <UniversityMedia
                    src={landmarkImage}
                    fallbackSrc={localBranding.campusUrl}
                    alt={uni.hero_alt_text || `${uni.name} campus landmark`}
                    name={uni.name}
                    shortName={uni.short_name}
                    kind="campus"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-card via-card/25 to-transparent" />
                  <div className="absolute bottom-3 left-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/70 bg-white p-1.5 text-xs font-bold text-primary shadow-sm sm:h-16 sm:w-16">
                    <UniversityLogo
                      src={logoUrl}
                      fallbackSrc={localBranding.logoUrl}
                      alt={uni.logo_alt_text || `${uni.name} logo`}
                      name={uni.name}
                      shortName={uni.short_name}
                      logoObjectPosition={getUniversityLogoObjectPosition(uni.slug)}
                      className="object-contain"
                    />
                  </div>
                </div>

                <div className="flex items-start gap-3 p-4 sm:gap-4 sm:p-6">
                  <div className="flex-1">
                    <h3 className="font-display font-semibold text-foreground transition-colors group-hover:text-primary">{uni.short_name}</h3>
                    <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">{uni.name}</p>
                  </div>
                </div>

                {uni.description && <p className="line-clamp-2 px-4 text-sm text-muted-foreground sm:px-6">{uni.description}</p>}

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 px-4 text-xs text-muted-foreground sm:mt-4 sm:px-6">
                  <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{uni.city || 'Ghana'}</span>
                  <span className="flex items-center gap-1"><Store className="h-3.5 w-3.5" />{vendorCounts[uni.id] || 0} businesses</span>
                </div>

                <div className="mt-auto p-4 pt-3 sm:p-6 sm:pt-4">
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
