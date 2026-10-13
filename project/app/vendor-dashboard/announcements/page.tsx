'use client';

import { useState, useEffect, useCallback } from 'react';
import { VendorDashboardLayout, VendorRouteGuard } from '@/components/vendor/vendor-dashboard-layout';
import { useVendor } from '@/hooks/use-vendor';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import {
  getBusinessAnnouncements, createBusinessAnnouncement, deleteBusinessAnnouncement,
} from '@/lib/data/communication-client';
import type { BusinessAnnouncement } from '@/lib/types/communication';
import { ANNOUNCEMENT_TYPE_LABELS } from '@/lib/types/communication';
import { Megaphone, Plus, Trash2, Check, Clock, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function VendorAnnouncementsPage() {
  return (
    <VendorRouteGuard>
      <VendorAnnouncementsContent />
    </VendorRouteGuard>
  );
}

function VendorAnnouncementsContent() {
  const { vendor, loading } = useVendor();
  const [announcements, setAnnouncements] = useState<BusinessAnnouncement[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', body: '', announcement_type: 'general' });

  const loadData = useCallback(async () => {
    if (!vendor) return;
    setDataLoading(true);
    const data = await getBusinessAnnouncements(vendor.id);
    setAnnouncements(data);
    setDataLoading(false);
  }, [vendor]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleCreate = async () => {
    if (!form.title || !form.body || !vendor) { toast.error('Title and body are required'); return; }
    setSaving(true);
    const { error } = await createBusinessAnnouncement({
      vendor_id: vendor.id,
      title: form.title,
      body: form.body,
      announcement_type: form.announcement_type,
    });
    setSaving(false);
    if (error) { toast.error(error); }
    else {
      toast.success('Announcement created. It will be reviewed before going public.');
      setShowDialog(false);
      setForm({ title: '', body: '', announcement_type: 'general' });
      loadData();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this announcement?')) return;
    const { error } = await deleteBusinessAnnouncement(id);
    if (error) { toast.error(error); } else { toast.success('Announcement deleted'); loadData(); }
  };

  if (loading) {
    return (
      <VendorDashboardLayout vendorName="" isVerified={false} subscriptionStatus="none">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-6 h-96 rounded-xl" />
      </VendorDashboardLayout>
    );
  }

  return (
    <VendorDashboardLayout
      vendorName={vendor?.business_name || ''}
      isVerified={vendor?.is_verified || false}
      subscriptionStatus=""
    >
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Announcements</h1>
          <p className="mt-1 text-sm text-muted-foreground">Share updates with your customers.</p>
        </div>
        <Button onClick={() => setShowDialog(true)}><Plus className="mr-2 h-4 w-4" /> New announcement</Button>
      </div>

      <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
        <AlertCircle className="mr-1.5 inline h-3.5 w-3.5" />
        Announcements are reviewed by our moderation team before they appear publicly.
      </div>

      {dataLoading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      ) : announcements.length === 0 ? (
        <Card><CardContent className="py-12 text-center">
          <Megaphone className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-2 text-sm text-muted-foreground">No announcements yet</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {announcements.map((a) => (
            <Card key={a.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-foreground">{a.title}</p>
                      <Badge variant="outline">{ANNOUNCEMENT_TYPE_LABELS[a.announcement_type] || a.announcement_type}</Badge>
                      {a.is_approved ? (
                        <Badge className="bg-success/10 text-success"><Check className="mr-1 h-3 w-3" /> Approved</Badge>
                      ) : (
                        <Badge className="bg-warning/10 text-warning"><Clock className="mr-1 h-3 w-3" /> Pending review</Badge>
                      )}
                      {!a.is_active && <Badge variant="secondary">Inactive</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{a.body}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{new Date(a.created_at).toLocaleDateString('en-GH')}</p>
                  </div>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(a.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Announcement</DialogTitle>
            <DialogDescription>Share an update with customers who follow your business.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5"><Label>Title</Label><Input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Body</Label><Textarea rows={3} value={form.body} onChange={(e) => setForm((p) => ({ ...p, body: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Type</Label>
              <Select value={form.announcement_type} onValueChange={(v) => setForm((p) => ({ ...p, announcement_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="new_product">New Product</SelectItem>
                  <SelectItem value="holiday_hours">Holiday Hours</SelectItem>
                  <SelectItem value="temporary_closure">Temporary Closure</SelectItem>
                  <SelectItem value="special_promotion">Special Promotion</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button disabled={saving} onClick={handleCreate}>{saving ? 'Creating...' : 'Create announcement'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </VendorDashboardLayout>
  );
}
