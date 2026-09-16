import Link from 'next/link';
import { Github, Twitter, Instagram, Facebook, Mail } from 'lucide-react';
import { Logo } from '@/components/layout/logo';
import { footerLinks, siteConfig } from '@/lib/constants/site';

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-muted/30">
      <div className="container py-14">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <Logo />
            <p className="mt-4 max-w-xs text-sm text-muted-foreground">
              {siteConfig.tagline} The campus marketplace built for every tertiary
              institution in Ghana.
            </p>
            <div className="mt-5 flex items-center gap-3">
              <SocialLink href={siteConfig.links.twitter} label="Twitter">
                <Twitter className="h-4 w-4" />
              </SocialLink>
              <SocialLink href={siteConfig.links.instagram} label="Instagram">
                <Instagram className="h-4 w-4" />
              </SocialLink>
              <SocialLink href={siteConfig.links.facebook} label="Facebook">
                <Facebook className="h-4 w-4" />
              </SocialLink>
              <SocialLink href="mailto:hello@unieco.gh" label="Email">
                <Mail className="h-4 w-4" />
              </SocialLink>
            </div>
          </div>

          {Object.entries(footerLinks).map(([heading, links]) => (
            <div key={heading}>
              <h3 className="text-sm font-semibold text-foreground">{heading}</h3>
              <ul className="mt-4 space-y-3">
                {links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border pt-6 sm:flex-row">
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} {siteConfig.name}. All rights reserved.
          </p>
          <p className="text-sm text-muted-foreground">
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
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:border-primary hover:text-primary"
    >
      {children}
    </a>
  );
}
