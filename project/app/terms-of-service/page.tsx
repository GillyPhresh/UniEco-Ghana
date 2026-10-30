import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';

export const metadata = {
  title: 'Terms of Service | UniEco Ghana',
  description: 'The rules for using the UniEco Ghana platform and management services.',
};

export default function TermsOfServicePage() {
  return (
    <>
      <SiteHeader />
      <main className="container max-w-3xl py-10 sm:py-16">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">UniEco Ghana</p>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Terms of Service</h1>
        <p className="mt-3 text-sm text-muted-foreground">Last updated: 30 October 2026</p>
        <div className="mt-8 space-y-7 text-sm leading-7 text-muted-foreground">
          <section><h2 className="font-display text-lg font-semibold text-foreground">Using the platform</h2><p className="mt-2">Provide accurate information, keep your account secure, and use UniEco Ghana lawfully and respectfully. You are responsible for activity carried out through your account.</p></section>
          <section><h2 className="font-display text-lg font-semibold text-foreground">Students and vendors</h2><p className="mt-2">Students, vendors, and university administrators must use the role and university information that applies to them. Vendors are responsible for truthful listings, prices, availability, fulfilment, and customer communication.</p></section>
          <section><h2 className="font-display text-lg font-semibold text-foreground">Payments and access</h2><p className="mt-2">A payment becomes successful only after the provider result is verified and matched to the UniEco Ghana payment record. A pending, failed, cancelled, or mismatched payment does not unlock paid access.</p></section>
          <section><h2 className="font-display text-lg font-semibold text-foreground">Safety and enforcement</h2><p className="mt-2">We may review, restrict, or suspend accounts and content to protect users, investigate abuse, resolve payment disputes, or comply with applicable requirements.</p></section>
          <section><h2 className="font-display text-lg font-semibold text-foreground">Contact</h2><p className="mt-2">Questions can be sent to <a className="text-primary hover:underline" href="mailto:info.uniecoghana@gmail.com">info.uniecoghana@gmail.com</a> or 0249902919.</p></section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
