'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, ChevronRight, ShoppingBag } from 'lucide-react';
import { ProductCard, ProductCardSkeleton } from '@/components/marketplace/product-card';
import { searchProducts } from '@/lib/data/marketplace-client';
import { normalizeSearchTerm } from '@/lib/utils/search';
import type { CampusMateProduct } from '@/lib/data/campus-mate-products';
import type { CatalogProduct } from '@/lib/marketplace/catalog';

export function CampusMateCatalog({ universityId, products, unavailable, category, query }: {
  universityId: string; products: CampusMateProduct[]; unavailable: boolean; category: string; query: string;
}) {
  const normalized = normalizeSearchTerm(query);
  const [term, setTerm] = useState(normalized);
  useEffect(() => {
    const timer = window.setTimeout(() => setTerm(normalized), 220);
    return () => window.clearTimeout(timer);
  }, [normalized]);
  const filtered = Boolean(term || category !== 'all');
  const result = useQuery<{ products: CatalogProduct[]; total: number; error: boolean }>({
    queryKey: ['campus-mate-products', universityId, category, term],
    queryFn: ({ signal }) => searchProducts({ universityId, category: category === 'all' ? undefined : category,
      query: term, limit: 12, signal }),
    enabled: filtered,
    initialData: !filtered ? { products, total: products.length, error: unavailable } : undefined,
    staleTime: 30_000,
    retry: 1,
  });
  const pending = normalized !== term || result.isPending;
  const failed = result.isError || result.data?.error;
  return <section aria-labelledby="campus-products" className="space-y-3">
    <div className="flex items-center justify-between gap-2"><h2 id="campus-products" className="text-lg font-extrabold tracking-tight sm:text-xl">Shop your campus</h2><Link href="/marketplace" className="inline-flex min-h-[44px] shrink-0 items-center gap-1 text-xs font-semibold text-primary">Marketplace<ChevronRight className="h-4 w-4" aria-hidden="true" /></Link></div>
    {pending ? <div role="status"><span className="sr-only">Loading campus products</span><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{[0, 1, 2, 3].map(key => <ProductCardSkeleton key={key} />)}</div></div>
      : failed ? <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4"><p className="text-sm text-muted-foreground">Products couldn’t load. Please try again.</p><button type="button" onClick={() => void result.refetch()} className="min-h-[44px] rounded-xl border px-4 text-sm font-semibold">Retry products</button></div>
      : result.data?.products.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{result.data.products.map((product: CatalogProduct) => <ProductCard key={product.id} product={product} />)}</div>
        : <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4"><div className="flex min-w-0 items-center gap-3"><ShoppingBag className="h-6 w-6 shrink-0 text-primary" aria-hidden="true" /><p className="text-sm text-muted-foreground">{filtered ? 'No products match this selection.' : 'No products listed for this campus yet.'}</p></div><Link href="/marketplace" className="inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-primary">Browse marketplace<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Link></div>}
  </section>;
}
