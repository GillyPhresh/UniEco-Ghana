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
  getUniversityAnnouncementsByUniversity,
  getPublishedCampusDiscoveries,
} from '@/lib/data/public-queries';
import { CATEGORY_ICONS } from '@/lib/constants/categories';
import { siteConfig } from '@/lib/constants/site';
import { getLocalUniversityBranding, getUniversityLogoObjectPosition } from '@/lib/data/university-branding';
import { createPublicPageMetadata, serializeJsonLd } from '@/lib/seo/metadata';
import { UniversityLogo, CampusShowcase, UniversityMedia, type CampusStory } from '@/components/universities/university-media';
import { CampusNearbyDiscovery } from '@/components/universities/campus-nearby-discovery';
import { MapPin, Store, Calendar, ArrowRight, Briefcase, Users, GraduationCap, ExternalLink } from 'lucide-react';
import { EntityViewTracker } from '@/components/analytics/entity-view-tracker';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const university = await getUniversityBySlug(slug);
  if (!university) return { title: 'University not found', robots: { index: false, follow: false } };

  const title = `${university.name} (${university.short_name}) — Institution Profile`;
  const description = `Explore the ${university.name} profile, campus businesses, services, events, and updates on UniEco Ghana. ${university.city ? `Located in ${university.city}, Ghana.` : ''}`.trim();
  const localBranding = getLocalUniversityBranding(university.slug);
  const ogImage = university.hero_image_url || university.landmark_image_url || localBranding.campusUrl || university.logo_url || localBranding.logoUrl || '/unieco-official-logo.png';
  const ogImageAlt = university.hero_alt_text || university.logo_alt_text || `${university.name} campus`;

  return createPublicPageMetadata({
    title,
    description,
    path: `/university/${university.slug}`,
    image: ogImage,
    imageAlt: ogImageAlt,
  });
}

function formatDate(dateString: string | null): string {
  if (!dateString) return 'TBA';
  return new Date(dateString).toLocaleDateString('en-GH', {
    month: 'short',
    day: 'numeric',
  });
}

export default async function UniversityPage({ params }: PageProps) {
  const { slug } = await params;
  const university = await getUniversityBySlug(slug);
  if (!university) notFound();

  const [vendors, events, announcements, discoveries] = await Promise.all([
    getVendorsByUniversity(university.id, 20),
    getEventsByUniversity(university.id, 6),
    getUniversityAnnouncementsByUniversity(university.id, 6),
    getPublishedCampusDiscoveries(university.id, 12),
  ]);

  const universityCategoryCounts: Record<string, number> = {};
  vendors.forEach((v) => {
    if (v.business_type) {
      universityCategoryCounts[v.business_type] = (universityCategoryCounts[v.business_type] || 0) + 1;
    }
  });

  const studentBusinesses = vendors.filter((v) => v.is_student_business);
  const verifiedBusinesses = vendors.filter((v) => v.is_verified);

  const localBranding = getLocalUniversityBranding(university.slug);
  const logoUrl = localBranding.logoUrl || university.logo_url;
  const heroImageUrl = university.landmark_image_url || university.hero_image_url;
  const officialWebsite = university.website_url && /^https?:\/\//i.test(university.website_url)
    ? university.website_url
    : null;

  const logoAlt = university.logo_alt_text || `${university.name} official logo`;
  const campusStories: CampusStory[] = [
    ...events.map((event) => ({
      id: `event-${event.id}`,
      kind: 'event' as const,
      title: event.title,
      description: event.description,
      imageUrl: event.cover_image_url,
      href: `/events/${event.slug}`,
      label: 'Campus event',
      dateLabel: formatDate(event.start_time),
    })),
    ...announcements.map((announcement) => ({
      id: `news-${announcement.id}`,
      kind: 'news' as const,
      title: announcement.title,
      description: announcement.body,
      label: announcement.is_pinned ? 'Pinned campus news' : 'Campus news',
      dateLabel: new Date(announcement.created_at).toLocaleDateString('en-GH', { month: 'short', day: 'numeric' }),
    })),
  ];

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
    ...(logoUrl && {
      logo: {
        '@type': 'ImageObject',
        url: logoUrl.startsWith('http') ? logoUrl : `${siteConfig.url}${logoUrl}`,
      },
    }),
    ...(heroImageUrl && {
      image: heroImageUrl.startsWith('http')
        ? heroImageUrl
        : `${siteConfig.url}${heroImageUrl}`,
    }),
  };

  return (
    <>
      <EntityViewTracker eventType="university_view" subjectType="university" subjectId={university.id} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <SiteHeader />
      <main>
        {/* Mobile-first campus showcase */}
        <section className="border-b border-border bg-gradient-to-b from-primary/5 via-background to-background">
          <div className="container py-6 sm:py-10">
            <nav className="mb-5 flex items-center gap-2 text-sm text-muted-foreground">
              <Link href="/#universities" className="hover:text-foreground">Universities</Link>
              <span>/</span>
              <span className="text-foreground">{university.short_name}</span>
            </nav>
            <div className="grid items-center gap-7 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-10">
              <div>
                <div className="flex items-start gap-4">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white p-2 shadow-md sm:h-20 sm:w-20">
                    <UniversityLogo
                      src={logoUrl}
                      fallbackSrc={localBranding.logoUrl}
                      alt={logoAlt}
                      name={university.name}
                      shortName={university.short_name}
                        logoObjectPosition={getUniversityLogoObjectPosition(university.slug)}
                      className="object-contain"
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">UniEco campus</p>
                    <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl lg:text-4xl">
                      {university.name}
                    </h1>
                    <p className="mt-1 text-lg font-medium text-primary">{university.short_name}</p>
                  </div>
                </div>
                <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4 text-primary" />{university.city}, {university.region}</span>
                  <span className="flex items-center gap-1.5"><Store className="h-4 w-4 text-primary" />{vendors.length} businesses</span>
                  <span className="flex items-center gap-1.5"><Calendar className="h-4 w-4 text-primary" />{events.length} events</span>
                </div>
                {officialWebsite && <a href={officialWebsite} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-primary underline underline-offset-4">Official institution website <ExternalLink className="h-4 w-4" /></a>}
                {university.description && <p className="mt-5 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">{university.description}</p>}
                {university.institution_type && <div className="mt-4 flex flex-wrap gap-2"><span className="rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary">{university.institution_type}</span>{university.ownership_type && <span className="rounded-full border px-3 py-1 text-xs font-medium capitalize text-muted-foreground">{university.ownership_type} institution</span>}</div>}
                {university.accreditation_source_url && <div className="mt-4 rounded-xl border border-emerald-700/15 bg-emerald-700/5 p-4"><p className="text-sm font-semibold text-foreground">GTEC accreditation record</p><p className="mt-1 text-sm text-muted-foreground">Listed as {university.accreditation_status || 'unknown'} when checked {university.accreditation_checked_at ? new Date(`${university.accreditation_checked_at}T12:00:00Z`).toLocaleDateString('en-GH', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : 'by UniEco'}{university.accreditation_valid_until ? ` · validity date shown by GTEC through ${new Date(`${university.accreditation_valid_until}T12:00:00Z`).toLocaleDateString('en-GH', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}` : ''}. Check the regulator’s record for current details.</p><a href={university.accreditation_source_url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-10 items-center font-semibold text-primary underline underline-offset-4">View institution record at GTEC</a></div>}
                {university.image_credit && <p className="mt-4 text-xs text-muted-foreground/70">Image credit: {university.image_credit}</p>}
              </div>
              <CampusShowcase
                universityName={university.name}
                universityShortName={university.short_name}
                campusImageUrl={heroImageUrl}
                localCampusImageUrl={localBranding.campusUrl}
                stories={campusStories}
              />
            </div>
          </div>
        </section>

        {/* Popular businesses */}
        <Section id="featured">
            <SectionHeading
            eyebrow="Businesses"
            title={`Businesses at ${university.short_name}`}
              description="Student-run businesses and local vendors listed for this campus. Listings appear when a provider joins and is approved."
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
              description={`No active business listings are available for ${university.short_name} yet. Invite a local business or student entrepreneur to join UniEco and list their services.`}
            />
          )}
        </Section>

        {/* Public-source discoveries are attributed and separate from verified vendor and event records. */}
        {discoveries.length > 0 && <Section id="public-campus-discoveries" className="bg-muted/20">
          <SectionHeading eyebrow="From official school sources" title={`More around ${university.short_name}`} description="Public information reported by the institution’s own website. These entries are not verified by UniEco; check the original source before relying on details." align="left" />
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{discoveries.map((item) => <article key={item.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2"><span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">{item.listing_type === 'event' ? 'School event' : 'Business mentioned by school'}</span>{item.listing_type === 'event' && item.starts_at && <span className="text-xs text-muted-foreground">{formatDate(item.starts_at)}</span>}</div>
            <h3 className="mt-3 font-semibold text-foreground">{item.title}</h3>{item.summary && <p className="mt-2 line-clamp-4 text-sm leading-5 text-muted-foreground">{item.summary}</p>}{item.location && <p className="mt-2 text-xs text-muted-foreground">{item.location}</p>}
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm"><a href={item.source_url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline underline-offset-4">Source: {item.source_label}</a>{item.external_url && item.external_url !== item.source_url && <a href={item.external_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-muted-foreground underline underline-offset-4">More info <ExternalLink className="h-3.5 w-3.5" /></a>}</div>
          </article>)}</div>
        </Section>}

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
                href={`/discover?university=${encodeURIComponent(university.id)}`}
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
                href={`/discover?university=${encodeURIComponent(university.id)}`}
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
                href={`/events?university=${encodeURIComponent(university.slug)}`}
                className="mt-3 inline-flex items-center text-sm font-medium text-primary hover:gap-2 transition-all"
              >
                View campus events
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </div>
          </div>
        </Section>

        <Section id="nearby-campus-places" className="bg-muted/20">
          <CampusNearbyDiscovery campus={[university.name, university.city, university.region, university.country || 'Ghana'].filter(Boolean).join(', ')} />
        </Section>

        {/* Events */}
        <Section id="campus-events" className="bg-muted/30">
          <SectionHeading
            eyebrow="Events"
            title={`Events at ${university.short_name}`}
            description={`Upcoming events published for ${university.name}. Only events with a confirmed listing and date appear here.`}
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
                  <div className="relative h-40 overflow-hidden bg-gradient-to-br from-accent/15 via-primary/5 to-secondary/10">
                    <UniversityMedia
                      src={event.cover_image_url}
                      fallbackSrc={localBranding.campusUrl || heroImageUrl}
                      alt={`${event.title} at ${university.short_name}`}
                      name={university.name}
                      shortName={university.short_name}
                      kind="campus"
                      className="h-full w-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/55 to-transparent" />
                    <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-slate-950/65 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
                      <Calendar className="h-3.5 w-3.5" /> Upcoming event
                    </span>
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
