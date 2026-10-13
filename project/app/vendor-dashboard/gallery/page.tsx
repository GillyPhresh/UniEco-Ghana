'use client';

import { useState, useEffect } from 'react';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { VendorDashboardLayout, VendorRouteGuard } from '@/components/vendor/vendor-dashboard-layout';
import { useVendor } from '@/hooks/use-vendor';
import {
  getGalleryImages, addGalleryImage, deleteGalleryImage, updateGalleryImage, uploadVendorImage,
} from '@/lib/data/vendor-client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { BusinessGalleryItem } from '@/lib/types/vendor';
import {
  Image as ImageIcon, Plus, Trash2, Edit2, Loader2, Upload, X,
} from 'lucide-react';
import { toast } from 'sonner';

const IMAGE_TYPES = [
  { value: 'storefront', label: 'Storefront' },
  { value: 'banner', label: 'Promotional Banner' },
  { value: 'product_highlight', label: 'Product Highlight' },
  { value: 'general', label: 'General' },
];

export default function GalleryPage() {
  return (
    <VendorRouteGuard>
      <SiteHeader />
      <GalleryContent />
      <SiteFooter />
    </VendorRouteGuard>
  );
}

function GalleryContent() {
  const { vendor, loading } = useVendor();
  const [images, setImages] = useState<BusinessGalleryItem[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<BusinessGalleryItem | null>(null);
  const [form, setForm] = useState({ image_url: '', caption: '', image_type: 'general' });

  useEffect(() => {
    if (!vendor) return;
    loadGallery();
  }, [vendor]);

  async function loadGallery() {
    if (!vendor) return;
    setDataLoading(true);
    const data = await getGalleryImages(vendor.id);
    setImages(data);
    setDataLoading(false);
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !vendor) return;
    setUploading(true);
    const { url, error } = await uploadVendorImage(vendor.id, file, 'vendor-assets', 'gallery');
    if (error) { toast.error('Upload failed: ' + error); }
    else if (url) { setForm(prev => ({ ...prev, image_url: url })); toast.success('Image uploaded — add caption and save'); }
    setUploading(false);
  };

  const handleAddImage = async () => {
    if (!vendor || !form.image_url) { toast.error('Please upload an image first'); return; }
    const { error } = await addGalleryImage(vendor.id, {
      image_url: form.image_url,
      caption: form.caption || undefined,
      image_type: form.image_type,
    });
    if (error) { toast.error(error); }
    else {
      toast.success('Image added to gallery');
      setForm({ image_url: '', caption: '', image_type: 'general' });
      setShowUploadDialog(false);
      loadGallery();
    }
  };

  const handleUpdateImage = async () => {
    if (!editingItem) return;
    const { error } = await updateGalleryImage(editingItem.id, {
      caption: form.caption || undefined,
      image_type: form.image_type as 'storefront' | 'banner' | 'product_highlight' | 'general',
    });
    if (error) { toast.error(error); }
    else { toast.success('Gallery image updated'); setEditingItem(null); loadGallery(); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this image from your gallery?')) return;
    const { error } = await deleteGalleryImage(id);
    if (error) { toast.error(error); } else { toast.success('Image removed'); loadGallery(); }
  };

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
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Gallery</h1>
          <p className="mt-1 text-sm text-muted-foreground">Showcase your storefront, products, and promotions.</p>
        </div>
        <Button onClick={() => { setForm({ image_url: '', caption: '', image_type: 'general' }); setShowUploadDialog(true); }}>
          <Plus className="mr-2 h-4 w-4" /> Add Image
        </Button>
      </div>

      {dataLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-48 rounded-xl" />)}
        </div>
      ) : images.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <ImageIcon className="h-12 w-12 text-muted-foreground/40" />
            <p className="mt-3 text-sm font-medium text-foreground">No gallery images yet</p>
            <p className="mt-1 text-xs text-muted-foreground">Add photos of your storefront, products, or promotional banners.</p>
            <Button className="mt-4" onClick={() => setShowUploadDialog(true)}>
              <Plus className="mr-2 h-4 w-4" /> Add Image
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {images.map(item => (
            <Card key={item.id} className="group overflow-hidden">
              <div className="relative h-44 overflow-hidden bg-muted">
                <img src={item.image_url} alt={item.caption || 'Gallery image'} className="h-full w-full object-cover" />
                <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button size="icon" variant="secondary" className="h-8 w-8" onClick={() => {
                    setEditingItem(item);
                    setForm({ image_url: item.image_url, caption: item.caption || '', image_type: item.image_type });
                  }}>
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="destructive" className="h-8 w-8" onClick={() => handleDelete(item.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <Badge className="absolute left-2 top-2 bg-background/90 text-xs capitalize">
                  {item.image_type.replace('_', ' ')}
                </Badge>
              </div>
              {item.caption && (
                <CardContent className="p-3">
                  <p className="truncate text-xs text-muted-foreground">{item.caption}</p>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Upload dialog */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Gallery Image</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label className="mb-2 block">Image</Label>
              {form.image_url ? (
                <div className="relative">
                  <img src={form.image_url} alt="Preview" className="h-40 w-full rounded-lg object-cover" />
                  <Button size="icon" variant="secondary" className="absolute right-2 top-2 h-7 w-7" onClick={() => setForm(p => ({ ...p, image_url: '' }))}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary">
                  {uploading ? <><Loader2 className="h-4 w-4 animate-spin" /> Uploading...</> : <><Upload className="h-4 w-4" /> Click to upload</>}
                  <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                </label>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="g_caption">Caption (optional)</Label>
              <Input id="g_caption" value={form.caption} onChange={e => setForm(p => ({ ...p, caption: e.target.value }))} placeholder="e.g. Our new storefront" />
            </div>
            <div className="space-y-2">
              <Label>Image Type</Label>
              <Select value={form.image_type} onValueChange={v => setForm(p => ({ ...p, image_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {IMAGE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUploadDialog(false)}>Cancel</Button>
            <Button onClick={handleAddImage} disabled={!form.image_url}>Add to Gallery</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editingItem} onOpenChange={(open) => { if (!open) setEditingItem(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Gallery Image</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <img src={form.image_url} alt="Preview" className="h-40 w-full rounded-lg object-cover" />
            <div className="space-y-2">
              <Label htmlFor="e_caption">Caption</Label>
              <Input id="e_caption" value={form.caption} onChange={e => setForm(p => ({ ...p, caption: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Image Type</Label>
              <Select value={form.image_type} onValueChange={v => setForm(p => ({ ...p, image_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {IMAGE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingItem(null)}>Cancel</Button>
            <Button onClick={handleUpdateImage}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </VendorDashboardLayout>
  );
}
