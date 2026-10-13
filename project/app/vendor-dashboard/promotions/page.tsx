'use client';

import { useState, useEffect } from 'react';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { VendorDashboardLayout, VendorRouteGuard } from '@/components/vendor/vendor-dashboard-layout';
import { useVendor } from '@/hooks/use-vendor';
import { getAdRequests, createAdRequest, deleteAdRequest, uploadVendorImage } from '@/lib/data/vendor-client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AD_TYPE_LABELS, AD_TYPE_DESCRIPTIONS, AD_TYPE_PRICING, AD_STATUS_LABELS,
} from '@/lib/types/vendor';
import type { AdRequest, AdType } from '@/lib/types/vendor';
import {
  Megaphone, Plus, Trash2, Loader2, Image as ImageIcon, Upload, Info,
} from 'lucide-react';
import { toast } from 'sonner';

export default function PromotionsPage() {
  return (
    <VendorRouteGuard>
      <SiteHeader />
      <PromotionsContent />
      <SiteFooter />
    </VendorRouteGuard>
  );
}

function PromotionsContent() {
  const { vendor, loading } = useVendor();
  const [adRequests, setAdRequests] = useState<AdRequest[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    ad_type: 'featured_business' as AdType,
    title: '',
    description: '',
    image_url: '',
    target_url: '',
    duration: 7,
  });

  useEffect(() => {
    if (!vendor) return;
    loadAdRequests();
  }, [vendor]);

  async function loadAdRequests() {
    if (!vendor) return;
    setDataLoading(true);
    const data = await getAdRequests(vendor.id);
    setAdRequests(data);
    setDataLoading(false);
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !vendor) return;
    setUploading(true);
    const { url, error } = await uploadVendorImage(vendor.id, file, 'vendor-assets', 'ads');
    if (error) { toast.error('Upload failed: ' + error); }
    else if (url) { setForm(p => ({ ...p, image_url: url })); toast.success('Image uploaded'); }
    setUploading(false);
  };

  const handleSubmit = async () => {
    if (!vendor || !form.title) { toast.error('Please enter a title'); return; }
    const pricing = AD_TYPE_PRICING[form.ad_type];
    if (form.duration < pricing.minDays) { toast.error(`Minimum duration for this ad type is ${pricing.minDays} days`); return; }

    setSaving(true);
    const estimatedCost = pricing.daily * form.duration;
    const estimatedReach = `${form.duration * 200}-${form.duration * 500} students`;

    const { error } = await createAdRequest({
      vendor_id: vendor.id,
      ad_type: form.ad_type,
      title: form.title,
      description: form.description || undefined,
      image_url: form.image_url || undefined,
      target_url: form.target_url || undefined,
      requested_duration_days: form.duration,
      estimated_reach: estimatedReach,
      estimated_cost: estimatedCost,
    });

    if (error) { toast.error(error); }
    else {
      toast.success('Promotion request submitted! Our team will review it within 24 hours.');
      setShowDialog(false);
      setForm({ ad_type: 'featured_business', title: '', description: '', image_url: '', target_url: '', duration: 7 });
      loadAdRequests();
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Cancel this promotion request?')) return;
    const { error } = await deleteAdRequest(id);
    if (error) { toast.error(error); }
    else { toast.success('Request cancelled'); loadAdRequests(); }
  };

  const selectedPricing = AD_TYPE_PRICING[form.ad_type];
  const estimatedCost = selectedPricing.daily * form.duration;

  if (loading) {
    return (
      <VendorDashboardLayout vendorName="" isVerified={false} subscriptionStatus="none">
        <Skeleton className="h-8 w-48" />
        <div className="mt-6 space-y-4">
          {[1, 2].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
      </VendorDashboardLayout>
    );
  }

  return (
    <VendorDashboardLayout
      vendorName={vendor?.business_name || ''}
      isVerified={vendor?.is_verified || false}
      subscriptionStatus=""
    >
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Promotions</h1>
          <p className="mt-1 text-sm text-muted-foreground">Request promotions to reach more students.</p>
        </div>
        <Button onClick={() => setShowDialog(true)}>
          <Plus className="mr-2 h-4 w-4" /> Request Promotion
        </Button>
      </div>

      {/* Ad types info */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(Object.keys(AD_TYPE_LABELS) as AdType[]).map(type => (
          <Card key={type}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Megaphone className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold text-foreground">{AD_TYPE_LABELS[type]}</p>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">{AD_TYPE_DESCRIPTIONS[type]}</p>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">GH₵{AD_TYPE_PRICING[type].daily}/day</span>
                <span className="text-xs text-muted-foreground">Min {AD_TYPE_PRICING[type].minDays} days</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* My requests */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">My Promotion Requests</h2>
        {dataLoading ? (
          <div className="space-y-3">
            {[1, 2].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}
          </div>
        ) : adRequests.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Megaphone className="h-12 w-12 text-muted-foreground/40" />
              <p className="mt-3 text-sm font-medium text-foreground">No promotion requests yet</p>
              <p className="mt-1 text-xs text-muted-foreground">Request a promotion to boost your visibility.</p>
              <Button className="mt-4" onClick={() => setShowDialog(true)}>
                <Plus className="mr-2 h-4 w-4" /> Request Promotion
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {adRequests.map(req => {
              const statusInfo = AD_STATUS_LABELS[req.status];
              return (
                <Card key={req.id}>
                  <CardContent className="flex items-start gap-3 p-4">
                    {req.image_url ? (
                      <img src={req.image_url} alt={req.title} className="h-16 w-16 rounded-lg object-cover" />
                    ) : (
                      <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-primary/10">
                        <Megaphone className="h-6 w-6 text-primary" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-foreground truncate">{req.title}</p>
                        <Badge className={`text-xs ${
                          statusInfo.color === 'success' ? 'bg-success/10 text-success' :
                          statusInfo.color === 'error' ? 'bg-destructive/10 text-destructive' :
                          statusInfo.color === 'warning' ? 'bg-warning/10 text-warning' :
                          'bg-muted text-muted-foreground'
                        }`}>
                          {statusInfo.label}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{AD_TYPE_LABELS[req.ad_type]}</p>
                      <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-muted-foreground">
                        <span>{req.requested_duration_days} days</span>
                        <span>GH₵{req.estimated_cost}</span>
                        {req.estimated_reach && <span>~{req.estimated_reach}</span>}
                        <span>{new Date(req.created_at).toLocaleDateString('en-GH', { month: 'short', day: 'numeric' })}</span>
                      </div>
                      {req.admin_note && (
                        <p className="mt-2 text-xs italic text-muted-foreground">Admin: {req.admin_note}</p>
                      )}
                    </div>
                    {req.status === 'pending' && (
                      <Button size="icon" variant="ghost" className="text-destructive" onClick={() => handleDelete(req.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Request dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Request a Promotion</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Promotion Type</Label>
              <Select value={form.ad_type} onValueChange={v => setForm(p => ({ ...p, ad_type: v as AdType }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(AD_TYPE_LABELS) as AdType[]).map(type => (
                    <SelectItem key={type} value={type}>{AD_TYPE_LABELS[type]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{AD_TYPE_DESCRIPTIONS[form.ad_type]}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ad_title">Promotion Title</Label>
              <Input id="ad_title" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. 20% off all pastries this week!" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ad_desc">Description (optional)</Label>
              <Textarea id="ad_desc" rows={2} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Add more details about your promotion..." />
            </div>

            <div>
              <Label className="mb-2 block">Promotion Image (optional)</Label>
              <div className="flex items-center gap-4">
                <div className="h-20 w-20 overflow-hidden rounded-lg border border-border bg-muted">
                  {form.image_url ? (
                    <img src={form.image_url} alt="Ad" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground/40">
                      <ImageIcon className="h-6 w-6" />
                    </div>
                  )}
                </div>
                <label className="cursor-pointer">
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted">
                    {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    {uploading ? 'Uploading...' : 'Upload image'}
                  </span>
                </label>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ad_duration">Duration (days)</Label>
              <Input id="ad_duration" type="number" min={selectedPricing.minDays} value={form.duration} onChange={e => setForm(p => ({ ...p, duration: Number(e.target.value) }))} />
              <p className="text-xs text-muted-foreground">Minimum {selectedPricing.minDays} days for this promotion type</p>
            </div>

            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Estimated cost</span>
                <span className="text-lg font-bold text-foreground">GH₵{estimatedCost}</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Rate: GH₵{selectedPricing.daily}/day × {form.duration} days</span>
              </div>
              <div className="mt-2 flex items-start gap-1.5">
                <Info className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                <p className="text-xs text-muted-foreground">Final pricing is confirmed after admin approval. You will receive an invoice once approved.</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={saving || !form.title}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Megaphone className="mr-2 h-4 w-4" />}
              {saving ? 'Submitting...' : 'Submit Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </VendorDashboardLayout>
  );
}
