import type { Metadata } from 'next';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { UniversityAdminWorkspaceContent } from '@/components/admin/university-admin-workspace-content';

export const metadata: Metadata = {
  title: 'Campus impact — UniEco Ghana',
  description: 'View your university administrator appointment and campus impact.',
};

export default function UniversityAdminPage() {
  return (
    <>
      <SiteHeader />
      <main className="min-h-[65vh] bg-slate-50 py-4 sm:py-8">
        <UniversityAdminWorkspaceContent />
      </main>
      <SiteFooter />
    </>
  );
}
