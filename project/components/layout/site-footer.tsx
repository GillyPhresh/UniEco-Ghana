import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Facebook, Instagram, LifeBuoy, Twitter, University } from 'lucide-react';
import { Logo } from '@/components/layout/logo';
import { footerLinks, siteConfig } from '@/lib/constants/site';
import { businessEmail, publicBusinessContacts } from '@/lib/constants/business-email';

const groups = [
  { label: 'Explore', links: [{ label: 'Campus updates', href: '/updates' }, ...footerLinks.Discover] },
  { label: 'Community', links: footerLinks.Community.filter((link, index, links) => links.findIndex((other) => other.href === link.href) === index) },
  { label: 'Account', links: footerLinks.Account.filter((link) => link.href !== '/signup') },
];
const socialLinks = [
  { href: siteConfig.links.instagram, label: 'Instagram', Icon: Instagram },
  { href: siteConfig.links.facebook, label: 'Facebook', Icon: Facebook },
  { href: siteConfig.links.twitter, label: 'X (Twitter)', Icon: Twitter },
];
const focus = 'outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card';

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="grid h-1 grid-cols-3" aria-hidden="true">
        <span className="bg-[#ce1126]" /><span className="bg-[#fcd116]" /><span className="bg-[#006b3f]" />
      </div>
      <div className="mx-auto max-w-7xl px-4 pb-5 pt-6 sm:px-6 sm:pt-8 lg:px-8 lg:pt-10">
        <section className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 to-muted/35 p-4 sm:flex sm:items-center sm:justify-between sm:gap-5 sm:p-5 lg:px-7">
          <div className="flex min-w-0 items-start gap-3 sm:items-center">
            <University className="mt-0.5 h-10 w-10 shrink-0 rounded-xl border border-primary/20 bg-card p-2.5 text-primary sm:mt-0" aria-hidden="true" />
            <div>
              <h2 className="text-base font-semibold tracking-tight text-foreground sm:text-lg">Find your place on UniEco</h2>
              <p className="mt-0.5 text-sm leading-5 text-muted-foreground">Explore businesses, updates and opportunities at your school.</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:mt-0 sm:flex sm:shrink-0">
            <Link href="/universities" className={`inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-card px-2.5 py-2 text-center text-sm font-semibold text-foreground transition-colors hover:border-primary hover:text-primary sm:px-4 ${focus}`}>Find my school</Link>
            <Link href="/signup" className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-primary px-2.5 py-2 text-center text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 sm:px-4 ${focus}`}>Join UniEco <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" /></Link>
          </div>
        </section>
        <div className="grid gap-7 py-7 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.7fr)] md:gap-x-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.75fr)_minmax(0,1fr)] lg:py-9 xl:gap-10">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <Logo className={`shrink-0 rounded-lg [&_img]:!h-12 [&_img]:!w-12 [&_img]:object-center ${focus}`} />
              <p className="text-xl font-bold tracking-tight text-foreground">{siteConfig.name}</p>
            </div>
            <p className="mt-2 max-w-xs text-sm leading-6 text-muted-foreground">A place to shop campus businesses, find events and stay connected to tertiary communities across Ghana.</p>
            <div className="mt-4 flex flex-wrap items-center gap-2" aria-label="Social media">
              {socialLinks.map(({ href, label, Icon }) => <a key={label} href={href} target="_blank" rel="noopener noreferrer" aria-label={label} className={`inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-muted/40 text-muted-foreground transition-colors hover:border-primary hover:bg-primary/10 hover:text-primary ${focus}`}><Icon className="h-[18px] w-[18px]" aria-hidden="true" /></a>)}
            </div>
          </div>
          <nav aria-label="Footer navigation" className="grid min-w-0 grid-cols-2 gap-x-5 gap-y-5 border-t border-border pt-5 sm:grid-cols-3 md:border-0 md:pt-0">
            {groups.map(({ label, links }) => <div key={label} className="min-w-0">
              <h2 className="mb-1 text-sm font-semibold text-foreground">{label}</h2><ul>{links.map(({ label: linkLabel, href }) => <li key={href}><Link href={href} className={`inline-flex min-h-11 max-w-full items-center rounded-md py-2 text-sm leading-5 text-muted-foreground transition-colors [overflow-wrap:anywhere] hover:text-primary lg:min-h-9 ${focus}`}>{linkLabel}</Link></li>)}</ul>
            </div>)}
          </nav>
          <section aria-label="Business contacts" className="min-w-0 rounded-2xl border border-border bg-muted/30 p-4 md:col-span-2 lg:col-span-1">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground"><LifeBuoy className="h-[17px] w-[17px] text-primary" aria-hidden="true" /> Contact UniEco Ghana</h2>
            <a href={`mailto:${businessEmail.support}`} className={`mt-1 inline-flex min-h-11 items-center rounded-md text-xs font-medium text-primary underline underline-offset-4 ${focus}`}>Contact UniEco support</a>
            <ul className="mt-2 grid gap-x-5 sm:grid-cols-2 lg:grid-cols-1">
              {publicBusinessContacts.map(({ role, email, purpose }) => <li key={email} className="min-w-0">
                <a href={`mailto:${email}`} className={`group flex min-h-11 items-start justify-between gap-2 rounded-md py-2 text-sm leading-5 transition-colors ${focus}`}>
                  <span className="min-w-0"><span className="block font-medium text-foreground">{role}</span><span className={`block [overflow-wrap:anywhere] group-hover:underline ${email === businessEmail.support ? 'font-medium text-primary' : 'text-muted-foreground'}`}>{email}</span><span className="mt-0.5 block text-xs leading-4 text-muted-foreground">{purpose}</span></span>
                  <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden="true" />
                </a>
              </li>)}
            </ul>
          </section>
        </div>
        <div className="flex flex-col gap-1 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <p className="text-xs leading-5 text-muted-foreground">&copy; {new Date().getFullYear()} {siteConfig.name}. All rights reserved.</p>
          <nav aria-label="Legal and credits" className="flex flex-wrap gap-x-4">
            {footerLinks.Legal.map(({ label, href }) => <Link key={href} href={href} className={`inline-flex min-h-11 items-center rounded-md text-xs font-medium text-muted-foreground transition-colors hover:text-primary sm:min-h-9 ${focus}`}>{label}</Link>)}
          </nav>
        </div>
      </div>
    </footer>
  );
}
