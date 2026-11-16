import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, CalendarDays, Globe2, GraduationCap, Images, MapPin, Newspaper, Store, type LucideIcon } from 'lucide-react';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { BusinessCard } from '@/components/shared/business-card';
import { CampusNearbyDiscovery } from '@/components/universities/campus-nearby-discovery';
import { CampusPhotoGallery, UniversityLogo, UniversityMedia } from '@/components/universities/university-media';
import { EntityViewTracker } from '@/components/analytics/entity-view-tracker';
import { presentCampus } from '@/lib/data/campus-presentation';
import { campusProgrammeSnapshot } from '@/lib/data/campus-programmes';
import { getCampusRegulatorNotice } from '@/lib/data/campus-regulator-notices';
import {
  getUniversityBySlug, getVendorsByUniversity, getUpcomingCampusEvents,
  getUniversityAnnouncementsByUniversity, getPublishedCampusDiscoveries, getReviewedCampusUpdates,
  type CampusDiscoveryListing,
} from '@/lib/data/public-queries';
import { siteConfig } from '@/lib/constants/site';
import { createPublicPageMetadata, serializeJsonLd } from '@/lib/seo/metadata';
import { secureSourceUrl } from '@/lib/utils/campuses';

interface PageProps {
  params: Promise<{ slug: string }>;
}

const regulatorDirectory = 'https://gtec.edu.gh/institutional-categories/';
const sectionClass = 'min-w-0 scroll-mt-24 rounded-3xl border border-border bg-card p-4 shadow-sm sm:p-6';
const sectionLinks = [
  { href: '#overview', label: 'Overview', icon: BookOpen },
  { href: '#campus-updates', label: 'Updates', icon: Newspaper },
  { href: '#campus-events', label: 'Events', icon: CalendarDays },
  { href: '#featured', label: 'Businesses', icon: Store },
  { href: '#nearby-campus-places', label: 'Nearby', icon: MapPin },
];

function formatDate(value?: string | null) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return new Intl.DateTimeFormat('en-GH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Accra' }).format(date);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const university = await getUniversityBySlug(slug);
  if (!university) return { title: 'Institution not found', robots: { index: false, follow: false } };
  const campus = presentCampus(university);
  return createPublicPageMetadata({
    title: `${campus.name} — Campus Profile`,
    description: `Explore ${campus.name}${campus.location ? ` in ${campus.location}` : ''}: school information, campus updates, events, and nearby businesses on UniEco Ghana.`,
    path: `/university/${university.slug}`,
    image: campus.photos[0]?.src ?? campus.logo ?? '/unieco-official-logo.png',
    imageAlt: campus.photos[0]?.alt ?? (campus.logo ? campus.logoAlt : 'UniEco Ghana'),
  });
}

export default async function UniversityPage({ params }: PageProps) {
  const { slug } = await params;
  const university = await getUniversityBySlug(slug);
  if (!university) notFound();
  const campus = presentCampus(university);
  const [vendors, events, announcements, discoveries, updates] = await Promise.all([
    getVendorsByUniversity(university.id, 8),
    getUpcomingCampusEvents(university.id, 6),
    getUniversityAnnouncementsByUniversity(university.id, 3),
    getPublishedCampusDiscoveries(university.id, 12),
    getReviewedCampusUpdates(university, 3),
  ]);
  const now = Date.now();
  const sourceEvents = discoveries.filter((item) => item.listing_type === 'event' && item.starts_at && Date.parse(item.starts_at) >= now);
  const sourceBusinesses = discoveries.filter((item) => item.listing_type === 'business');
  const campusAddress = [campus.name, campus.location, university.country || 'Ghana'].filter(Boolean).join(', ');
  const discoverLink = `/discover?university=${encodeURIComponent(university.id)}`;
  const eventsLink = `/events?university=${encodeURIComponent(university.slug)}`;
  const mapsLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(campusAddress)}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollegeOrUniversity',
    name: campus.name,
    ...(campus.shortName !== campus.name && { alternateName: campus.shortName }),
    description: campus.overview,
    address: {
      '@type': 'PostalAddress', addressLocality: university.city, addressRegion: university.region, addressCountry: university.country,
    },
    url: `${siteConfig.url}/university/${university.slug}`,
    ...(campus.website && { sameAs: [campus.website] }),
    ...(campus.logo && { logo: new URL(campus.logo, siteConfig.url).href }),
    ...(campus.photos[0] && { image: new URL(campus.photos[0].src, siteConfig.url).href }),
  };
  const accreditationChecked = formatDate(university.accreditation_checked_at);
  const regulatorNotice = getCampusRegulatorNotice(university.slug);
  const programmeSnapshot = regulatorNotice ? undefined : campusProgrammeSnapshot(university.slug, campus.regulator);

  return (
    <>
      <EntityViewTracker eventType="university_view" subjectType="university" subjectId={university.id} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      <SiteHeader />
      <main className="container max-w-7xl pb-10 pt-3 sm:pb-16 sm:pt-5">
        <nav className="mb-2" aria-label="Breadcrumb">
          <Link href="/universities" className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-primary">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All institutions
          </Link>
        </nav>

        <header className="overflow-hidden rounded-[1.75rem] border border-border bg-card shadow-sm sm:rounded-[2rem]">
          <div className="relative">
            <CampusPhotoGallery photos={campus.photos} name={campus.name} shortName={campus.shortName} priority />
          </div>
          <div className="grid gap-5 px-4 pb-5 pt-4 sm:px-7 sm:pb-7 sm:pt-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-8">
            <div className="flex min-w-0 items-start gap-3 sm:gap-5">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-border bg-white p-1.5 shadow-sm sm:h-24 sm:w-24 sm:rounded-3xl sm:p-2">
                <UniversityLogo src={campus.logo} fallbackSrc={campus.fallbackLogo} alt={campus.logoAlt} name={campus.name} shortName={campus.shortName} loading="eager" />
              </div>
              <div className="min-w-0">
                <p className="mb-1 text-[11px] font-semibold uppercase leading-snug tracking-[0.12em] text-primary sm:text-xs">{campus.institutionType}</p>
                <h1 className="break-words font-display text-[clamp(1.25rem,4.6vw,2.7rem)] font-bold leading-tight tracking-tight text-foreground">{campus.name}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground sm:text-sm">
                  {campus.shortName !== campus.name && <span className="font-semibold text-foreground">{campus.shortName}</span>}
                  {campus.location && <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />{campus.location}</span>}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {campus.website && <ExternalAction href={campus.website} label="School website" icon={Globe2} primary />}
              <ExternalAction href={mapsLink} label="Find on map" icon={MapPin} />
            </div>
          </div>
        </header>

        {regulatorNotice && (
          <aside aria-label="GTEC notice" className="mt-4 flex flex-wrap items-center gap-x-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
            <p className="min-w-0 flex-1 basis-56 text-sm leading-6 text-foreground">{regulatorNotice.message}</p>
            <ExternalAction href={regulatorNotice.href} label="Read the GTEC notice" icon={ArrowUpRight} compact />
          </aside>
        )}

        <nav aria-label="Campus profile sections" className="my-4 flex flex-wrap gap-1.5 rounded-2xl border border-border bg-card p-1.5 sm:my-6 sm:gap-2 sm:p-2">
          {sectionLinks.map(({ href, label, icon: Icon }) => <a key={href} href={href} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-primary/10 hover:text-primary sm:px-4">
            <Icon className="h-4 w-4 text-primary" aria-hidden="true" />{label}
          </a>)}
        </nav>

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-6">
          <div className="min-w-0 space-y-4 sm:space-y-6">
            <section id="overview" className={sectionClass} aria-labelledby="overview-title">
              <ProfileHeading id="overview-title" title="About the school" icon={GraduationCap} />
              <p className="mt-3 max-w-prose whitespace-pre-line break-words text-sm leading-relaxed text-muted-foreground sm:text-base">{campus.overview}</p>
              {campus.overviewSource && <ExternalAction href={campus.overviewSource} label="About this school" icon={ArrowUpRight} compact />}
              {campus.gallery && <ExternalAction href={campus.gallery} label="More campus photos" icon={Images} compact />}
              {programmeSnapshot && <div className="mt-4 border-t border-border/80 pt-4">
                <h3 className="font-semibold">Programmes listed by GTEC</h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">Checked {formatDate(programmeSnapshot.checkedAt)}. Confirm current details before applying.</p>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {programmeSnapshot.programmes.slice(0, 6).map(({ award, programme }) => (
                    <li key={`${award}:${programme}`} className="flex min-w-0 items-start gap-2 rounded-xl border border-border bg-background p-2.5 text-sm">
                      <span className="shrink-0 rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-bold text-primary">{award}</span>
                      <span className="break-words">{programme}</span>
                    </li>
                  ))}
                </ul>
                {campus.regulator && <ExternalAction href={campus.regulator} label="See programme records" icon={ArrowUpRight} compact />}
              </div>}
            </section>

            <section id="campus-updates" className={sectionClass} aria-labelledby="updates-title">
              <ProfileHeading id="updates-title" title="Campus updates" icon={Newspaper} />
              {announcements.length > 0 && <ul className="mt-3 divide-y divide-border/80">
                {announcements.map((announcement) => <li key={announcement.id} className="py-3">
                  <p className="text-xs font-semibold text-primary">{announcement.is_pinned ? 'Pinned notice' : 'School announcement'}{formatDate(announcement.created_at) && ` · ${formatDate(announcement.created_at)}`}</p>
                  <h3 className="mt-1 break-words font-semibold">{announcement.title}</h3>
                  <details className="mt-1.5 text-sm text-muted-foreground">
                    <summary className="cursor-pointer py-2 font-medium text-primary">Read notice</summary>
                    <p className="mt-1 whitespace-pre-line break-words leading-6">{announcement.body}</p>
                  </details>
                </li>)}
              </ul>}
              {updates.length > 0 && <ul className="mt-3 divide-y divide-border/80">
                {updates.map((item) => {
                  const href = secureSourceUrl(item.canonical_url);
                  return <li key={item.id} className="py-3">
                    <p className="text-xs font-medium text-muted-foreground">{item.source_label}{formatDate(item.published_at) && ` · ${formatDate(item.published_at)}`}</p>
                    <h3 className="mt-1 break-words font-semibold">{href ? <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-1.5 hover:text-primary hover:underline">{item.title}<ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden="true" /></a> : item.title}</h3>
                    {item.excerpt && !item.excerpt.toLowerCase().startsWith(item.title.toLowerCase()) && <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">{item.excerpt}</p>}
                  </li>;
                })}
              </ul>}
              {!announcements.length && !updates.length && <ProfileNote>No updates have been published for this campus on UniEco yet.</ProfileNote>}
              {(campus.news || campus.website) && <ExternalAction href={(campus.news || campus.website)!} label={campus.news ? 'Updates from the school' : 'Check the school website'} icon={ArrowUpRight} compact />}
              <Link href="/updates" className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-primary hover:underline">All campus updates <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
            </section>

            <section id="campus-events" className={sectionClass} aria-labelledby="events-title">
              <ProfileHeading id="events-title" title="Upcoming events" icon={CalendarDays} />
              {events?.length ? <ul className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2">
                {events.map((event) => <li key={event.id} className="min-w-0">
                  <Link href={`/events/${event.slug}`} className="group flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-background hover:border-primary/50">
                    {secureSourceUrl(event.cover_image_url) && <UniversityMedia src={event.cover_image_url} alt="" name={campus.name} shortName={campus.shortName} kind="campus" className="aspect-[2/1] w-full object-cover" />}
                    <div className="p-4">
                      <time dateTime={event.start_time || undefined} className="text-xs font-semibold text-primary">{formatDate(event.start_time)}</time>
                      <h3 className="mt-1 break-words font-semibold group-hover:text-primary">{event.title}</h3>
                      {(event.location || event.is_virtual) && <p className="mt-1 text-sm text-muted-foreground">{event.is_virtual ? 'Online event' : event.location}</p>}
                    </div>
                  </Link>
                </li>)}
              </ul> : events === null ? <ProfileNote>Campus events couldn’t be loaded. Please try again shortly.</ProfileNote>
                : !sourceEvents.length && <ProfileNote>No upcoming events are listed for this campus on UniEco yet.</ProfileNote>}
              {sourceEvents.length > 0 && <SourceListings title="Events from school sources" items={sourceEvents} />}
              {Boolean(events?.length) && <Link href={eventsLink} className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary hover:underline">See all campus events <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>}
            </section>

            <section id="featured" className={sectionClass} aria-labelledby="businesses-title">
              <ProfileHeading id="businesses-title" title="Campus businesses" icon={Store} />
              {vendors.length ? <>
                <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">{vendors.map((vendor) => <BusinessCard key={vendor.id} vendor={vendor} />)}</div>
                <Link href={discoverLink} className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary hover:underline">Browse campus listings <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
              </> : <ProfileNote>No businesses are listed for this campus on UniEco yet. <a href="#nearby-campus-places" className="font-semibold text-primary underline underline-offset-2">Find nearby places</a> for food, shops, and services.</ProfileNote>}
              {sourceBusinesses.length > 0 && <SourceListings title="Businesses mentioned by the school" items={sourceBusinesses} />}
            </section>

            <div id="nearby-campus-places" className="scroll-mt-24">
              <CampusNearbyDiscovery campus={campusAddress} />
            </div>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24">
            <section className={sectionClass} aria-labelledby="campus-info-title">
              <ProfileHeading id="campus-info-title" title="Campus at a glance" icon={MapPin} />
              <dl className="mt-3 divide-y divide-border/80 text-sm">
                <CampusFact label="Institution type" value={campus.institutionType} />
                <CampusFact label="Town or city" value={university.city} />
                <CampusFact label="Region" value={university.region} />
                <CampusFact label="Country" value={university.country || 'Ghana'} />
              </dl>
            </section>
            <section className={sectionClass} aria-labelledby="regulator-title">
              <ProfileHeading id="regulator-title" title="Accreditation and sources" icon={BookOpen} />
              <p className="mt-2 text-sm leading-6 text-muted-foreground">Verify current accreditation and programmes with GTEC.{campus.regulator && accreditationChecked && ` Directory record checked ${accreditationChecked}.`}</p>
              <ExternalAction href={campus.regulator || regulatorDirectory} label={campus.regulator ? 'View institution record at GTEC' : 'Check GTEC’s institution register'} icon={ArrowUpRight} compact />
              {campus.institutionType === 'Public Nurses/Health Training College' && <ExternalAction href="https://register.healthtraining.gov.gh/dashboard" label="Health training admissions portal" icon={ArrowUpRight} compact />}
              {campus.logoCredit && <ExternalAction href={campus.logoCredit} label="Logo source" icon={ArrowUpRight} compact />}
              {university.image_credit && <p className="mt-2 text-xs leading-5 text-muted-foreground">School image credit: {university.image_credit}</p>}
            </section>
          </aside>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

function ProfileHeading({ id, title, icon: Icon }: { id: string; title: string; icon: LucideIcon }) {
  return <h2 id={id} className="flex items-center gap-2.5 font-display text-lg font-bold tracking-tight sm:text-xl"><Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />{title}</h2>;
}

function CampusFact({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return <div className="flex items-start justify-between gap-3 py-2.5"><dt className="shrink-0 text-muted-foreground">{label}</dt><dd className="text-right font-semibold">{value}</dd></div>;
}

function ProfileNote({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 rounded-xl bg-muted/45 p-3 text-sm leading-6 text-muted-foreground">{children}</p>;
}

function ExternalAction({ href, label, icon: Icon, primary, compact }: { href: string; label: string; icon: LucideIcon; primary?: boolean; compact?: boolean }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className={`inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold ${compact ? 'mr-1 mt-2 text-primary hover:bg-primary/5 hover:underline' : primary ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'border border-border text-foreground hover:border-primary/50 hover:text-primary'}`}><Icon className="h-4 w-4 shrink-0" aria-hidden="true" />{label}</a>;
}

function SourceListings({ title, items }: { title: string; items: CampusDiscoveryListing[] }) {
  return <div className="mt-4 border-t border-border/80 pt-3">
    <h3 className="text-sm font-semibold">{title}</h3>
    <p className="mt-1 text-xs leading-5 text-muted-foreground">These entries are not verified by UniEco. Check the original publisher for current details.</p>
    <ul className="mt-2 grid gap-2 sm:grid-cols-2">
      {items.map((item) => {
        const href = secureSourceUrl(item.source_url);
        return <li key={item.id} className="min-w-0 rounded-xl border border-border bg-background p-3">
          <p className="break-words text-sm font-semibold">{item.title}</p>
          {(item.starts_at || item.location) && <p className="mt-1 text-xs text-muted-foreground">{[formatDate(item.starts_at), item.location].filter(Boolean).join(' · ')}</p>}
          {item.summary && <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{item.summary}</p>}
          {href && <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-primary hover:underline">Source: {item.source_label}<ArrowUpRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /></a>}
        </li>;
      })}
    </ul>
  </div>;
}
