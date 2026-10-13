'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth/auth-context';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { VendorDashboardLayout, VendorRouteGuard } from '@/components/vendor/vendor-dashboard-layout';
import { useVendor } from '@/hooks/use-vendor';
import { updateVendorProfile, calculateVendorProfileCompletion, uploadVendorImage } from '@/lib/data/vendor-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ALL_CATEGORIES } from '@/lib/constants/categories';
import { regions } from '@/lib/validation';
import { Store, Upload, Save, Loader2, Check, Globe, Phone, MapPin } from 'lucide-react';
import { toast } from 'sonner';

export default function VendorProfilePage() {
  return (
    <VendorRouteGuard>
      <SiteHeader />
      <VendorProfileContent />
      <SiteFooter />
    </VendorRouteGuard>
  );
}

function VendorProfileContent() {
  const { vendor, loading, reload } = useVendor();
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [form, setForm] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (vendor) {
      setForm({
        business_name: vendor.business_name,
        business_type: vendor.business_type || '',
        description: vendor.description || '',
        contact_phone: vendor.contact_phone || '',
        contact_email: vendor.contact_email || '',
        website_url: vendor.website_url || '',
        whatsapp_number: vendor.whatsapp_number || '',
        delivery_available: vendor.delivery_available,
        service_radius_km: vendor.service_radius_km || '',
        social_links: vendor.social_links || {},
        is_temporarily_closed: vendor.is_temporarily_closed,
      });
    }
  }, [vendor]);

  if (loading) {
    return (
      <VendorDashboardLayout vendorName="" isVerified={false} subscriptionStatus="none">
        <Skeleton className="h-8 w-48" />
        <div className="mt-6 space-y-4">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      </VendorDashboardLayout>
    );
  }

  if (!vendor) {
    return (
      <VendorDashboardLayout vendorName="" isVerified={false} subscriptionStatus="none">
        <Card>
          <CardContent className="py-12 text-center">
            <Store className="mx-auto h-12 w-12 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">No business found.</p>
          </CardContent>
        </Card>
      </VendorDashboardLayout>
    );
  }

  const completion = calculateVendorProfileCompletion(vendor);

  const update = (key: string, value: unknown) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const updateSocial = (platform: string, value: string) => {
    setForm(prev => ({
      ...prev,
      social_links: { ...(prev.social_links as Record<string, string>), [platform]: value },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    const { error } = await updateVendorProfile(vendor.id, {
      business_name: form.business_name as string,
      business_type: form.business_type as string,
      description: form.description as string,
      contact_phone: form.contact_phone as string,
      contact_email: form.contact_email as string,
      website_url: form.website_url as string,
      whatsapp_number: form.whatsapp_number as string,
      delivery_available: form.delivery_available as boolean,
      service_radius_km: form.service_radius_km ? Number(form.service_radius_km) : null,
      social_links: form.social_links as Record<string, string>,
      is_temporarily_closed: form.is_temporarily_closed as boolean,
    });

    if (error) {
      toast.error('Could not save changes: ' + error);
    } else {
      toast.success('Business profile updated successfully');
      reload();
    }
    setSaving(false);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'logo' | 'cover') => {
    const file = e.target.files?.[0];
    if (!file || !vendor) return;

    if (type === 'logo') setUploadingLogo(true);
    else setUploadingCover(true);

    const { url, error } = await uploadVendorImage(vendor.id, file, 'vendor-assets', type);
    if (error) {
      toast.error('Upload failed: ' + error);
    } else if (url) {
      const { error: updateError } = await updateVendorProfile(vendor.id, {
        [type === 'logo' ? 'logo_url' : 'cover_image_url']: url,
      });
      if (updateError) {
        toast.error('Could not save image: ' + updateError);
      } else {
        toast.success(`${type === 'logo' ? 'Logo' : 'Cover image'} updated`);
        reload();
      }
    }

    if (type === 'logo') setUploadingLogo(false);
    else setUploadingCover(false);
  };

  return (
    <VendorDashboardLayout
      vendorName={vendor.business_name}
      isVerified={vendor.is_verified}
      subscriptionStatus=""
    >
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Business Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage your business information and branding.</p>
      </div>

      {/* Profile completion */}
      <Card className="mb-6 border-primary/20 bg-primary/5">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Profile {completion}% complete</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {completion < 50 ? 'Add more details to attract more customers.' : completion < 100 ? 'Almost there — fill in the remaining fields.' : 'Your profile is complete!'}
              </p>
            </div>
            <div className="h-2 w-32 overflow-hidden rounded-full bg-primary/15">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${completion}%` }} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Images */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Branding</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Cover image */}
          <div>
            <Label className="mb-2 block">Cover Image</Label>
            <div className="relative h-40 overflow-hidden rounded-lg border border-border bg-muted sm:h-56">
              {vendor.cover_image_url ? (
                <img src={vendor.cover_image_url} alt="Cover" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <Globe className="h-8 w-8" />
                </div>
              )}
              <label className="absolute bottom-3 right-3 cursor-pointer">
                <input type="file" accept="image/*" className="hidden" onChange={e => handleImageUpload(e, 'cover')} />
                <span className="inline-flex items-center gap-1.5 rounded-md bg-background/90 px-3 py-1.5 text-xs font-medium shadow-sm backdrop-blur">
                  {uploadingCover ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  {uploadingCover ? 'Uploading...' : 'Change cover'}
                </span>
              </label>
            </div>
          </div>

          {/* Logo */}
          <div>
            <Label className="mb-2 block">Business Logo</Label>
            <div className="flex items-center gap-4">
              <div className="h-20 w-20 overflow-hidden rounded-lg border border-border bg-muted">
                {vendor.logo_url ? (
                  <img src={vendor.logo_url} alt="Logo" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    <Store className="h-6 w-6" />
                  </div>
                )}
              </div>
              <label className="cursor-pointer">
                <input type="file" accept="image/*" className="hidden" onChange={e => handleImageUpload(e, 'logo')} />
                <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted">
                  {uploadingLogo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  {uploadingLogo ? 'Uploading...' : 'Upload logo'}
                </span>
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Business information */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Business Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="business_name">Business Name</Label>
            <Input id="business_name" value={form.business_name as string || ''} onChange={e => update('business_name', e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="business_type">Category</Label>
            <Select value={form.business_type as string || ''} onValueChange={v => update('business_type', v)}>
              <SelectTrigger id="business_type"><SelectValue placeholder="Select a category" /></SelectTrigger>
              <SelectContent>
                {ALL_CATEGORIES.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" rows={4} maxLength={500} value={form.description as string || ''} onChange={e => update('description', e.target.value)} placeholder="Tell students what your business is about..." />
            <p className="text-xs text-muted-foreground">{(form.description as string || '').length}/500 characters</p>
          </div>
        </CardContent>
      </Card>

      {/* Contact details */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Contact Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="contact_phone">Phone Number</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" id="contact_phone" value={form.contact_phone as string || ''} onChange={e => update('contact_phone', e.target.value)} placeholder="0244 123 456" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="whatsapp_number">WhatsApp Number</Label>
              <Input id="whatsapp_number" value={form.whatsapp_number as string || ''} onChange={e => update('whatsapp_number', e.target.value)} placeholder="0244 123 456" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="contact_email">Email</Label>
              <Input id="contact_email" type="email" value={form.contact_email as string || ''} onChange={e => update('contact_email', e.target.value)} placeholder="business@example.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="website_url">Website</Label>
              <Input id="website_url" value={form.website_url as string || ''} onChange={e => update('website_url', e.target.value)} placeholder="https://yourbusiness.com" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Social media */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Social Media</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {['facebook', 'instagram', 'twitter', 'tiktok', 'linkedin'].map(platform => (
            <div key={platform} className="space-y-2">
              <Label className="capitalize" htmlFor={`social_${platform}`}>{platform}</Label>
              <Input id={`social_${platform}`} value={(form.social_links as Record<string, string>)?.[platform] || ''} onChange={e => updateSocial(platform, e.target.value)} placeholder={`https://${platform}.com/yourbusiness`} />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Delivery & location */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Delivery & Location</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-border p-4">
            <div>
              <p className="text-sm font-medium text-foreground">Delivery Available</p>
              <p className="text-xs text-muted-foreground">Let students know you can deliver to them</p>
            </div>
            <Switch checked={form.delivery_available as boolean || false} onCheckedChange={v => update('delivery_available', v)} />
          </div>

          {Boolean(form.delivery_available) && (
            <div className="space-y-2">
              <Label htmlFor="service_radius_km">Delivery Radius (km)</Label>
              <Input id="service_radius_km" type="number" value={form.service_radius_km as string || ''} onChange={e => update('service_radius_km', e.target.value)} placeholder="e.g. 5" />
            </div>
          )}

          <div className="flex items-center justify-between rounded-lg border border-border p-4">
            <div>
              <p className="text-sm font-medium text-foreground">Temporarily Closed</p>
              <p className="text-xs text-muted-foreground">Pause your business without deleting anything</p>
            </div>
            <Switch checked={form.is_temporarily_closed as boolean || false} onCheckedChange={v => update('is_temporarily_closed', v)} />
          </div>
        </CardContent>
      </Card>

      {/* Save button */}
      <div className="sticky bottom-4 flex justify-end">
        <Button onClick={handleSave} disabled={saving} size="lg" className="shadow-lg">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </VendorDashboardLayout>
  );
}
