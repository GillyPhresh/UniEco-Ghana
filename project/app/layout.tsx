import type { Metadata } from 'next';
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
    icon: [{ url: '/UniEco%20Ghana%20Logo%20(No%20Background)paystack.png', type: 'image/png' }],
    apple: '/UniEco%20Ghana%20Logo%20(No%20Background)paystack.png',
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

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: siteConfig.name,
  description: siteConfig.description,
  url: siteConfig.url,
  logo: `${siteConfig.url}/UniEco%20Ghana%20Logo%20(No%20Background)paystack.png`,
  slogan: siteConfig.tagline,
  sameAs: Object.values(siteConfig.links),
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
        className={`${inter.variable} ${jakarta.variable} font-sans pb-16 lg:pb-0`}
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
