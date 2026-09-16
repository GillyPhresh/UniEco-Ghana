'use client';

import { useState, useEffect } from 'react';
import { AdminRouteGuard, AdminLayout } from '@/components/admin/admin-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { getAdminSubscriptions, extendSubscription, exportToCsv } from '@/lib/data/admin-client';
import type { AdminSubscription } from '@/lib/types/admin';
import { CreditCard, Download, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminSubscriptionsPage() {
  return (
    <AdminRouteGuard><AdminLayout><Content /></AdminLayout></AdminRouteGuard>
  );
}

function Content() {
  const [loading, setLoading] = useState(true);
  const [subs, setSubs] = useState<AdminSubscription[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState('all');
  const [extending, setExtending] = useState<AdminSubscription | null>(null);
  const [days, setDays] = useState(30);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const pageSize = 20;

  useEffect(() => { loadSubs(); }, [page, filter]);

  async function loadSubs() {
    setLoading(true);
    const { subscriptions, total } = await getAdminSubscriptions({ status: filter, limit: pageSize, offset: page * pageSize });
    setSubs(subscriptions);
    setTotal(total);
    setLoading(false);
  }

  const handleExtend = async () => {
    if (!extending) return;
    setSaving(true);
    const { error } = await extendSubscription(extending.id, days, note);
    if (error) { toast.error(error); } else { toast.success('Subscription extended'); setExtending(null); setNote(''); loadSubs(); }
    setSaving(false);
  };

  const handleExport = () => {
    exportToCsv(subs.map(s => ({
      id: s.id, vendor: s.vendor?.business_name || '', plan: s.plan, status: s.status,
      started: s.started_at, ends: s.ends_at || '', amount: s.amount, currency: s.currency,
    })), 'subscriptions');
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
            <CreditCard className="h-6 w-6 text-primary" /> Subscriptions
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{total} subscriptions</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExport}><Download className="mr-2 h-4 w-4" /> Export</Button>
      </div>

      <Tabs value={filter} onValueChange={v => { setFilter(v); setPage(0); }}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="expired">Expired</TabsTrigger>
          <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
          ) : subs.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No subscriptions found</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Ends</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subs.map(s => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.vendor?.business_name || '—'}</TableCell>
                    <TableCell><Badge variant="outline" className="capitalize">{s.plan}</Badge></TableCell>
                    <TableCell>
                      <Badge className={s.status === 'active' ? 'bg-success/10 text-success' : s.status === 'expired' ? 'bg-warning/10 text-warning' : 'bg-destructive/10 text-destructive'}>
                        {s.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(s.started_at).toLocaleDateString('en-GH')}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{s.ends_at ? new Date(s.ends_at).toLocaleDateString('en-GH') : '—'}</TableCell>
                    <TableCell className="text-sm">{s.amount ? `GH₵${s.amount}` : '—'}</TableCell>
                    <TableCell><Button variant="ghost" size="sm" onClick={() => setExtending(s)}>Extend</Button></TableCell>
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

      <Dialog open={!!extending} onOpenChange={open => { if (!open) setExtending(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Extend Subscription</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">Vendor: {extending?.vendor?.business_name}</p>
            <div className="space-y-1.5"><Label>Days to extend</Label><Input type="number" value={days} onChange={e => setDays(Number(e.target.value))} min={1} /></div>
            <div className="space-y-1.5"><Label>Note</Label><Input value={note} onChange={e => setNote(e.target.value)} placeholder="Reason for extension..." /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExtending(null)}>Cancel</Button>
            <Button disabled={saving} onClick={handleExtend}><Calendar className="mr-2 h-4 w-4" /> {saving ? 'Extending...' : `Extend by ${days} days`}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
