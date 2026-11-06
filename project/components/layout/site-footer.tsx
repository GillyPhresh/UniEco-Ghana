import Link from 'next/link';
import { Twitter, Instagram, Facebook, Mail, ChevronDown } from 'lucide-react';
import { Logo } from '@/components/layout/logo';
import { footerLinks, siteConfig } from '@/lib/constants/site';

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="container py-7 sm:py-12 lg:py-16">
        <div className="grid gap-5 md:grid-cols-2 md:gap-8 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <Logo />
            <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
              {siteConfig.tagline} The campus marketplace built for every tertiary
              institution in Ghana.
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
              <SocialLink href="mailto:info.uniecoghana@gmail.com" label="Email UniEco Ghana">
                <Mail className="h-4 w-4" />
              </SocialLink>
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

        <div className="mt-6 flex flex-col items-center justify-between gap-2 border-t border-border pt-4 text-center sm:mt-10 sm:flex-row sm:gap-4 sm:pt-6 sm:text-left">
          <p className="text-xs text-muted-foreground sm:text-sm">
            &copy; {new Date().getFullYear()} {siteConfig.name}. All rights reserved.
          </p>
          <p className="text-xs text-muted-foreground sm:text-sm">
            Built for students, by students. Made in Ghana.
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
