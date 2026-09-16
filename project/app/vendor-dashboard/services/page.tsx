'use client';

import { useState, useEffect } from 'react';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { VendorDashboardLayout, VendorRouteGuard } from '@/components/vendor/vendor-dashboard-layout';
import { useVendor } from '@/hooks/use-vendor';
import {
  getVendorServices, createService, updateService, archiveService,
  restoreService, deleteService, uploadVendorImage,
} from '@/lib/data/vendor-client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import type { Service } from '@/lib/types';
import {
  Wrench, Plus, Edit2, Archive, Trash2, RotateCcw, Save, Loader2,
  Search, Image as ImageIcon, Clock,
} from 'lucide-react';
import { toast } from 'sonner';

export default function ServicesPage() {
  return (
    <VendorRouteGuard>
      <SiteHeader />
      <ServicesContent />
      <SiteFooter />
    </VendorRouteGuard>
  );
}

function ServicesContent() {
  const { vendor, loading } = useVendor();
  const [services, setServices] = useState<(Service & { business: { id: string; name: string; slug: string } })[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);

  useEffect(() => {
    if (!vendor) return;
    loadServices();
  }, [vendor, showArchived]);

  async function loadServices() {
    if (!vendor) return;
    setDataLoading(true);
    const data = await getVendorServices(vendor.id, showArchived);
    setServices(data);
    setDataLoading(false);
  }

  const filtered = services.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.description || '').toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <VendorDashboardLayout vendorName="" isVerified={false} subscriptionStatus="none">
        <Skeleton className="h-8 w-48" />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-48 rounded-xl" />)}
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
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Services</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage your service offerings.</p>
        </div>
        <Button onClick={() => setShowAddDialog(true)}>
          <Plus className="mr-2 h-4 w-4" /> Add Service
        </Button>
      </div>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search services..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Show archived</span>
          <Switch checked={showArchived} onCheckedChange={setShowArchived} />
        </div>
      </div>

      {dataLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-52 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Wrench className="h-12 w-12 text-muted-foreground/40" />
            <p className="mt-3 text-sm font-medium text-foreground">
              {showArchived ? 'No archived services' : 'No services yet'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {showArchived ? 'Archived services will appear here.' : 'Add a service like haircut, repair, or design.'}
            </p>
            {!showArchived && (
              <Button className="mt-4" onClick={() => setShowAddDialog(true)}>
                <Plus className="mr-2 h-4 w-4" /> Add Service
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(service => (
            <ServiceCard
              key={service.id}
              service={service}
              onEdit={() => setEditingService(service)}
              onArchive={async () => {
                const { error } = await archiveService(service.id);
                if (error) { toast.error(error); } else { toast.success('Service archived'); loadServices(); }
              }}
              onRestore={async () => {
                const { error } = await restoreService(service.id);
                if (error) { toast.error(error); } else { toast.success('Service restored'); loadServices(); }
              }}
              onDelete={async () => {
                if (!confirm('Permanently delete this service? This cannot be undone.')) return;
                const { error } = await deleteService(service.id);
                if (error) { toast.error(error); } else { toast.success('Service deleted'); loadServices(); }
              }}
            />
          ))}
        </div>
      )}

      <ServiceFormDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        vendorId={vendor?.id || ''}
        businessId={services[0]?.business?.id || ''}
        onSaved={() => { loadServices(); setShowAddDialog(false); }}
      />

      {editingService && (
        <ServiceFormDialog
          open={!!editingService}
          onOpenChange={(open) => { if (!open) setEditingService(null); }}
          vendorId={vendor?.id || ''}
          businessId={editingService.business_id}
          service={editingService}
          onSaved={() => { loadServices(); setEditingService(null); }}
        />
      )}
    </VendorDashboardLayout>
  );
}

function ServiceCard({ service, onEdit, onArchive, onRestore, onDelete }: {
  service: Service;
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const image = service.image_url || (service.images && service.images[0]) || null;

  return (
    <Card className="group overflow-hidden">
      <div className="relative h-36 overflow-hidden bg-muted">
        {image ? (
          <img src={image} alt={service.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground/40">
            <Wrench className="h-8 w-8" />
          </div>
        )}
        {service.is_archived && (
          <Badge className="absolute left-2 top-2 bg-muted text-muted-foreground text-xs">Archived</Badge>
        )}
      </div>
      <CardContent className="p-4">
        <p className="truncate text-sm font-semibold text-foreground">{service.name}</p>
        <p className="mt-1 text-sm font-medium text-primary">GH₵{service.price}</p>
        {service.duration_estimate && (
          <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" /> {service.duration_estimate}
          </div>
        )}
        <div className="mt-2">
          <Badge className={`text-xs ${service.is_active ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>
            {service.is_active ? 'Available' : 'Unavailable'}
          </Badge>
        </div>
        <div className="mt-3 flex items-center gap-1">
          {!service.is_archived ? (
            <>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onEdit}>
                <Edit2 className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onArchive}>
                <Archive className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : (
            <>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onRestore}>
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={onDelete}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ServiceFormDialog({ open, onOpenChange, vendorId, businessId, service, onSaved }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendorId: string;
  businessId: string;
  service?: Service | null;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    name: '', description: '', price: '', duration_estimate: '', image_url: '', is_active: true,
  });

  useEffect(() => {
    if (service) {
      setForm({
        name: service.name,
        description: service.description || '',
        price: String(service.price),
        duration_estimate: service.duration_estimate || '',
        image_url: service.image_url || (service.images && service.images[0]) || '',
        is_active: service.is_active,
      });
    } else {
      setForm({ name: '', description: '', price: '', duration_estimate: '', image_url: '', is_active: true });
    }
  }, [service]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !vendorId) return;
    setUploading(true);
    const { url, error } = await uploadVendorImage(vendorId, file, 'vendor-assets', 'services');
    if (error) { toast.error('Upload failed: ' + error); }
    else if (url) { setForm(prev => ({ ...prev, image_url: url })); toast.success('Image uploaded'); }
    setUploading(false);
  };

  const handleSave = async () => {
    if (!form.name || !form.price) { toast.error('Name and price are required'); return; }
    setSaving(true);

    const images = form.image_url ? [form.image_url] : [];

    if (service) {
      const { error } = await updateService(service.id, {
        name: form.name,
        description: form.description || null,
        price: Number(form.price),
        duration_estimate: form.duration_estimate || null,
        images,
        image_url: form.image_url || null,
        is_active: form.is_active,
      });
      if (error) { toast.error(error); } else { toast.success('Service updated'); onSaved(); }
    } else {
      if (!businessId) { toast.error('No business found.'); setSaving(false); return; }
      const { error } = await createService({
        business_id: businessId,
        name: form.name,
        description: form.description || undefined,
        price: Number(form.price),
        duration_estimate: form.duration_estimate || undefined,
        images,
        image_url: form.image_url || null,
        is_active: form.is_active,
      });
      if (error) { toast.error(error); } else { toast.success('Service added'); onSaved(); }
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{service ? 'Edit Service' : 'Add Service'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div>
            <Label className="mb-2 block">Service Image</Label>
            <div className="flex items-center gap-4">
              <div className="h-20 w-20 overflow-hidden rounded-lg border border-border bg-muted">
                {form.image_url ? (
                  <img src={form.image_url} alt="Service" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground/40">
                    <ImageIcon className="h-6 w-6" />
                  </div>
                )}
              </div>
              <label className="cursor-pointer">
                <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted">
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  {uploading ? 'Uploading...' : 'Upload image'}
                </span>
              </label>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="s_name">Service Name</Label>
            <Input id="s_name" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Laptop Repair" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="s_desc">Description</Label>
            <Textarea id="s_desc" rows={3} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Describe your service..." />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="s_price">Price (GH₵)</Label>
              <Input id="s_price" type="number" value={form.price} onChange={e => setForm(p => ({ ...p, price: e.target.value }))} placeholder="0.00" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="s_duration">Duration (optional)</Label>
              <Input id="s_duration" value={form.duration_estimate} onChange={e => setForm(p => ({ ...p, duration_estimate: e.target.value }))} placeholder="e.g. 30 minutes" />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <Label htmlFor="s_active">Available</Label>
            <Switch checked={form.is_active} onCheckedChange={v => setForm(p => ({ ...p, is_active: v }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
