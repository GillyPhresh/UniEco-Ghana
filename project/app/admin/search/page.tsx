'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AdminLayout, AdminRouteGuard } from '@/components/admin/admin-layout';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { getAdminSearchQualityMetrics, searchManagementRecords } from '@/lib/data/admin-client';
import type { AdminSearchQualityDay } from '@/lib/data/admin-client';
import type { ManagementSearchResult } from '@/lib/types/admin';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth/auth-context';

const resourceHref: Record<ManagementSearchResult['resource_type'], string> = {
  vendor: '/admin/businesses',
  order: '/admin/orders',
  university: '/admin/universities',
  user: '/admin/users',
  business: '/admin/businesses',
  product: '/admin/businesses',
  service: '/admin/businesses',
  event: '/admin/events',
};

export default function AdminSearchPage() {
  return <AdminRouteGuard><AdminLayout><SearchContent /></AdminLayout></AdminRouteGuard>;
}

function SearchContent() {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [results, setResults] = useState<ManagementSearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [qualityRows, setQualityRows] = useState<AdminSearchQualityDay[]>([]);
  const [qualityLoading, setQualityLoading] = useState(false);
  const [qualityError, setQualityError] = useState(false);
  const qualityTotals = useMemo(() => qualityRows.reduce((totals, row) => ({
    searches: totals.searches + row.searches,
    noResults: totals.noResults + row.no_result_searches,
    clicked: totals.clicked + row.search_result_clicks,
  }), { searches: 0, noResults: 0, clicked: 0 }), [qualityRows]);
  const pageSize = 20;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query);
      setPage(0);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const normalized = debouncedQuery.trim();
    if (normalized.length < 3) { setResults([]); setTotal(0); setError(null); setLoading(false); return; }
    let active = true;
    setLoading(true); setError(null);
    void searchManagementRecords(normalized, page * pageSize, pageSize)
      .then((value) => { if (active) { setResults(value.results); setTotal(value.total); } })
      .catch(() => { if (active) { setResults([]); setTotal(0); setError('Unable to search authorized records. Please try again.'); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [debouncedQuery, page, retryCount]);

  useEffect(() => {
    if (user?.role !== 'super_admin') return;
    let active = true;
    setQualityLoading(true);
    void getAdminSearchQualityMetrics(30)
      .then((rows) => { if (active) { setQualityRows(rows); setQualityError(false); } })
      .catch(() => { if (active) setQualityError(true); })
      .finally(() => { if (active) setQualityLoading(false); });
    return () => { active = false; };
  }, [user?.role, retryCount]);

  return (
    <div className="max-w-4xl space-y-5 p-4 sm:p-6">
      <div>
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold text-foreground"><Search className="h-6 w-6 text-primary" /> Management Search</h1>
        <p className="mt-1 text-sm text-muted-foreground">Search only the operational records your authenticated role is authorized to view.</p>
      </div>
      {user?.role === 'super_admin' && <Card><CardContent className="space-y-3 p-4">
        <div><h2 className="font-semibold">Search quality · last 30 days</h2><p className="text-xs text-muted-foreground">Client-reported aggregate telemetry from signed-in users only; use for trends, not authoritative counts. Search terms and session identifiers are not collected.</p></div>
        {qualityLoading ? <Skeleton className="h-12" /> : qualityError ? <div className="flex items-center gap-3"><p role="alert" className="text-sm text-destructive">Unable to load search quality metrics.</p><Button variant="outline" size="sm" onClick={() => setRetryCount((count) => count + 1)}>Retry</Button></div> : qualityRows.length === 0 ? <p className="text-sm text-muted-foreground">No search activity recorded for this period.</p> : <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3"><div><dt className="text-xs text-muted-foreground">Searches</dt><dd className="text-xl font-semibold">{qualityTotals.searches.toLocaleString()}</dd></div><div><dt className="text-xs text-muted-foreground">No results</dt><dd className="text-xl font-semibold">{qualityTotals.noResults.toLocaleString()}</dd></div><div><dt className="text-xs text-muted-foreground">Result clicks</dt><dd className="text-xl font-semibold">{qualityTotals.clicked.toLocaleString()}</dd></div></dl>}
      </CardContent></Card>}
      <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search universities, businesses, products, services, events, orders, or users" aria-label="Search management records" maxLength={100} autoFocus />
      {query.trim().length > 0 && query.trim().length < 3 && <p className="text-sm text-muted-foreground">Enter at least 3 characters.</p>}
      {loading && <div className="space-y-2">{[1, 2, 3].map((key) => <Skeleton key={key} className="h-16" />)}</div>}
      {error && <Card><CardContent className="py-10 text-center space-y-3">
        <p role="alert" className="text-sm text-destructive">{error}</p>
        <Button variant="outline" size="sm" onClick={() => setRetryCount((count) => count + 1)}>Retry search</Button>
      </CardContent></Card>}
      {!loading && !error && debouncedQuery.trim().length >= 3 && results.length === 0 && <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No authorized records match this search.</CardContent></Card>}
      {!loading && results.length > 0 && <div className="space-y-2">
        {results.map((result) => <Link key={`${result.resource_type}-${result.resource_id}`} href={resourceHref[result.resource_type]} className="block">
          <Card className="transition-colors hover:border-primary/40"><CardContent className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0"><p className="truncate text-sm font-medium text-foreground">{result.title}</p><p className="truncate text-xs text-muted-foreground">{result.subtitle}</p></div>
            <Badge variant="outline" className="capitalize">{result.resource_type}</Badge>
          </CardContent></Card>
        </Link>)}
      </div>}
      {total > pageSize && <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Page {page + 1} of {Math.ceil(total / pageSize)} · {total} matching records</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page === 0 || loading} onClick={() => setPage((current) => current - 1)} aria-label="Previous search results">Previous</Button>
          <Button variant="outline" size="sm" disabled={(page + 1) * pageSize >= total || loading} onClick={() => setPage((current) => current + 1)} aria-label="Next search results">Next</Button>
        </div>
      </div>}
    </div>
  );
}
