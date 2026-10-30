import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';

export const metadata = {
  title: 'Code of Conduct | UniEco Ghana',
  description: 'Community standards for students, vendors, universities, and administrators.',
};

export default function CodeOfConductPage() {
  return (
    <>
      <SiteHeader />
      <main className="container max-w-3xl py-10 sm:py-16">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">UniEco Ghana</p>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Code of Conduct</h1>
        <div className="mt-8 space-y-7 text-sm leading-7 text-muted-foreground">
          <section><h2 className="font-display text-lg font-semibold text-foreground">Be respectful</h2><p className="mt-2">Treat students, vendors, university teams, and support staff with honesty and respect. Do not harass, threaten, impersonate, or discriminate against anyone.</p></section>
          <section><h2 className="font-display text-lg font-semibold text-foreground">Be trustworthy</h2><p className="mt-2">Publish accurate business details, use genuine images and offers, honour accepted orders, and do not manipulate reviews, referrals, payments, or platform activity.</p></section>
          <section><h2 className="font-display text-lg font-semibold text-foreground">Keep the community safe</h2><p className="mt-2">Do not post illegal, dangerous, fraudulent, abusive, or privacy-invasive content. Report concerns through support so they can be reviewed.</p></section>
          <section><h2 className="font-display text-lg font-semibold text-foreground">Report a problem</h2><p className="mt-2">Contact <a className="text-primary hover:underline" href="mailto:info.uniecoghana@gmail.com">info.uniecoghana@gmail.com</a> or 0249902919 when you need help.</p></section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
