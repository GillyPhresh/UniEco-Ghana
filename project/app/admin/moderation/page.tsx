'use client';

import { useState, useEffect } from 'react';
import { AdminRouteGuard, AdminLayout } from '@/components/admin/admin-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { getAdminReports, resolveReport } from '@/lib/data/admin-client';
import type { AdminReport } from '@/lib/types/admin';
import { Flag, Check } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminModerationPage() {
  return (
    <AdminRouteGuard><AdminLayout><Content /></AdminLayout></AdminRouteGuard>
  );
}

function Content() {
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState('open');
  const [selected, setSelected] = useState<AdminReport | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadReports(); }, [filter]);

  async function loadReports() {
    setLoading(true);
    const { reports, total } = await getAdminReports({ status: filter, limit: 30 });
    setReports(reports);
    setTotal(total);
    setLoading(false);
  }

  const handleResolve = async () => {
    if (!selected || !note.trim()) { toast.error('Please add a resolution note'); return; }
    setSaving(true);
    const { error } = await resolveReport(selected.id, note);
    if (error) { toast.error(error); } else { toast.success('Report resolved'); setSelected(null); setNote(''); loadReports(); }
    setSaving(false);
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-5xl">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
          <Flag className="h-6 w-6 text-primary" /> Moderation Center
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{total} reports</p>
      </div>

      <Tabs value={filter} onValueChange={setFilter}>
        <TabsList>
          <TabsTrigger value="open">Open</TabsTrigger>
          <TabsTrigger value="resolved">Resolved</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      ) : reports.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No reports found</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {reports.map(r => (
            <Card key={r.id} className="cursor-pointer hover:border-primary/30 transition-colors">
              <CardContent className="p-4" onClick={() => { setSelected(r); setNote(''); }}>
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{r.target_type || 'Unknown'}</Badge>
                      <Badge className={r.priority === 'urgent' ? 'bg-destructive/10 text-destructive' : r.priority === 'high' ? 'bg-warning/10 text-warning' : 'bg-muted text-muted-foreground'}>{r.priority || 'medium'}</Badge>
                      <Badge className={r.status === 'open' ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'}>{r.status}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-foreground">{r.reason || 'No reason provided'}</p>
                    <p className="text-xs text-muted-foreground">By {r.reporter?.full_name || r.reporter?.email || 'Unknown'} | {new Date(r.created_at).toLocaleDateString('en-GH')}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={open => { if (!open) setSelected(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Report Details</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg border border-border p-3 space-y-1 text-sm">
                <p><span className="text-muted-foreground">Target:</span> {selected.target_type} ({selected.target_id?.slice(0, 8) || '—'}...)</p>
                <p><span className="text-muted-foreground">Reporter:</span> {selected.reporter?.full_name || selected.reporter?.email || '—'}</p>
                <p><span className="text-muted-foreground">Reason:</span> {selected.reason || '—'}</p>
                <p><span className="text-muted-foreground">Priority:</span> {selected.priority || 'medium'}</p>
                <p><span className="text-muted-foreground">Status:</span> {selected.status}</p>
                {selected.resolution_note && <p><span className="text-muted-foreground">Resolution:</span> {selected.resolution_note}</p>}
              </div>
              {selected.status === 'open' && (
                <>
                  <Textarea rows={3} placeholder="Resolution note..." value={note} onChange={e => setNote(e.target.value)} />
                  <Button className="w-full" disabled={saving || !note.trim()} onClick={handleResolve}>
                    <Check className="mr-2 h-4 w-4" /> {saving ? 'Resolving...' : 'Resolve report'}
                  </Button>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
