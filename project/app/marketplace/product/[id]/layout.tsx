import type { Metadata } from 'next';
import { siteConfig } from '@/lib/constants/site';
import { getPublicProductSeoById } from '@/lib/data/public-queries';
import { createPublicPageMetadata, serializeJsonLd } from '@/lib/seo/metadata';

type ProductLayoutProps = Readonly<{ children: React.ReactNode; params: Promise<{ id: string }> }>;

export async function generateMetadata({ params }: ProductLayoutProps): Promise<Metadata> {
  const { id } = await params;
  const product = await getPublicProductSeoById(id);
  if (!product) return { title: 'Product not found', robots: { index: false, follow: false } };
  const description = (product.description || `View ${product.name} from a campus business on UniEco Ghana.`).slice(0, 300);
  return createPublicPageMetadata({
    title: `${product.name} — Campus Product`,
    description,
    path: `/marketplace/product/${product.id}`,
    image: product.image_url,
    imageAlt: `${product.name} product image`,
  });
}

export default async function ProductSeoLayout({ children, params }: ProductLayoutProps) {
  const { id } = await params;
  const product = await getPublicProductSeoById(id);
  const jsonLd = product ? {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description || undefined,
    image: product.image_url || undefined,
    url: `${siteConfig.url}/marketplace/product/${product.id}`,
    offers: {
      '@type': 'Offer',
      url: `${siteConfig.url}/marketplace/product/${product.id}`,
      priceCurrency: product.currency || 'GHS',
      price: Number(product.discount_price ?? product.price),
      availability: product.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    },
  } : null;
  return <>{jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />}{children}</>;
}
