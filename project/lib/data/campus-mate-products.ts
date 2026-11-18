import 'server-only';
import { createPublicServerClient } from '@/lib/supabase/public-server';
import { firstRelation, type CatalogProduct, type CatalogVendor } from '@/lib/marketplace/catalog';

export type CampusMateProduct = CatalogProduct & { category: string | null };

/** Public catalogue only: never query account data or bypass RLS for discovery. */
export async function getCampusMateProducts(universityId: string): Promise<{ products: CampusMateProduct[]; unavailable: boolean }> {
  const supabase = createPublicServerClient();
  const { data, error } = await supabase.from('products').select(`
    id,name,price,currency,stock,image_url,images,discount_price,low_stock_threshold,business_id,
    business:businesses!inner(category,vendor:vendors!inner(
      id,business_name,business_slug,logo_url,rating_avg,rating_count,delivery_available,is_temporarily_closed
    ))
  `).eq('is_active', true).eq('is_archived', false).gt('stock', 0)
    .eq('business.is_active', true).eq('business.vendor.is_active', true)
    .eq('business.vendor.is_verified', true).eq('business.vendor.is_temporarily_closed', false)
    .eq('business.vendor.university_id', universityId)
    .abortSignal(AbortSignal.timeout(8_000))
    .order('created_at', { ascending: false }).order('id').limit(12);
  if (error) return { products: [], unavailable: true };
  type Row = CatalogProduct & { business: { category: string | null; vendor: CatalogVendor | CatalogVendor[] } | { category: string | null; vendor: CatalogVendor | CatalogVendor[] }[] };
  const products = ((data ?? []) as unknown as Row[]).flatMap(({ business, ...product }) => {
    const relation = firstRelation(business);
    const vendor = firstRelation(relation?.vendor);
    const price = Number(product.discount_price ?? product.price);
    return vendor && Number.isFinite(price) && price >= 0
      ? [{ ...product, category: relation?.category ?? null, vendor }] : [];
  });
  return { products, unavailable: false };
}
