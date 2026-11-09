import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AppProviders } from '@/components/providers/app-providers';
import { ServiceWorkerRegister } from '@/components/pwa/service-worker-register';
import { OfflineIndicator } from '@/components/pwa/offline-indicator';
import { InstallPrompt } from '@/components/pwa/install-prompt';
import { UpdateBanner } from '@/components/pwa/update-banner';
import { MobileBottomNav } from '@/components/pwa/mobile-bottom-nav';
import { PageViewTracker } from '@/components/analytics/page-view-tracker';
import { siteConfig } from '@/lib/constants/site';

const googleSiteVerification = process.env.GOOGLE_SITE_VERIFICATION?.trim();

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: `${siteConfig.name} | Ghana's Campus Marketplace & Community`,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  keywords: siteConfig.keywords,
  authors: [{ name: siteConfig.name }],
  creator: siteConfig.name,
  verification: googleSiteVerification
    ? { google: googleSiteVerification }
    : undefined,
  manifest: '/manifest.webmanifest',
  openGraph: {
    type: 'website',
    locale: siteConfig.locale,
    url: siteConfig.url,
    siteName: siteConfig.name,
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
    description: siteConfig.description,
    images: [
      {
        url: '/unieco-ghana-dark-logo.png',
        width: 1280,
        height: 1280,
        alt: siteConfig.name,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
    description: siteConfig.description,
    images: ['/unieco-ghana-dark-logo.png'],
  },
  icons: {
    icon: [
      { url: '/unieco-search-icon.svg', type: 'image/svg+xml', sizes: 'any' },
      { url: '/unieco-main-logo.png', type: 'image/png', sizes: '1280x1280' },
    ],
    shortcut: '/unieco-search-icon.svg',
    apple: '/unieco-main-logo.png',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  formatDetection: {
    telephone: false,
  },
};

// The platform is mobile-first. Explicitly locking the layout viewport to the
// device width prevents mobile browsers from rendering a desktop canvas and
// scaling it down, which causes the apparent zoom/crop behavior.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#10b981' },
    { media: '(prefers-color-scheme: dark)', color: '#090f19' },
  ],
};

const organizationId = `${siteConfig.url}/#organization`;

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': organizationId,
      name: siteConfig.name,
      description: siteConfig.description,
      url: siteConfig.url,
      logo: {
        '@type': 'ImageObject',
        url: `${siteConfig.url}/unieco-main-logo.png`,
      },
      slogan: siteConfig.tagline,
      areaServed: {
        '@type': 'Country',
        name: 'Ghana',
      },
      sameAs: Object.values(siteConfig.links),
    },
    {
      '@type': 'WebSite',
      '@id': `${siteConfig.url}/#website`,
      url: siteConfig.url,
      name: siteConfig.name,
      publisher: { '@id': organizationId },
      inLanguage: siteConfig.locale,
    },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
        />
      </head>
      <body
        className={`${inter.variable} mobile-viewport-safe font-sans pb-[calc(3.75rem+env(safe-area-inset-bottom))] lg:pb-0`}
        suppressHydrationWarning
      >
        <AppProviders>
          <PageViewTracker />
          <ServiceWorkerRegister />
          <OfflineIndicator />
          <UpdateBanner />
          <InstallPrompt />
          {children}
          <MobileBottomNav />
        </AppProviders>
      </body>
    </html>
  );
}
