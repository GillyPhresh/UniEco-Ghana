import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { BusinessCard } from '@/components/shared/business-card';
import { EmptyState } from '@/components/shared/empty-state';
import { Section, SectionHeading } from '@/components/landing/section';
import {
  getUniversityBySlug,
  getVendorsByUniversity,
  getEventsByUniversity,
} from '@/lib/data/public-queries';
import { CATEGORY_ICONS } from '@/lib/constants/categories';
import { siteConfig } from '@/lib/constants/site';
import { Building2, MapPin, Store, Calendar, ArrowRight, Briefcase, Users, GraduationCap, Image as ImageIcon } from 'lucide-react';

interface PageProps {
  params: { slug: string };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const university = await getUniversityBySlug(params.slug);
  if (!university) {
    return { title: 'University not found' };
  }

  const title = `${university.name} (${university.short_name}) — Businesses, Events & Services | ${siteConfig.name}`;
  const description = `Discover businesses, food vendors, services, and events at ${university.name} in ${university.city}. Find everything around ${university.short_name} campus on UniEco Ghana.`;
  const canonicalUrl = `${siteConfig.url}/university/${university.slug}`;
  const ogImage = university.hero_image_url || university.logo_url || '/og-image.png';
  const ogImageAlt = university.hero_alt_text || university.logo_alt_text || `${university.name} campus`;

  return {
    title,
    description,
    keywords: [
      `${university.short_name} businesses`,
      `${university.short_name} campus`,
      `businesses near ${university.short_name}`,
      `${university.short_name} food vendors`,
      `${university.short_name} events`,
      `${university.city} student services`,
      'university Ghana marketplace',
    ],
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: siteConfig.name,
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: ogImageAlt,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
    },
  };
}

function formatDate(dateString: string | null): string {
  if (!dateString) return 'TBA';
  return new Date(dateString).toLocaleDateString('en-GH', {
    month: 'short',
    day: 'numeric',
  });
}

export default async function UniversityPage({ params }: PageProps) {
  const university = await getUniversityBySlug(params.slug);
  if (!university) notFound();

  const [vendors, events] = await Promise.all([
    getVendorsByUniversity(university.id, 20),
    getEventsByUniversity(university.id, 6),
  ]);

  const universityCategoryCounts: Record<string, number> = {};
  vendors.forEach((v) => {
    if (v.business_type) {
      universityCategoryCounts[v.business_type] = (universityCategoryCounts[v.business_type] || 0) + 1;
    }
  });

  const studentBusinesses = vendors.filter((v) => v.is_student_business);
  const verifiedBusinesses = vendors.filter((v) => v.is_verified);

  const logoAlt = university.logo_alt_text || `${university.name} official logo`;
  const heroAlt = university.hero_alt_text || `${university.name} campus landmark`;
  const hasHeroImage = !!university.hero_image_url;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollegeOrUniversity',
    name: university.name,
    alternateName: university.short_name,
    description: university.description,
    address: {
      '@type': 'PostalAddress',
      addressLocality: university.city,
      addressRegion: university.region,
      addressCountry: university.country,
    },
    url: `${siteConfig.url}/university/${university.slug}`,
    ...(university.logo_url && {
      logo: {
        '@type': 'ImageObject',
        url: university.logo_url.startsWith('http')
          ? university.logo_url
          : `${siteConfig.url}${university.logo_url}`,
      },
    }),
    ...(university.hero_image_url && {
      image: university.hero_image_url.startsWith('http')
        ? university.hero_image_url
        : `${siteConfig.url}${university.hero_image_url}`,
    }),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <SiteHeader />
      <main>
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-border">
          {/* Hero/Landmark image background */}
          {hasHeroImage ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={university.hero_image_url!}
                alt={heroAlt}
                className="absolute inset-0 h-full w-full object-cover"
                loading="eager"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-background/40" />
            </>
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-card to-accent/5">
              <div className="absolute inset-0 bg-dot opacity-20 mask-fade-bottom" />
            </div>
          )}

          <div className="container relative py-12 sm:py-16">
            <nav className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Link href="/#universities" className="hover:text-foreground">Universities</Link>
              <span>/</span>
              <span className="text-foreground">{university.short_name}</span>
            </nav>
            <div className="flex items-start gap-5">
              {/* Logo — preserves aspect ratio, works on all backgrounds */}
              {university.logo_url ? (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/90 p-2 shadow-md backdrop-blur-sm sm:h-20 sm:w-20">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={university.logo_url}
                    alt={logoAlt}
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
              ) : (
                <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary sm:h-20 sm:w-20">
                  <Building2 className="h-8 w-8 sm:h-10 sm:w-10" />
                </span>
              )}
              <div className="flex-1">
                <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl lg:text-4xl">
                  {university.name}
                </h1>
                <p className="mt-1 text-lg font-medium text-primary">{university.short_name}</p>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-4 w-4 text-primary" />
                    {university.city}, {university.region}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Store className="h-4 w-4 text-primary" />
                    {vendors.length} businesses
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Calendar className="h-4 w-4 text-primary" />
                    {events.length} events
                  </span>
                </div>
                {university.description && (
                  <p className="mt-4 max-w-2xl text-sm text-muted-foreground text-pretty sm:text-base">
                    {university.description}
                  </p>
                )}
                {!hasHeroImage && (
                  <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground/70">
                    <ImageIcon className="h-3.5 w-3.5" />
                    Campus image coming soon
                  </p>
                )}
                {hasHeroImage && university.image_credit && (
                  <p className="mt-3 text-xs text-muted-foreground/60">
                    Image credit: {university.image_credit}
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Popular businesses */}
        <Section id="featured">
          <SectionHeading
            eyebrow="Businesses"
            title={`Businesses at ${university.short_name}`}
            description="Food, services, and shops serving students on this campus."
            align="left"
          />
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {vendors.map((vendor) => (
              <BusinessCard key={vendor.id} vendor={vendor} />
            ))}
          </div>
          {vendors.length === 0 && (
            <EmptyState
              icon={Store}
              title="No businesses yet"
              description={`Be the first to register a business at ${university.short_name}.`}
            />
          )}
        </Section>

        {/* Categories at this university */}
        {Object.keys(universityCategoryCounts).length > 0 && (
          <Section id="campus-categories" className="bg-muted/30">
            <SectionHeading
              eyebrow="Categories"
              title="Popular on campus"
              align="left"
            />
            <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {Object.entries(universityCategoryCounts)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 8)
                .map(([category, count]) => (
                  <Link
                    key={category}
                    href={`/discover?category=${encodeURIComponent(category)}`}
                    className="group flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
                  >
                    <span className="text-2xl">{CATEGORY_ICONS[category] || '🏪'}</span>
                    <div>
                      <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                        {category}
                      </p>
                      <p className="text-xs text-muted-foreground">{count} businesses</p>
                    </div>
                  </Link>
                ))}
            </div>
          </Section>
        )}

        {/* Student opportunities */}
        <Section id="opportunities">
          <SectionHeading
            eyebrow="Opportunities"
            title="Student opportunities on campus"
            description="Businesses run by students, verified vendors, and campus events to attend."
            align="left"
          />
          <div className="mt-8 grid gap-5 sm:grid-cols-3">
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <GraduationCap className="h-6 w-6" />
              </span>
              <h3 className="mt-4 font-display font-semibold text-foreground">
                {studentBusinesses.length} student businesses
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Ventures run by your fellow students — from food to fashion to
                freelance services. Support a mate, get a good deal.
              </p>
              <Link
                href="/discover"
                className="mt-3 inline-flex items-center text-sm font-medium text-primary hover:gap-2 transition-all"
              >
                Browse student businesses
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </div>

            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-accent">
                <Briefcase className="h-6 w-6" />
              </span>
              <h3 className="mt-4 font-display font-semibold text-foreground">
                {verifiedBusinesses.length} verified vendors
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Local businesses checked and approved by our team. Shops, salons,
                repair centres, and service providers you can trust.
              </p>
              <Link
                href="/discover"
                className="mt-3 inline-flex items-center text-sm font-medium text-primary hover:gap-2 transition-all"
              >
                Browse verified vendors
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </div>

            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary/15 text-secondary">
                <Users className="h-6 w-6" />
              </span>
              <h3 className="mt-4 font-display font-semibold text-foreground">
                {events.length} upcoming events
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Tech fairs, food festivals, sports galas, and networking events.
                See what is happening and show up.
              </p>
              <Link
                href="/events"
                className="mt-3 inline-flex items-center text-sm font-medium text-primary hover:gap-2 transition-all"
              >
                View campus events
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </div>
          </div>
        </Section>

        {/* Events */}
        <Section id="campus-events" className="bg-muted/30">
          <SectionHeading
            eyebrow="Events"
            title={`Events at ${university.short_name}`}
            description="What is coming up on campus."
            align="left"
          />
          {events.length > 0 ? (
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {events.map((event) => (
                <Link
                  key={event.id}
                  href={`/events/${event.slug}`}
                  className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
                >
                  <div className="relative flex h-32 items-center justify-center bg-gradient-to-br from-accent/15 via-primary/5 to-secondary/10">
                    <Calendar className="h-8 w-8 text-primary/30" />
                  </div>
                  <div className="flex flex-1 flex-col p-4">
                    <h3 className="font-display font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2">
                      {event.title}
                    </h3>
                    {event.description && (
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {event.description}
                      </p>
                    )}
                    <div className="mt-auto pt-3 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-primary" />
                        {formatDate(event.start_time)}
                      </div>
                      {event.location && (
                        <div className="mt-1 flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 text-primary" />
                          <span className="truncate">{event.location}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Calendar}
              title="No events scheduled"
              description={`There are no upcoming events at ${university.short_name} right now. Check back soon.`}
            />
          )}
        </Section>
      </main>
      <SiteFooter />
    </>
  );
}
