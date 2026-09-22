import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { UniversityDirectory } from '@/components/universities/university-directory';
import { getUniversityDirectory } from '@/lib/data/public-queries';

export const dynamic = 'force-dynamic';

export default async function UniversitiesPage() {
  const universities = await getUniversityDirectory();
  return (
    <>
      <SiteHeader />
      <main className="container py-8 sm:py-10">
        <div className="mb-8 max-w-3xl">
          <p className="text-sm font-semibold text-primary">Verified directory</p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Ghana university directory</h1>
          <p className="mt-3 text-muted-foreground">Search recognised university-level institutions by name, abbreviation, city, region, or an established alias. Campus operations are shown separately from directory inclusion.</p>
        </div>
        <UniversityDirectory universities={universities} />
      </main>
      <SiteFooter />
    </>
  );
}
