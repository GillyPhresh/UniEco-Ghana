'use client';

import { useState, useEffect } from 'react';
import { AdminRouteGuard, AdminLayout } from '@/components/admin/admin-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getAdminBusinesses, suspendVendor, restoreVendor, approveVendor, exportToCsv } from '@/lib/data/admin-client';
import type { AdminVendor } from '@/lib/types/admin';
import { Search, Store, Ban, RotateCcw, Check, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminBusinessesPage() {
  return (
    <AdminRouteGuard><AdminLayout><Content /></AdminLayout></AdminRouteGuard>
  );
}

function Content() {
  const [loading, setLoading] = useState(true);
  const [vendors, setVendors] = useState<AdminVendor[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [verifiedFilter, setVerifiedFilter] = useState('all');
  const [selected, setSelected] = useState<AdminVendor | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const pageSize = 20;

  useEffect(() => { loadVendors(); }, [page, verifiedFilter]);

  async function loadVendors() {
    setLoading(true);
    const { vendors, total } = await getAdminBusinesses({
      search: search || undefined,
      verified: verifiedFilter === 'verified' ? true : verifiedFilter === 'unverified' ? false : undefined,
      limit: pageSize, offset: page * pageSize,
    });
    setVendors(vendors);
    setTotal(total);
    setLoading(false);
  }

  const handleSuspend = async () => {
    if (!selected) return;
    setActionLoading(true);
    const { error } = await suspendVendor(selected.id, 'Suspended by admin');
    if (error) { toast.error(error); } else { toast.success('Business suspended'); setSelected(null); loadVendors(); }
    setActionLoading(false);
  };

  const handleRestore = async () => {
    if (!selected) return;
    setActionLoading(true);
    const { error } = await restoreVendor(selected.id);
    if (error) { toast.error(error); } else { toast.success('Business restored'); setSelected(null); loadVendors(); }
    setActionLoading(false);
  };

  const handleVerify = async () => {
    if (!selected) return;
    setActionLoading(true);
    const { error } = await approveVendor(selected.id);
    if (error) { toast.error(error); } else { toast.success('Business verified'); setSelected(null); loadVendors(); }
    setActionLoading(false);
  };

  const handleExport = () => {
    exportToCsv(vendors.map(v => ({
      id: v.id, name: v.business_name, category: v.business_type || '',
      verified: v.is_verified, active: v.is_active, owner: v.owner?.full_name || '',
      email: v.owner?.email || '', rating: v.rating_avg, reviews: v.rating_count,
    })), 'businesses');
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
            <Store className="h-6 w-6 text-primary" /> Business Management
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{total} businesses</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExport}><Download className="mr-2 h-4 w-4" /> Export</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search businesses..." value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { setPage(0); loadVendors(); } }} />
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

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
          ) : vendors.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No businesses found</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Business</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead></TableHead>
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
                    <TableCell><Button variant="ghost" size="sm" onClick={() => setSelected(v)}>Manage</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
          <DialogHeader><DialogTitle>Manage Business</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg border border-border p-3 space-y-1 text-sm">
                <p><span className="text-muted-foreground">Business:</span> {selected.business_name}</p>
                <p><span className="text-muted-foreground">Category:</span> {selected.business_type || '—'}</p>
                <p><span className="text-muted-foreground">Owner:</span> {selected.owner?.full_name || '—'} ({selected.owner?.email})</p>
                <p><span className="text-muted-foreground">University:</span> {selected.university?.name || '—'}</p>
                <p><span className="text-muted-foreground">Student business:</span> {selected.is_student_business ? 'Yes' : 'No'}</p>
                <p><span className="text-muted-foreground">Delivery:</span> {selected.delivery_available ? 'Available' : 'Not available'}</p>
              </div>
              <div className="flex gap-2">
                {!selected.is_verified && <Button className="flex-1" disabled={actionLoading} onClick={handleVerify}><Check className="mr-2 h-4 w-4" /> Verify</Button>}
                {selected.is_active ? (
                  <Button variant="destructive" className="flex-1" disabled={actionLoading} onClick={handleSuspend}><Ban className="mr-2 h-4 w-4" /> Suspend</Button>
                ) : (
                  <Button className="flex-1" disabled={actionLoading} onClick={handleRestore}><RotateCcw className="mr-2 h-4 w-4" /> Restore</Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
