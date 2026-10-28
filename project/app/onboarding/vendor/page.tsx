'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { supabase } from '@/lib/supabase/client';
import { createIdempotencyKey } from '@/lib/utils/idempotency';
import { clearRegistrationDraft, readRegistrationDraft, writeRegistrationDraft } from '@/lib/registration/draft';
import { isValidGhanaPhone, normalizeGhanaPhone } from '@/lib/registration/phone';
import { RouteGuard } from '@/lib/auth/route-guard';
import { AuthLayout } from '@/components/auth/auth-layout';
import { PushPermissionCard } from '@/components/notifications/push-permission-card';
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
  ArrowLeft,
  MapPin,
  ShieldCheck,
} from 'lucide-react';
import { isSupportedGoogleMapsUrl } from '@/lib/maps';
import { VendorLocationCapture } from '@/components/vendor/vendor-location-capture';
import type { VendorLocationValue } from '@/lib/types/location';

type FormData = z.infer<typeof vendorRegistrationSchema>;

const VENDOR_STEPS = [
  { label: 'Business', hint: 'What you offer', icon: Store },
  { label: 'Location', hint: 'Where to find you', icon: MapPin },
  { label: 'Finish', hint: 'Verify and pay', icon: ShieldCheck },
] as const;

const DRAFT_PREFIX = 'unieco_vendor_registration_draft';

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
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedDoc, setUploadedDoc] = useState(false);
  const [isStudent, setIsStudent] = useState(false);
  const [cashInviteToken, setCashInviteToken] = useState<string | null>(null);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [cashInviteLoading, setCashInviteLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'checkout' | 'mobile_money'>('checkout');
  const [mobileMoneyProvider, setMobileMoneyProvider] = useState<'mtn' | 'atl' | 'vod'>('mtn');
  const [pin, setPin] = useState<{ latitude: number | null; longitude: number | null }>({ latitude: null, longitude: null });
  const [mapsLink, setMapsLink] = useState('');
  const [locationSource, setLocationSource] = useState<'owner_address' | 'owner_pin' | 'google_maps_link'>('owner_address');
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
  const [locationCapturedAt, setLocationCapturedAt] = useState<string | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const paymentAttemptKeyRef = useRef<string | null>(null);
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
    if (user?.studentProfile) {
      setIsStudent(true);
      setForm((prev) => ({ ...prev, vendor_type: 'student_vendor' }));
    }
  }, [user]);

  useEffect(() => {
    if (!user?.id) return;
    const draft = readRegistrationDraft<{
      form: FormData;
      mapsLink: string;
      pin: typeof pin;
      locationSource: typeof locationSource;
      locationAccuracy: number | null;
      locationCapturedAt: string | null;
      paymentMethod: typeof paymentMethod;
      mobileMoneyProvider: typeof mobileMoneyProvider;
    }>(`${DRAFT_PREFIX}:${user.id}`);
    if (draft) {
      setForm(draft.data.form);
      setMapsLink(draft.data.mapsLink);
      setPin(draft.data.pin);
      setLocationSource(draft.data.locationSource);
      setLocationAccuracy(draft.data.locationAccuracy ?? null);
      setLocationCapturedAt(draft.data.locationCapturedAt ?? null);
      setPaymentMethod(draft.data.paymentMethod);
      setMobileMoneyProvider(draft.data.mobileMoneyProvider);
      setStep(Math.min(Math.max(draft.step, 0), VENDOR_STEPS.length - 1));
      setDraftRestored(true);
    }
    setDraftReady(true);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !draftReady) return;
    writeRegistrationDraft(`${DRAFT_PREFIX}:${user.id}`, step, {
      form,
      mapsLink,
      pin,
      locationSource,
      locationAccuracy,
      locationCapturedAt,
      paymentMethod,
      mobileMoneyProvider,
    });
  }, [draftReady, form, locationAccuracy, locationCapturedAt, locationSource, mapsLink, mobileMoneyProvider, paymentMethod, pin, step, user?.id]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const incomingReferral = params.get('ref') || window.sessionStorage.getItem('unieco_pending_referral_code');
    if (incomingReferral) setReferralCode(incomingReferral);
    const token = params.get('invite') || window.sessionStorage.getItem('unieco_pending_registration_invite');
    if (!token) return;
    setCashInviteLoading(true);
    supabase.rpc('get_registration_access_invite', { p_token: token }).then(({ data, error: inviteError }) => {
      const invite = data as { valid?: boolean; audience?: string; message?: string } | null;
      if (inviteError || !invite?.valid || invite.audience !== 'vendor') {
        setError(invite?.message || 'This cash registration link is invalid or expired. You can continue with standard payment.');
        setCashInviteToken(null);
      } else {
        setCashInviteToken(token);
      }
      setCashInviteLoading(false);
    });
  }, []);

  const updateForm = (key: keyof FormData, value: string) => {
    paymentAttemptKeyRef.current = null;
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleLocationChange = (value: VendorLocationValue) => {
    paymentAttemptKeyRef.current = null;
    setPin({ latitude: value.latitude, longitude: value.longitude });
    setMapsLink(value.mapsUrl);
    setLocationSource(value.source);
    setLocationAccuracy(value.accuracy);
    setLocationCapturedAt(value.capturedAt);
  };

  const validateStep = (): string | null => {
    if (step === 0) {
      if (!form.business_name.trim()) return 'Enter your business name.';
      if (!form.business_category) return 'Choose a business category.';
      if (form.description.trim().length < 20) return 'Tell students a little more about your business.';
      if (!form.product_service_type.trim()) return 'Describe what you sell or offer.';
    }
    if (step === 1) {
      if (!form.location_address.trim()) return 'Enter your business address.';
      if (!form.location_city.trim()) return 'Enter your city.';
      if (!form.location_region) return 'Select your region.';
      if (!isValidGhanaPhone(form.contact_phone)) return 'Enter a valid Ghana contact number, for example 0244 123 456.';
    }
    return null;
  };

  const handleNext = () => {
    const validationError = validateStep();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setStep((current) => Math.min(current + 1, VENDOR_STEPS.length - 1));
  };

  const handleBack = () => {
    setError(null);
    setStep((current) => Math.max(current - 1, 0));
  };

  const clearDraft = () => {
    if (user?.id) clearRegistrationDraft(`${DRAFT_PREFIX}:${user.id}`);
    setDraftRestored(false);
  };

  const handleSubmit = async () => {
    if (!user) return;
    setError(null);

    const normalizedForm = {
      ...form,
      business_name: form.business_name.trim(),
      business_category: form.business_category.trim(),
      description: form.description.trim(),
      location_address: form.location_address.trim(),
      location_city: form.location_city.trim(),
      location_region: form.location_region.trim(),
      product_service_type: form.product_service_type.trim(),
      contact_phone: normalizeGhanaPhone(form.contact_phone),
      contact_email: (form.contact_email || '').trim(),
    };
    const result = vendorRegistrationSchema.safeParse(normalizedForm);
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
      if (referralCode) {
        const { error: referralError } = await supabase.rpc('attach_my_vendor_referral_code', {
          p_referral_code: referralCode,
        });
        if (referralError) throw new Error(referralError.message);
      }
      // The database creates the application, role transition, and vendor
      // record. Payment activation remains webhook-authoritative.
      const { data: registration, error: registrationError } = await supabase.rpc('create_vendor_registration_application', {
        p_business_name: normalizedForm.business_name,
        p_business_category: normalizedForm.business_category,
        p_description: normalizedForm.description,
        p_location_address: normalizedForm.location_address,
        p_location_city: normalizedForm.location_city,
        p_location_region: normalizedForm.location_region,
        p_product_service_type: normalizedForm.product_service_type,
        p_contact_phone: normalizedForm.contact_phone,
        p_contact_email: normalizedForm.contact_email || null,
        p_vendor_type: normalizedForm.vendor_type,
      });
      if (registrationError) throw new Error(registrationError.message);
      const vendorId = (registration as { vendor_id?: string } | null)?.vendor_id;
      if (!vendorId) throw new Error('Vendor registration did not return a vendor reference.');
      const { error: locationError } = await supabase.rpc('set_my_vendor_location', {
        p_vendor_id: vendorId,
        p_latitude: pin.latitude,
        p_longitude: pin.longitude,
        p_address: normalizedForm.location_address,
        p_city: normalizedForm.location_city,
        p_region: normalizedForm.location_region,
        p_maps_url: mapsLink.trim() || null,
        p_selection_source: locationSource,
        p_public_visibility: 'business_location',
      });
      if (locationError) throw new Error(locationError.message);

      if (cashInviteToken) {
        const { error: cashError } = await supabase.rpc('redeem_cash_vendor_registration', {
          p_token: cashInviteToken,
          p_vendor_id: vendorId,
        });
        if (cashError) throw new Error(cashError.message);
        window.sessionStorage.removeItem('unieco_pending_registration_invite');
        window.sessionStorage.removeItem('unieco_pending_referral_code');
        clearDraft();
        await refreshProfile();
        router.push('/onboarding/complete?registration=cash');
        return;
      }

      const idempotencyKey = paymentAttemptKeyRef.current || createIdempotencyKey();
      paymentAttemptKeyRef.current = idempotencyKey;
      const paymentResponse = await fetch('/api/payments/paystack/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purpose: 'vendor_registration',
          vendorId,
          idempotencyKey,
          ...(paymentMethod === 'mobile_money' ? {
            mobileMoney: { phone: normalizedForm.contact_phone, provider: mobileMoneyProvider },
          } : {}),
        }),
      });
      const paymentResult = await paymentResponse.json() as { authorizationUrl?: string; reference?: string; mobileMoney?: { displayText?: string }; error?: string };
      if (!paymentResponse.ok || (!paymentResult.authorizationUrl && !paymentResult.mobileMoney?.displayText) || !paymentResult.reference) {
        throw new Error(paymentResult.error || 'Vendor registration payment could not be initialized.');
      }

      await refreshProfile();
      clearDraft();
      window.sessionStorage.removeItem('unieco_pending_referral_code');
      if (paymentResult.mobileMoney) {
        router.push(`/payments/callback?reference=${encodeURIComponent(paymentResult.reference)}&channel=mobile_money`);
      } else if (paymentResult.authorizationUrl) {
        window.location.assign(paymentResult.authorizationUrl);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('Choose a verification document smaller than 5 MB.');
      e.target.value = '';
      return;
    }
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      setError('Upload an image or PDF verification document.');
      e.target.value = '';
      return;
    }
    const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
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
          : 'About 3 minutes · your progress is saved on this device'
      }
      backHref="/signin"
      backLabel="Sign out"
    >
      <div className="space-y-6">
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-semibold text-foreground">Build trust from day one</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Your business is reviewed before it is published. Payment activates access; it does not bypass verification.</p>
            </div>
          </div>
        </div>

        {draftRestored && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-300/70 bg-emerald-50 p-3 text-sm text-emerald-950">
            <span><strong>Welcome back.</strong> Your unfinished business registration has been restored.</span>
            <button type="button" onClick={clearDraft} className="shrink-0 text-xs font-semibold underline underline-offset-2">Dismiss</button>
          </div>
        )}

        <div aria-label={`Registration step ${step + 1} of ${VENDOR_STEPS.length}`} className="flex items-start justify-between">
          {VENDOR_STEPS.map((item, index) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="flex flex-1 items-start">
                <div className="flex min-w-0 flex-col items-center">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-full border-2 ${index < step ? 'border-primary bg-primary text-primary-foreground' : index === step ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}>
                    {index < step ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                  </div>
                  <span className={`mt-1.5 text-xs font-medium ${index <= step ? 'text-foreground' : 'text-muted-foreground'}`}>{item.label}</span>
                  <span className="mt-0.5 hidden text-[10px] text-muted-foreground sm:block">{item.hint}</span>
                </div>
                {index < VENDOR_STEPS.length - 1 && <div className={`mx-2 mt-5 h-0.5 flex-1 rounded ${index < step ? 'bg-primary' : 'bg-border'}`} />}
              </div>
            );
          })}
        </div>

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

        {cashInviteToken ? (
          <div className="rounded-lg border border-emerald-300/70 bg-emerald-50 p-3 text-sm text-emerald-950">
            <p className="font-semibold">Cash registration approved</p>
            <p className="mt-1">This one-time link was issued by UniEco Ghana administration. You will not be sent to Paystack.</p>
          </div>
        ) : (
          <div className="rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-950">
            <p className="font-semibold">Registration payment required</p>
            <p className="mt-1">Complete the GH₵20 business registration payment after submitting these details. Your vendor access starts only after Paystack confirms the payment.</p>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-4">
          {step === 0 && (
            <>
          <div className="space-y-2">
            <Label htmlFor="business_name">Business name</Label>
            <div className="relative">
              <Store className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="business_name"
                placeholder="e.g. Campus Snack Hub"
                className="pl-9"
                maxLength={120}
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
              maxLength={120}
              onChange={(e) => updateForm('product_service_type', e.target.value)}
            />
          </div>

          <Button onClick={handleNext} className="w-full">
            Continue to location <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
            </>
          )}

          {step === 1 && (
            <>
          <div className="space-y-2">
            <Label htmlFor="location_address">Business address</Label>
            <Input
              id="location_address"
              placeholder="e.g. Hall 4, Room 12 or Main Market, Stall 5"
              maxLength={180}
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
                maxLength={80}
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

          <VendorLocationCapture
            value={{
              latitude: pin.latitude,
              longitude: pin.longitude,
              accuracy: locationAccuracy,
              capturedAt: locationCapturedAt,
              address: form.location_address,
              city: form.location_city,
              region: form.location_region,
              mapsUrl: mapsLink,
              source: locationSource,
            }}
            onChange={handleLocationChange}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="contact_phone">Contact phone</Label>
              <Input
                id="contact_phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                maxLength={15}
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
                autoComplete="email"
                maxLength={160}
                placeholder="business@example.com"
                value={form.contact_email}
                onChange={(e) => updateForm('contact_email', e.target.value)}
              />
            </div>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={handleBack} className="flex-1"><ArrowLeft className="mr-2 h-4 w-4" />Back</Button>
            <Button onClick={handleNext} className="flex-1">Continue to finish <ArrowRight className="ml-2 h-4 w-4" /></Button>
          </div>
            </>
          )}

          {step === 2 && (
            <>
          <div className="rounded-xl border border-border bg-muted/20 p-4">
            <p className="text-sm font-semibold text-foreground">Review your business details</p>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <div><dt className="text-muted-foreground">Business</dt><dd className="mt-0.5 break-words font-medium">{form.business_name || 'Not entered'}</dd></div>
              <div><dt className="text-muted-foreground">Category</dt><dd className="mt-0.5 break-words font-medium">{form.business_category || 'Not selected'}</dd></div>
              <div><dt className="text-muted-foreground">City</dt><dd className="mt-0.5 break-words font-medium">{form.location_city || 'Not entered'}</dd></div>
              <div><dt className="text-muted-foreground">Phone</dt><dd className="mt-0.5 break-words font-medium">{form.contact_phone || 'Not entered'}</dd></div>
            </dl>
            <button type="button" onClick={() => setStep(0)} className="mt-3 text-xs font-semibold text-primary underline underline-offset-2">Edit business details</button>
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

          {!cashInviteToken && <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-foreground">
            Registration fee: <strong>GH₵20.00</strong>. Choose Paystack checkout or send
            a direct Mobile Money prompt after submitting your business details. Your
            vendor access starts only after the payment is verified.
          </div>}
          {!cashInviteToken && <PushPermissionCard onboarding />}

          {!cashInviteToken && (
            <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
              <div>
                <p className="text-sm font-semibold text-foreground">Choose how to pay</p>
                <p className="mt-1 text-xs text-muted-foreground">Direct Mobile Money sends the prompt to the contact number above and avoids the hosted checkout screen.</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <button type="button" onClick={() => setPaymentMethod('checkout')} className={`rounded-lg border p-3 text-left text-sm ${paymentMethod === 'checkout' ? 'border-primary bg-primary/5' : 'border-border bg-background'}`}>
                  <span className="font-semibold">Paystack checkout</span>
                  <span className="mt-1 block text-xs text-muted-foreground">Card or Mobile Money</span>
                </button>
                <button type="button" onClick={() => setPaymentMethod('mobile_money')} className={`rounded-lg border p-3 text-left text-sm ${paymentMethod === 'mobile_money' ? 'border-primary bg-primary/5' : 'border-border bg-background'}`}>
                  <span className="font-semibold">Direct Mobile Money</span>
                  <span className="mt-1 block text-xs text-muted-foreground">Send a prompt to your phone</span>
                </button>
              </div>
              {paymentMethod === 'mobile_money' && (
                <Select value={mobileMoneyProvider} onValueChange={(value: 'mtn' | 'atl' | 'vod') => setMobileMoneyProvider(value)}>
                  <SelectTrigger aria-label="Mobile Money network"><SelectValue placeholder="Select Mobile Money network" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mtn">MTN Mobile Money</SelectItem>
                    <SelectItem value="vod">Telecel Cash</SelectItem>
                    <SelectItem value="atl">AirtelTigo Money</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          <Button onClick={handleSubmit} disabled={submitting || cashInviteLoading} className="w-full">
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {cashInviteToken ? 'Complete cash registration' : paymentMethod === 'mobile_money' ? 'Send Mobile Money prompt · GH₵20' : 'Pay GH₵20 and continue'}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={handleBack} disabled={submitting} className="w-full"><ArrowLeft className="mr-2 h-4 w-4" />Back to edit details</Button>
            </>
          )}
        </div>
      </div>
    </AuthLayout>
  );
}
