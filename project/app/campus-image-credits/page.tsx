import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';

export const metadata = {
  title: 'Campus image credits | UniEco Ghana',
  description: 'Photographer credits and source details for the campus images used on UniEco Ghana.',
};

const campusImageCredits = [
  {
    campus: 'Kwame Nkrumah University of Science and Technology',
    image: 'Road leading to the commercial area',
    credit: 'Jude Hammond',
    source: 'https://commons.wikimedia.org/wiki/File:Knust_campus-_Commercial_area.jpg',
    license: 'Creative Commons Attribution-ShareAlike 4.0 International. The responsive WebP versions are shared under the same license.',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  },
  {
    campus: 'University of Cape Coast',
    image: 'Campus gatehouse and entrance',
    credit: 'University of Cape Coast',
    source: 'https://archive.ucc.edu.gh/news/ucc-gets-new-gatehouse-shuttle-terminal',
    license: 'Official campus image sourced from the university article',
  },
  {
    campus: 'Academic City University',
    image: 'Main administrative building and campus courtyard',
    credit: 'Afrank4436',
    source: 'https://commons.wikimedia.org/wiki/File:Academic_City_University_main_administrative_building_exterior_view.jpg',
    license: 'Creative Commons Attribution-ShareAlike 4.0 International. The responsive WebP versions are shared under the same license.',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  },
  {
    campus: 'University of Ghana',
    image: 'Clock tower',
    credit: 'Maxx Sas via Pexels',
    source: 'https://www.pexels.com/photo/clock-tower-at-university-of-ghana-in-accra-35319846/',
    license: 'Pexels free-to-use license',
    licenseUrl: 'https://www.pexels.com/license/',
  },
];

export default function CampusImageCreditsPage() {
  return (
    <>
      <SiteHeader />
      <main className="container max-w-4xl py-10 sm:py-16">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">UniEco Ghana</p>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Campus image credits
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
          The homepage campus photographs are resized and re-encoded as responsive WebP files for clear display across phones and larger screens. The originals retain their proportions and are never artificially enlarged. The Creative Commons images below remain credited and shared under their stated licenses.
        </p>

        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {campusImageCredits.map((item) => (
            <li key={item.campus} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <h2 className="font-display text-lg font-semibold text-foreground">{item.campus}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {item.image} · Photo by {item.credit}.
              </p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.license}</p>
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm font-medium">
                <SourceLink href={item.source}>Image source</SourceLink>
                {item.licenseUrl ? <SourceLink href={item.licenseUrl}>License</SourceLink> : null}
              </div>
            </li>
          ))}
        </ul>

        <p className="mt-8 text-sm text-muted-foreground">
          <Link href="/" className="font-medium text-primary hover:underline">Return to UniEco Ghana</Link>
        </p>
      </main>
      <SiteFooter />
    </>
  );
}

function SourceLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex min-h-8 items-center gap-1 text-primary hover:underline"
    >
      {children}
      <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
    </a>
  );
}
