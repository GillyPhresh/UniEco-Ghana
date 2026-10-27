import type { Metadata, Viewport } from 'next';
import { Inter, Plus_Jakarta_Sans } from 'next/font/google';
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

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: `${siteConfig.name} — ${siteConfig.tagline}`,
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
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: siteConfig.locale,
    url: siteConfig.url,
    siteName: siteConfig.name,
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
    description: siteConfig.description,
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: siteConfig.name,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
    description: siteConfig.description,
    images: ['/og-image.png'],
  },
  icons: {
    icon: [{ url: '/unieco-favicon.png', type: 'image/png', sizes: '1280x1280' }],
    shortcut: '/unieco-favicon.png',
    apple: '/unieco-favicon.png',
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
  themeColor: '#10b981',
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
        url: `${siteConfig.url}/unieco-favicon.png`,
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
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body
        className={`${inter.variable} ${jakarta.variable} mobile-viewport-safe font-sans pb-[calc(4.25rem+env(safe-area-inset-bottom))] lg:pb-0`}
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
