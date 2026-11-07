import type { Metadata } from 'next';
import { siteConfig } from '@/lib/constants/site';
import { getPublicServiceSeoById } from '@/lib/data/public-queries';
import { createPublicPageMetadata, serializeJsonLd } from '@/lib/seo/metadata';

type ServiceLayoutProps = Readonly<{ children: React.ReactNode; params: Promise<{ id: string }> }>;

export async function generateMetadata({ params }: ServiceLayoutProps): Promise<Metadata> {
  const { id } = await params;
  const service = await getPublicServiceSeoById(id);
  if (!service) return { title: 'Service not found', robots: { index: false, follow: false } };
  const description = (service.description || `${service.name} from a campus business on UniEco Ghana.`).slice(0, 300);
  return createPublicPageMetadata({
    title: `${service.name} — Campus Service`,
    description,
    path: `/marketplace/service/${service.id}`,
    image: service.image_url,
    imageAlt: `${service.name} service image`,
  });
}

export default async function ServiceSeoLayout({ children, params }: ServiceLayoutProps) {
  const { id } = await params;
  const service = await getPublicServiceSeoById(id);
  const jsonLd = service ? {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: service.name,
    description: service.description || undefined,
    image: service.image_url || undefined,
    url: `${siteConfig.url}/marketplace/service/${service.id}`,
    offers: {
      '@type': 'Offer',
      url: `${siteConfig.url}/marketplace/service/${service.id}`,
      priceCurrency: service.currency || 'GHS',
      price: Number(service.price),
    },
  } : null;
  return <>{jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />}{children}</>;
}
