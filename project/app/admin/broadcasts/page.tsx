'use client';

import { useState, useEffect, useCallback } from 'react';
import { AdminRouteGuard, AdminLayout } from '@/components/admin/admin-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import {
  getAdminBroadcasts, createAdminBroadcast, approveAdminBroadcast, beginAdminBroadcastDelivery, cancelAdminBroadcast,
} from '@/lib/data/communication-client';
import type { AdminBroadcast, BroadcastStatus } from '@/lib/types/communication';
import { BROADCAST_STATUS_LABELS, CHANNEL_LABELS } from '@/lib/types/communication';
import { Megaphone, Plus, Send, Eye, Check, X, Clock } from 'lucide-react';
import { toast } from 'sonner';

const ALL_CHANNELS = ['in_app', 'email', 'push'] as const;
const AUDIENCES = [
  { value: 'all', label: 'All Users' },
  { value: 'students', label: 'Students' },
  { value: 'vendors', label: 'Vendors' },
  { value: 'specific_university', label: 'Specific University' },
  { value: 'specific_category', label: 'Specific Category' },
];

export default function BroadcastsPage() {
  return (
    <AdminRouteGuard><AdminLayout><Content /></AdminLayout></AdminRouteGuard>
  );
}

function Content() {
  const [loading, setLoading] = useState(true);
  const [broadcasts, setBroadcasts] = useState<AdminBroadcast[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState({
    title: '', body: '', broadcast_type: 'announcement',
    target_audience: 'all', channels: ['in_app'] as string[],
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await getAdminBroadcasts();
    setBroadcasts(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setForm({ title: '', body: '', broadcast_type: 'announcement', target_audience: 'all', channels: ['in_app'] });
    setShowDialog(true);
  };

  const toggleChannel = (ch: string) => {
    setForm((p) => ({
      ...p,
      channels: p.channels.includes(ch) ? p.channels.filter((c) => c !== ch) : [...p.channels, ch],
    }));
  };

  const handleCreate = async (status: string) => {
    if (!form.title || !form.body) { toast.error('Title and body are required'); return; }
    setSaving(true);
    const { error } = await createAdminBroadcast({
      title: form.title,
      body: form.body,
      broadcast_type: form.broadcast_type,
      target_audience: form.target_audience,
      channels: form.channels,
      submitForApproval: status === 'pending_approval',
    });
    setSaving(false);
    if (error) { toast.error(error); }
    else {
      toast.success(status === 'draft' ? 'Draft saved' : 'Broadcast submitted for approval');
      setShowDialog(false);
      load();
    }
  };

  const handleApprove = async (b: AdminBroadcast) => {
    const { error } = await approveAdminBroadcast(b.id);
    if (error) { toast.error(error); } else { toast.success('Broadcast approved'); load(); }
  };

  const handleSend = async (b: AdminBroadcast) => {
    const { error } = await beginAdminBroadcastDelivery(b.id);
    if (error) { toast.error(error); } else { toast.success('Broadcast queued for trusted delivery'); load(); }
  };

  const handleCancel = async (b: AdminBroadcast) => {
    const { error } = await cancelAdminBroadcast(b.id);
    if (error) { toast.error(error); } else { toast.success('Broadcast cancelled'); load(); }
  };

  const STATUS_ICONS: Record<BroadcastStatus, typeof Clock> = {
    draft: Clock, scheduled: Clock, pending_approval: Eye,
    approved: Check, sending: Send, sent: Check, cancelled: X,
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
            <Megaphone className="h-6 w-6 text-primary" /> Broadcasts
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{broadcasts.length} broadcasts</p>
        </div>
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> New broadcast</Button>
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      ) : broadcasts.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No broadcasts yet</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {broadcasts.map((b) => {
            const StatusIcon = STATUS_ICONS[b.status] || Clock;
            const statusInfo = BROADCAST_STATUS_LABELS[b.status] || { label: b.status, color: 'muted' };
            return (
              <Card key={b.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-foreground">{b.title}</p>
                        <Badge variant="outline" className="capitalize">{b.broadcast_type}</Badge>
                        <Badge className={
                          statusInfo.color === 'success' ? 'bg-success/10 text-success' :
                          statusInfo.color === 'warning' ? 'bg-warning/10 text-warning' :
                          statusInfo.color === 'error' ? 'bg-destructive/10 text-destructive' :
                          statusInfo.color === 'info' ? 'bg-info/10 text-info' :
                          'bg-muted text-muted-foreground'
                        }>
                          <StatusIcon className="mr-1 h-3 w-3" /> {statusInfo.label}
                        </Badge>
                        <Badge variant="outline">{b.target_audience.replace(/_/g, ' ')}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{b.body}</p>
                      <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                        <span>Channels: {b.channels.map((ch) => CHANNEL_LABELS[ch as keyof typeof CHANNEL_LABELS] || ch).join(', ')}</span>
                        {b.sent_count > 0 && <span>Delivered: {b.sent_count}</span>}
                        {b.failed_count > 0 && <span className="text-destructive">Failed: {b.failed_count}</span>}
                        <span>{new Date(b.created_at).toLocaleDateString('en-GH')}</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      {b.status === 'pending_approval' && (
                        <Button size="sm" variant="outline" onClick={() => handleApprove(b)}><Check className="mr-1 h-3 w-3" /> Approve</Button>
                      )}
                      {b.status === 'approved' && (
                        <Button size="sm" onClick={() => handleSend(b)}><Send className="mr-1 h-3 w-3" /> Send</Button>
                      )}
                      {(b.status === 'draft' || b.status === 'pending_approval') && (
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleCancel(b)}><X className="mr-1 h-3 w-3" /> Cancel</Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Broadcast</DialogTitle>
            <DialogDescription>Send an announcement to selected users across chosen channels.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5"><Label>Title</Label><Input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Body</Label><Textarea rows={3} value={form.body} onChange={(e) => setForm((p) => ({ ...p, body: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Type</Label>
                <Select value={form.broadcast_type} onValueChange={(v) => setForm((p) => ({ ...p, broadcast_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="announcement">Announcement</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                    <SelectItem value="update">Update</SelectItem>
                    <SelectItem value="event">Event</SelectItem>
                    <SelectItem value="promotion">Promotion</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Target Audience</Label>
                <Select value={form.target_audience} onValueChange={(v) => setForm((p) => ({ ...p, target_audience: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {AUDIENCES.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Channels</Label>
              <div className="flex gap-3">
                {ALL_CHANNELS.map((ch) => (
                  <label key={ch} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={form.channels.includes(ch)} onCheckedChange={() => toggleChannel(ch)} />
                    {CHANNEL_LABELS[ch]}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button variant="outline" disabled={saving} onClick={() => handleCreate('draft')}>Save as draft</Button>
            <Button disabled={saving} onClick={() => handleCreate('pending_approval')}>
              <Send className="mr-1.5 h-4 w-4" /> Submit for approval
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
