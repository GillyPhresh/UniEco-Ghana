import Link from 'next/link';
import { Twitter, Instagram, Facebook, Mail, ChevronDown, ArrowUpRight } from 'lucide-react';
import { Logo } from '@/components/layout/logo';
import { footerLinks, siteConfig } from '@/lib/constants/site';
import { businessEmail, publicBusinessContacts } from '@/lib/constants/business-email';

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="container py-7 sm:py-12 lg:py-16">
        <div className="grid gap-5 md:grid-cols-2 md:gap-8 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <Logo />
            <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
              {siteConfig.tagline} Find campus businesses and services, explore events and published
              updates, and connect with tertiary communities across Ghana.
            </p>
            <p className="mt-2 max-w-sm text-xs leading-5 text-muted-foreground">
              School listings and updates grow as each community joins. Choose your institution to
              see what is available.
            </p>
            <div className="mt-4 flex items-center gap-2.5">
              <SocialLink href={siteConfig.links.twitter} label="Twitter">
                <Twitter className="h-4 w-4" />
              </SocialLink>
              <SocialLink href={siteConfig.links.instagram} label="Instagram">
                <Instagram className="h-4 w-4" />
              </SocialLink>
              <SocialLink href={siteConfig.links.facebook} label="Facebook">
                <Facebook className="h-4 w-4" />
              </SocialLink>
              <SocialLink href={`mailto:${businessEmail.general}`} label="Email UniEco Ghana">
                <Mail className="h-4 w-4" />
              </SocialLink>
            </div>
            <div className="mt-4 grid gap-x-4 gap-y-2 text-xs sm:grid-cols-2 lg:grid-cols-1">
              {publicBusinessContacts.map(({ role, email, purpose }) => (
                <a key={email} href={`mailto:${email}`} className="flex min-h-10 min-w-0 flex-col justify-center rounded-md text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  <span className="font-medium text-foreground">{role}</span>
                  <span className="break-all">{email}</span>
                  <span className="text-[11px]">{purpose}</span>
                </a>
              ))}
            </div>
          </div>

          {Object.entries(footerLinks).map(([heading, links]) => (
            <details key={heading} className="group border-b border-border/70 md:border-0">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between py-2 text-sm font-semibold text-foreground marker:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:hidden">
                {heading}
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <h3 className="hidden text-sm font-semibold text-foreground md:block">{heading}</h3>
              <ul className="hidden space-y-1 pb-3 group-open:block md:mt-4 md:block md:space-y-3 md:pb-0">
                {links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="flex min-h-10 items-center py-2 text-sm text-muted-foreground transition-colors hover:text-foreground md:min-h-0 md:py-0"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>

        <div className="mt-7 flex flex-col gap-4 border-t border-border pt-5 sm:mt-10 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:pt-6">
          <div className="max-w-xl">
            <h3 className="text-sm font-semibold text-foreground">Find your place on UniEco</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground sm:text-sm">
              Choose your institution to discover its campus community, businesses and opportunities.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
            <Link
              href="/universities"
              className="flex min-h-11 items-center justify-center rounded-lg border border-border px-3 text-center text-sm font-medium text-foreground transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Explore institutions
            </Link>
            <Link
              href="/signup"
              className="flex min-h-11 items-center justify-center gap-1 rounded-lg bg-primary px-3 text-center text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              Join UniEco <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>

        <div className="mt-5 flex flex-col items-center justify-between gap-2 border-t border-border pt-4 text-center sm:mt-6 sm:flex-row sm:gap-4 sm:pt-5 sm:text-left">
          <p className="text-xs text-muted-foreground sm:text-sm">
            &copy; {new Date().getFullYear()} {siteConfig.name}. All rights reserved.
          </p>
          <p className="text-xs text-muted-foreground sm:text-sm">
            Need help?{' '}
            <a
              href={`mailto:${businessEmail.support}`}
              className="font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Contact UniEco support
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}

function SocialLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted/50 text-muted-foreground transition-colors hover:border-primary hover:bg-primary/10 hover:text-primary"
    >
      {children}
    </a>
  );
}
