'use client';

import { useState, useEffect, useCallback } from 'react';
import { AdminRouteGuard, AdminLayout } from '@/components/admin/admin-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { getAdminBusinesses, suspendVendor, restoreVendor, approveVendor } from '@/lib/data/admin-client';
import type { AdminVendorDirectoryItem } from '@/lib/types/admin';
import { useAuth } from '@/lib/auth/auth-context';
import { Search, Store, Ban, RotateCcw, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminBusinessesPage() {
  return (
    <AdminRouteGuard><AdminLayout><Content /></AdminLayout></AdminRouteGuard>
  );
}

function Content() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';
  const canManageVendors = isSuperAdmin || user?.role === 'university_admin';
  const [loading, setLoading] = useState(true);
  const [vendors, setVendors] = useState<AdminVendorDirectoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [verifiedFilter, setVerifiedFilter] = useState('all');
  const [selected, setSelected] = useState<AdminVendorDirectoryItem | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionReason, setActionReason] = useState('');
  const [pendingAction, setPendingAction] = useState<'verify' | 'suspend' | 'restore' | null>(null);
  const pageSize = 20;

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const loadVendors = useCallback(async () => {
    const normalizedSearch = debouncedSearch.trim();
    if (normalizedSearch.length > 0 && normalizedSearch.length < 3) {
      setVendors([]);
      setTotal(0);
      setLoadError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const result = await getAdminBusinesses({
        search: normalizedSearch || undefined,
        verified: verifiedFilter === 'verified' ? true : verifiedFilter === 'unverified' ? false : undefined,
        limit: pageSize, offset: page * pageSize,
      });
      setVendors(result.vendors);
      setTotal(result.total);
    } catch {
      setVendors([]);
      setTotal(0);
      setLoadError('Unable to load businesses within your management scope. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, page, verifiedFilter]);

  useEffect(() => { void loadVendors(); }, [loadVendors]);

  const requestAction = (action: NonNullable<typeof pendingAction>) => {
    if (!selected || actionReason.trim().length < 10 || actionReason.trim().length > 500) return;
    setPendingAction(action);
  };

  const confirmAction = async () => {
    if (!selected || !pendingAction) return;
    const action = pendingAction;
    setActionLoading(true);
    try {
      const result = action === 'verify'
        ? await approveVendor(selected.id, actionReason.trim())
        : action === 'suspend'
          ? await suspendVendor(selected.id, actionReason.trim())
          : await restoreVendor(selected.id, actionReason.trim());
      if (result.error) toast.error(result.error);
      else {
        toast.success(action === 'verify' ? 'Business verified' : action === 'suspend' ? 'Business suspended' : 'Business restored');
        setSelected(null);
        setActionReason('');
        void loadVendors();
      }
    } catch {
      toast.error('Unable to complete this business action. Please retry.');
    } finally {
      setPendingAction(null);
      setActionLoading(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
            <Store className="h-6 w-6 text-primary" /> {canManageVendors ? 'Vendor Management' : 'Business Directory'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{total} businesses</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search businesses..." value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} />
        </div>
        <Select value={verifiedFilter} onValueChange={v => { setVerifiedFilter(v); setPage(0); }}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="verified">Verified</SelectItem>
            <SelectItem value="unverified">Unverified</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {search.trim().length > 0 && search.trim().length < 3 && <p className="text-xs text-muted-foreground">Enter at least 3 characters to search.</p>}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
          ) : loadError ? (
            <div role="alert" className="py-8 text-center space-y-3">
              <p className="text-sm text-destructive">{loadError}</p>
              <Button variant="outline" size="sm" onClick={() => void loadVendors()}>Retry</Button>
            </div>
          ) : vendors.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No businesses found</div>
          ) : (
            <>
            <div className="space-y-3 p-3 lg:hidden" aria-label="Mobile business directory">
              {vendors.map(v => <article key={v.id} className="rounded-xl border border-border bg-background p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="break-words font-semibold">{v.business_name}</h2><p className="mt-1 break-words text-sm text-muted-foreground">{v.business_type || 'Business type unavailable'}</p></div><div className="flex shrink-0 flex-col items-end gap-1">{v.is_verified ? <Badge className="bg-success/10 text-success">Verified</Badge> : <Badge variant="outline">Unverified</Badge>}{!v.is_active && <Badge className="bg-destructive/10 text-destructive">Suspended</Badge>}</div></div>
                <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-3 text-sm"><div className="min-w-0"><dt className="text-xs text-muted-foreground">Owner</dt><dd className="mt-0.5 break-words">{v.owner?.full_name || v.owner?.email || '—'}</dd></div><div><dt className="text-xs text-muted-foreground">Rating</dt><dd className="mt-0.5 font-medium">{v.rating_avg.toFixed(1)} ({v.rating_count})</dd></div></dl>
                <Button className="mt-4 min-h-11 w-full" variant="outline" onClick={() => { setActionReason(''); setSelected(v); }}>{canManageVendors ? 'Manage business' : 'View business'}</Button>
              </article>)}
            </div>
            <div className="hidden lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Business</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Rating</TableHead>
                    <TableHead>{canManageVendors ? 'Actions' : ''}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vendors.map(v => (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium">{v.business_name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{v.business_type || '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{v.owner?.full_name || v.owner?.email || '—'}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {v.is_verified ? <Badge className="bg-success/10 text-success">Verified</Badge> : <Badge variant="outline">Unverified</Badge>}
                        {!v.is_active && <Badge className="bg-destructive/10 text-destructive">Suspended</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{v.rating_avg.toFixed(1)} ({v.rating_count})</TableCell>
                    <TableCell><Button variant="ghost" size="sm" onClick={() => { setActionReason(''); setSelected(v); }}>{canManageVendors ? 'Manage' : 'View'}</Button></TableCell>
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

      <Dialog open={!!selected} onOpenChange={open => { if (!open) setSelected(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{isSuperAdmin ? 'Manage Business' : 'Business Details'}</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg border border-border p-3 space-y-1 text-sm">
                <p><span className="text-muted-foreground">Business:</span> {selected.business_name}</p>
                <p><span className="text-muted-foreground">Category:</span> {selected.business_type || '—'}</p>
                <p><span className="text-muted-foreground">Owner:</span> {selected.owner?.full_name || selected.owner?.email || '—'}{isSuperAdmin && selected.owner?.full_name && selected.owner.email ? ` (${selected.owner.email})` : ''}</p>
                <p><span className="text-muted-foreground">University:</span> {selected.university?.name || '—'}</p>
                <p><span className="text-muted-foreground">Student business:</span> {selected.is_student_business ? 'Yes' : 'No'}</p>
                <p><span className="text-muted-foreground">Delivery:</span> {selected.delivery_available ? 'Available' : 'Not available'}</p>
              </div>
              {canManageVendors && (
                <div className="space-y-2">
                  <label htmlFor="business-action-reason" className="text-xs font-medium">Reason for this administrative action</label>
                  <Textarea id="business-action-reason" value={actionReason} onChange={(event) => setActionReason(event.target.value)} maxLength={500} rows={3} placeholder="Enter at least 10 characters explaining the decision." />
                </div>
              )}
              {canManageVendors && <div className="flex gap-2">
                {!selected.is_verified && <Button className="flex-1" disabled={actionLoading || actionReason.trim().length < 10} onClick={() => requestAction('verify')}><Check className="mr-2 h-4 w-4" /> Verify</Button>}
                {selected.is_active ? (
                  <Button variant="destructive" className="flex-1" disabled={actionLoading || actionReason.trim().length < 10} onClick={() => requestAction('suspend')}><Ban className="mr-2 h-4 w-4" /> Suspend</Button>
                ) : (
                  <Button className="flex-1" disabled={actionLoading || actionReason.trim().length < 10} onClick={() => requestAction('restore')}><RotateCcw className="mr-2 h-4 w-4" /> Restore</Button>
                )}
              </div>}
            </div>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog open={pendingAction !== null} onOpenChange={open => { if (!open && !actionLoading) setPendingAction(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm business {pendingAction === 'verify' ? 'verification' : pendingAction === 'suspend' ? 'suspension' : 'restoration'}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction === 'verify'
                ? `Verify ${selected?.business_name || 'this business'}? This decision will be recorded with the reason you provided.`
                : `${pendingAction === 'suspend' ? 'Suspend' : 'Restore'} ${selected?.business_name || 'this business'}? Its marketplace availability may change. This decision will be audited.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={actionLoading} onClick={event => { event.preventDefault(); void confirmAction(); }}>
              {actionLoading ? 'Saving…' : pendingAction === 'verify' ? 'Confirm verification' : pendingAction === 'suspend' ? 'Confirm suspension' : 'Confirm restoration'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
