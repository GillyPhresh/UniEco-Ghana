'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { supabase } from '@/lib/supabase/client';
import { RouteGuard } from '@/lib/auth/route-guard';
import { AuthLayout } from '@/components/auth/auth-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  businessCategories,
  regions,
  vendorRegistrationSchema,
} from '@/lib/validation';
import type { z } from 'zod';
import {
  Store,
  Loader2,
  AlertCircle,
  ArrowRight,
  Upload,
  Check,
  Info,
} from 'lucide-react';
import { isSupportedGoogleMapsUrl, parseGoogleMapsLinkCoordinates } from '@/lib/maps';

type FormData = z.infer<typeof vendorRegistrationSchema>;

export default function VendorOnboardingPage() {
  return (
    <RouteGuard requireAuth>
      <VendorOnboarding />
    </RouteGuard>
  );
}

function VendorOnboarding() {
  const { user, refreshProfile } = useAuth();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedDoc, setUploadedDoc] = useState(false);
  const [universities, setUniversities] = useState<{ id: string; name: string }[]>([]);
  const [isStudent, setIsStudent] = useState(false);
  const [pin, setPin] = useState<{ latitude: number | null; longitude: number | null }>({ latitude: null, longitude: null });
  const [mapsLink, setMapsLink] = useState('');
  const [locationSource, setLocationSource] = useState<'owner_address' | 'owner_pin' | 'google_maps_link'>('owner_address');
  const [form, setForm] = useState<FormData>({
    business_name: '',
    business_category: '',
    description: '',
    location_address: '',
    location_city: '',
    location_region: '',
    product_service_type: '',
    contact_phone: '',
    contact_email: '',
    vendor_type: 'external_vendor',
  });

  useEffect(() => {
    supabase
      .from('universities')
      .select('id, name')
      .eq('is_enabled', true)
      .order('name')
      .then(({ data }) => setUniversities(data || []));

    if (user?.studentProfile) {
      setIsStudent(true);
      setForm((prev) => ({ ...prev, vendor_type: 'student_vendor' }));
    }
  }, [user]);

  const updateForm = (key: keyof FormData, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleMapsLinkChange = (value: string) => {
    setMapsLink(value);
    const coordinates = parseGoogleMapsLinkCoordinates(value);
    if (coordinates) {
      setPin(coordinates);
      setLocationSource('google_maps_link');
    }
  };

  const handleSubmit = async () => {
    if (!user) return;
    setError(null);

    const result = vendorRegistrationSchema.safeParse(form);
    if (!result.success) {
      setError(result.error.errors[0]?.message || 'Check all required fields');
      return;
    }
    if (mapsLink.trim() && !isSupportedGoogleMapsUrl(mapsLink)) {
      setError('Enter a valid Google Maps link, or leave it blank and provide the business address.');
      return;
    }

    setSubmitting(true);
    try {
      // The database creates the application, role transition, vendor record,
      // and explicit no-upfront-fee registration state atomically. The browser
      // cannot activate a vendor or create a financial record.
      const { data: registration, error: registrationError } = await supabase.rpc('create_vendor_registration_application', {
        p_business_name: form.business_name,
        p_business_category: form.business_category,
        p_description: form.description,
        p_location_address: form.location_address,
        p_location_city: form.location_city,
        p_location_region: form.location_region,
        p_product_service_type: form.product_service_type,
        p_contact_phone: form.contact_phone,
        p_contact_email: form.contact_email || null,
        p_vendor_type: form.vendor_type,
      });
      if (registrationError) throw new Error(registrationError.message);
      const vendorId = (registration as { vendor_id?: string } | null)?.vendor_id;
      if (!vendorId) throw new Error('Vendor registration did not return a vendor reference.');
      const { error: locationError } = await supabase.rpc('set_my_vendor_location', {
        p_vendor_id: vendorId,
        p_latitude: pin.latitude,
        p_longitude: pin.longitude,
        p_address: form.location_address,
        p_city: form.location_city,
        p_region: form.location_region,
        p_maps_url: mapsLink.trim() || null,
        p_selection_source: locationSource,
        p_public_visibility: 'business_location',
      });
      if (locationError) throw new Error(locationError.message);

      await refreshProfile();
      router.push('/onboarding/complete');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const ext = file.name.split('.').pop();
    const path = `${user.id}/vendor-verification-${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from('vendor-documents')
      .upload(path, file);
    if (error) {
      setError('Could not upload the document. Try again.');
      return;
    }
    setUploadedDoc(true);
  };

  return (
    <AuthLayout
      title="Register your business"
      subtitle={
        isStudent
          ? 'Turn your student hustle into a verified campus business'
          : 'Set up your business profile to reach students on campus'
      }
      backHref="/signin"
      backLabel="Sign out"
    >
      <div className="space-y-6">
        {isStudent && (
          <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span className="text-foreground">
              Since you are a verified student, your business will be registered as a
              <strong> Student Business</strong>. You will get a &ldquo;Verified Student
              Business&rdquo; badge after approval.
            </span>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="business_name">Business name</Label>
            <div className="relative">
              <Store className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="business_name"
                placeholder="e.g. Campus Snack Hub"
                className="pl-9"
                value={form.business_name}
                onChange={(e) => updateForm('business_name', e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="business_category">Business category</Label>
            <Select
              value={form.business_category}
              onValueChange={(v) => updateForm('business_category', v)}
            >
              <SelectTrigger id="business_category">
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {businessCategories.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Business description</Label>
            <Textarea
              id="description"
              placeholder="Tell students what your business is about..."
              rows={3}
              maxLength={500}
              value={form.description}
              onChange={(e) => updateForm('description', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {form.description.length}/500 characters
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="product_service_type">What do you sell or offer?</Label>
            <Input
              id="product_service_type"
              placeholder="e.g. Pastries, printing services, tutorials"
              value={form.product_service_type}
              onChange={(e) => updateForm('product_service_type', e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="location_address">Business address</Label>
            <Input
              id="location_address"
              placeholder="e.g. Hall 4, Room 12 or Main Market, Stall 5"
              value={form.location_address}
              onChange={(e) => updateForm('location_address', e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="location_city">City</Label>
              <Input
                id="location_city"
                placeholder="e.g. Sunyani"
                value={form.location_city}
                onChange={(e) => updateForm('location_city', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location_region">Region</Label>
              <Select
                value={form.location_region}
                onValueChange={(v) => updateForm('location_region', v)}
              >
                <SelectTrigger id="location_region">
                  <SelectValue placeholder="Select region" />
                </SelectTrigger>
                <SelectContent>
                  {regions.map((region) => (
                    <SelectItem key={region} value={region}>
                      {region}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
            <div>
              <Label>Confirm the business location</Label>
              <p className="mt-1 text-xs text-muted-foreground">Enter the actual address and, where available, coordinates or a Google Maps link. UniEco reviews the submission before publishing it.</p>
            </div>
            <Input aria-label="Google Maps location link" placeholder="Optional Google Maps link" value={mapsLink} onChange={(event) => handleMapsLinkChange(event.target.value)} />
            <p className="text-xs text-muted-foreground">Use Share → Copy link in Google Maps. Some short links do not contain coordinates; the link will still be sent for review.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input aria-label="Latitude" type="number" step="any" placeholder="Latitude (optional)" value={pin.latitude ?? ''} onChange={(event) => { setLocationSource('owner_pin'); setPin((current) => ({ ...current, latitude: event.target.value ? Number(event.target.value) : null })); }} />
              <Input aria-label="Longitude" type="number" step="any" placeholder="Longitude (optional)" value={pin.longitude ?? ''} onChange={(event) => { setLocationSource('owner_pin'); setPin((current) => ({ ...current, longitude: event.target.value ? Number(event.target.value) : null })); }} />
            </div>
            <p className="text-xs text-muted-foreground">{pin.latitude != null && pin.longitude != null ? `${pin.latitude.toFixed(6)}, ${pin.longitude.toFixed(6)} will be submitted for review.` : 'No coordinates supplied; the address will remain unconfirmed until reviewed.'}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="contact_phone">Contact phone</Label>
              <Input
                id="contact_phone"
                placeholder="e.g. 0244 123 456"
                value={form.contact_phone}
                onChange={(e) => updateForm('contact_phone', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact_email">Contact email (optional)</Label>
              <Input
                id="contact_email"
                type="email"
                placeholder="business@example.com"
                value={form.contact_email}
                onChange={(e) => updateForm('contact_email', e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Verification document (optional)</Label>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary">
              {uploadedDoc ? (
                <>
                  <Check className="h-4 w-4 text-success" /> Document uploaded
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" /> Upload business registration or ID
                </>
              )}
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={handleDocUpload}
                className="hidden"
              />
            </label>
            <p className="text-xs text-muted-foreground">
              A business registration document or ID helps speed up your approval
            </p>
          </div>

          <Button onClick={handleSubmit} disabled={submitting} className="w-full">
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit for approval
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </AuthLayout>
  );
}
