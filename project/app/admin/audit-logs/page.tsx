'use client';

import { useState, useEffect, useDeferredValue, useCallback } from 'react';
import { AdminRouteGuard, AdminLayout } from '@/components/admin/admin-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getAdminActions } from '@/lib/data/admin-client';
import type { AdminAction } from '@/lib/types/admin';
import { ScrollText, ChevronLeft, ChevronRight } from 'lucide-react';

export default function AdminAuditLogsPage() {
  return (
    <AdminRouteGuard><AdminLayout><Content /></AdminLayout></AdminRouteGuard>
  );
}

function Content() {
  const [loading, setLoading] = useState(true);
  const [actions, setActions] = useState<AdminAction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [moduleFilter, setModuleFilter] = useState('all');
  const [actionSearch, setActionSearch] = useState('');
  const [actorFilter, setActorFilter] = useState('');
  const [targetFilter, setTargetFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const deferredActionSearch = useDeferredValue(actionSearch);
  const [error, setError] = useState<string | null>(null);
  const pageSize = 50;

  const loadActions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getAdminActions({
        module: moduleFilter,
        actionSearch: deferredActionSearch,
        actorId: actorFilter.trim(),
        targetId: targetFilter.trim(),
        fromDate,
        toDate,
        limit: pageSize,
        offset: page * pageSize,
      });
      setActions(result.actions);
      setTotal(result.total);
    } catch (cause) {
      setActions([]);
      setTotal(0);
      setError(cause instanceof Error && cause.message !== 'Unable to load audit logs'
        ? cause.message
        : 'Unable to load audit logs. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [actorFilter, deferredActionSearch, fromDate, moduleFilter, page, targetFilter, toDate]);

  useEffect(() => { void loadActions(); }, [loadActions]);

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-5xl">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
          <ScrollText className="h-6 w-6 text-primary" /> Audit Logs
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Immutable record of all administrative actions ({total} entries)</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Select value={moduleFilter} onValueChange={v => { setModuleFilter(v); setPage(0); }}>
          <SelectTrigger aria-label="Filter by module"><SelectValue placeholder="All modules" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All modules</SelectItem>
            <SelectItem value="users">Users</SelectItem>
            <SelectItem value="verification">Verification</SelectItem>
            <SelectItem value="businesses">Businesses</SelectItem>
            <SelectItem value="universities">Universities</SelectItem>
            <SelectItem value="categories">Categories</SelectItem>
            <SelectItem value="subscriptions">Subscriptions</SelectItem>
            <SelectItem value="advertisements">Advertisements</SelectItem>
            <SelectItem value="moderation">Moderation</SelectItem>
            <SelectItem value="support">Support</SelectItem>
            <SelectItem value="cms">CMS</SelectItem>
            <SelectItem value="announcements">Announcements</SelectItem>
          </SelectContent>
        </Select>
        <Input value={actionSearch} onChange={event => { setActionSearch(event.target.value); setPage(0); }} placeholder="Search action (at least 3 characters)" aria-label="Search audit actions" />
        <Input value={actorFilter} onChange={event => { setActorFilter(event.target.value); setPage(0); }} placeholder="Actor profile UUID" aria-label="Filter audit logs by actor profile UUID" />
        <Input value={targetFilter} onChange={event => { setTargetFilter(event.target.value); setPage(0); }} placeholder="Target resource UUID" aria-label="Filter audit logs by target resource UUID" />
        <Input type="date" value={fromDate} onChange={event => { setFromDate(event.target.value); setPage(0); }} aria-label="Audit start date" />
        <Input type="date" value={toDate} onChange={event => { setToDate(event.target.value); setPage(0); }} aria-label="Audit end date" />
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">{[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
          ) : error ? (
            <div className="space-y-3 py-12 text-center text-sm text-muted-foreground">
              <p>{error}</p>
              <Button variant="outline" size="sm" onClick={loadActions}>Retry</Button>
            </div>
          ) : actions.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No audit log entries found</div>
          ) : (
            <>
            <div className="space-y-3 p-3 lg:hidden" aria-label="Mobile audit log">
              {actions.map(a => <article key={a.id} className="rounded-xl border border-border bg-background p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-words font-mono text-xs font-medium">{a.action}</p><p className="mt-1 break-words text-sm">{a.admin?.full_name || a.admin?.email || 'Administrator unavailable'}</p></div><Badge className="shrink-0" variant={a.result === 'success' ? 'default' : 'destructive'}>{a.result}</Badge></div>
                <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-3 text-sm"><div><dt className="text-xs text-muted-foreground">Module</dt><dd className="mt-0.5"><Badge variant="outline">{a.module}</Badge></dd></div><div><dt className="text-xs text-muted-foreground">Target</dt><dd className="mt-0.5 break-words text-xs">{a.target_type || '—'}</dd></div><div className="col-span-2"><dt className="text-xs text-muted-foreground">Reason</dt><dd className="mt-0.5 break-words text-xs text-muted-foreground">{a.reason || '—'}</dd></div><div className="col-span-2"><dt className="text-xs text-muted-foreground">Time</dt><dd className="mt-0.5 text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString('en-GH', { dateStyle: 'short', timeStyle: 'short' })}</dd></div></dl>
              </article>)}
            </div>
            <div className="hidden lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Admin</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Module</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {actions.map(a => (
                  <TableRow key={a.id}>
                    <TableCell className="text-sm">{a.admin?.full_name || a.admin?.email || '—'}</TableCell>
                    <TableCell className="font-mono text-xs">{a.action}</TableCell>
                    <TableCell><Badge variant="outline">{a.module}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{a.target_type || '—'}</TableCell>
                    <TableCell className="max-w-xs whitespace-normal text-xs text-muted-foreground">{a.reason || '—'}</TableCell>
                    <TableCell><Badge className={a.result === 'success' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}>{a.result}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString('en-GH', { dateStyle: 'short', timeStyle: 'short' })}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
            </>
          )}
        </CardContent>
      </Card>

      {total > pageSize && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Page {page + 1} of {Math.ceil(total / pageSize)}</p>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" disabled={(page + 1) * pageSize >= total} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}
    </div>
  );
}
