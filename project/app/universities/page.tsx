import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { UniversityDirectory } from '@/components/universities/university-directory';
import { getUniversityDirectory } from '@/lib/data/public-queries';
import { createPublicPageMetadata } from '@/lib/seo/metadata';

export const metadata = createPublicPageMetadata({
  title: 'Ghana Tertiary Institution Directory',
  description: 'Explore Ghanaian universities, Colleges of Education, and health training colleges. Search institution profiles by name, type, city, or region.',
  path: '/universities',
});

// The directory is public data. A short cache keeps mobile navigation quick
// while still allowing newly approved branding to appear without a deploy.
export const revalidate = 300;

export default async function UniversitiesPage() {
  const universities = await getUniversityDirectory();
  return (
    <>
      <SiteHeader />
      <main className="container py-8 sm:py-10">
        <div className="mb-8 max-w-3xl">
          <p className="text-sm font-semibold text-primary">Ghana tertiary education directory</p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Ghana tertiary institution directory</h1>
          <p className="mt-3 text-muted-foreground">Find universities, Colleges of Education, and health training colleges by name, institution type, city, region, or alias. GTEC accreditation details link to the regulator’s record; campus participation on UniEco is shown separately.</p>
        </div>
        <UniversityDirectory universities={universities} />
      </main>
      <SiteFooter />
    </>
  );
}
