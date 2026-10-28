'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/lib/auth/auth-context';
import { supabase } from '@/lib/supabase/client';
import { clearRegistrationDraft, readRegistrationDraft, writeRegistrationDraft } from '@/lib/registration/draft';
import { isValidGhanaPhone, normalizeGhanaPhone } from '@/lib/registration/phone';
import { startPaystackCheckout } from '@/lib/data/payment-client';
import { studentOnboardingSchema } from '@/lib/validation';
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
  User,
  GraduationCap,
  ShieldCheck,
  Check,
  Loader2,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Upload,
  Search,
} from 'lucide-react';

const STEPS = [
  { id: 'contact', label: 'Contact', hint: 'Phone and photo', icon: User },
  { id: 'study', label: 'Study', hint: 'Campus and programme', icon: GraduationCap },
  { id: 'finish', label: 'Finish', hint: 'ID and review', icon: ShieldCheck },
] as const;

const DRAFT_PREFIX = 'unieco_student_registration_draft';

interface FormData {
  phone: string;
  avatar_url: string;
  university_id: string;
  programme: string;
  faculty: string;
  department: string;
  level: string;
  index_number: string;
  admission_year: number;
  graduation_year?: number;
  student_id_document_url: string;
}

export default function StudentOnboardingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user?.role === 'external_vendor') {
      router.replace('/onboarding/vendor');
    }
  }, [loading, router, user?.role]);

  if (user?.role === 'external_vendor') return null;

  return (
    <RouteGuard requireAuth>
      <StudentOnboarding />
    </RouteGuard>
  );
}

function StudentOnboarding() {
  const { user } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cashInviteToken, setCashInviteToken] = useState<string | null>(null);
  const [cashInviteLoading, setCashInviteLoading] = useState(false);
  const [universities, setUniversities] = useState<{ id: string; name: string; short_name: string; city: string | null; region: string | null; institution_type: string | null; campus_launch_status: string }[]>([]);
  const [universitySearch, setUniversitySearch] = useState('');
  const [unisLoaded, setUnisLoaded] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [form, setForm] = useState<FormData>({
    phone: '',
    avatar_url: '',
    university_id: '',
    programme: '',
    faculty: '',
    department: '',
    level: '',
    index_number: '',
    admission_year: new Date().getFullYear(),
    graduation_year: undefined,
    student_id_document_url: '',
  });

  useEffect(() => {
    if (!user?.id) return;
    const draft = readRegistrationDraft<FormData>(`${DRAFT_PREFIX}:${user.id}`);
    if (draft) {
      setForm(draft.data);
      setStep(Math.min(Math.max(draft.step, 0), STEPS.length - 1));
      setDraftRestored(true);
    }
    setDraftReady(true);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !draftReady) return;
    writeRegistrationDraft(`${DRAFT_PREFIX}:${user.id}`, step, form);
  }, [draftReady, form, step, user?.id]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('invite') || window.sessionStorage.getItem('unieco_pending_registration_invite');
    if (!token) return;
    setCashInviteLoading(true);
    supabase.rpc('get_registration_access_invite', { p_token: token }).then(({ data, error: inviteError }) => {
      const invite = data as { valid?: boolean; audience?: string; message?: string } | null;
      if (inviteError || !invite?.valid || invite.audience !== 'student') {
        setError(invite?.message || 'This registration link is invalid or expired. You can continue without a payment.');
        setCashInviteToken(null);
      } else {
        setCashInviteToken(token);
      }
      setCashInviteLoading(false);
    });
  }, []);

  useEffect(() => {
    let active = true;
    supabase
      .from('universities')
      .select('id, name, short_name, city, region, institution_type, campus_launch_status')
      .eq('is_enabled', true)
      .order('name')
      .then(({ data }) => {
        if (!active) return;
        setUniversities(data || []);
        setUnisLoaded(true);
      })
      .then(undefined, () => {
        if (active) setUnisLoaded(true);
      });

    return () => { active = false; };
  }, []);

  const updateForm = (key: keyof FormData, value: string | number | undefined) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const visibleUniversities = universities.filter((university) => {
    const query = universitySearch.trim().toLocaleLowerCase();
    if (!query) return true;
    return [university.name, university.short_name, university.city, university.region, university.institution_type]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase()
      .includes(query);
  });
  const selectedUniversity = universities.find((university) => university.id === form.university_id);

  const validateStep = (): string | null => {
    if (step === 0) {
      if (!isValidGhanaPhone(form.phone)) return 'Enter a valid Ghana phone number, for example 0244 123 456';
    }
    if (step === 1) {
      if (!form.university_id) return 'Select your university';
      if (!form.programme) return 'Enter your programme';
      if (!form.faculty) return 'Enter your faculty';
      if (!form.department) return 'Enter your department';
      if (!form.level) return 'Select your level';
      if (!form.index_number || form.index_number.trim().length < 3) return 'Enter your index/student number';
    }
    return null;
  };

  const handleNext = () => {
    const err = validateStep();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const clearDraft = () => {
    if (user?.id) clearRegistrationDraft(`${DRAFT_PREFIX}:${user.id}`);
    setDraftRestored(false);
  };

  const handleBack = () => {
    setError(null);
    setStep((s) => Math.max(s - 1, 0));
  };

  const handleSubmit = async () => {
    if (!user) return;
    setError(null);
    setSubmitting(true);

    try {
      const parsed = studentOnboardingSchema.safeParse({
        university_id: form.university_id,
        programme: form.programme.trim(),
        faculty: form.faculty.trim(),
        department: form.department.trim(),
        level: form.level,
        index_number: form.index_number.trim(),
        admission_year: form.admission_year,
        graduation_year: form.graduation_year,
        phone: normalizeGhanaPhone(form.phone),
      });
      if (!parsed.success) throw new Error(parsed.error.errors[0]?.message || 'Check your registration details.');
      const referralCode = new URLSearchParams(window.location.search).get('ref') || window.sessionStorage.getItem('unieco_pending_referral_code');
      if (cashInviteToken) {
        const { error: cashError } = await supabase.rpc('redeem_cash_student_registration', {
          p_token: cashInviteToken,
          p_university_id: form.university_id,
          p_phone: form.phone,
          p_student_id_number: form.index_number,
          p_program: form.programme,
          p_faculty: form.faculty,
          p_department: form.department,
          p_level: form.level,
          p_admission_year: form.admission_year,
          p_graduation_year: form.graduation_year || null,
          p_student_document_path: form.student_id_document_url || null,
        });
        if (cashError) throw new Error(cashError.message);
        window.sessionStorage.removeItem('unieco_pending_registration_invite');
        window.sessionStorage.removeItem('unieco_pending_referral_code');
        clearDraft();
        router.push('/onboarding/complete?registration=cash');
        return;
      }
      const payment = await startPaystackCheckout({
        purpose: 'student_registration',
        idempotencyKey: `student-registration-${crypto.randomUUID()}`,
        registration: {
          universityId: form.university_id,
          phone: normalizeGhanaPhone(form.phone) || form.phone,
          studentIdNumber: form.index_number.trim(),
          program: form.programme.trim(),
          faculty: form.faculty.trim(),
          department: form.department.trim(),
          level: form.level,
          admissionYear: form.admission_year,
          graduationYear: form.graduation_year || null,
          studentDocumentPath: form.student_id_document_url || null,
          referralCode: referralCode || null,
        },
      });
      if (payment.error || !payment.authorizationUrl || !payment.reference) {
        throw new Error(payment.error || 'Registration payment could not be started. Please try again.');
      }
      if (form.avatar_url) {
        const { error: avatarError } = await supabase.from('profiles').update({ avatar_url: form.avatar_url }).eq('id', user.id);
        if (avatarError) throw new Error('Your payment setup is ready, but the profile photo could not be saved. You can add it later from your profile.');
      }
      window.sessionStorage.setItem('unieco_registration_payment_reference', payment.reference);
      window.location.assign(payment.authorizationUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleFileUpload = async (file: File, key: keyof FormData) => {
    if (!user) return;
    const ext = file.name.split('.').pop();
    const path = `${user.id}/${key}-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from('student-documents')
      .upload(path, file);

    if (uploadError) {
      setError('Could not upload the file. Try again.');
      return;
    }

    // This bucket is private. Persist its object path, never a public URL;
    // a future authorized download flow must mint a short-lived signed URL.
    updateForm(key, path);
  };

  return (
    <AuthLayout
      title="Complete your student profile"
      subtitle="About 2 minutes · your progress is saved on this device"
      backHref="/signin"
      backLabel="Sign out"
    >
      <div className="space-y-6">
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">Your registration is protected</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Your details are saved securely while Paystack confirms the one-time registration payment. Student verification is reviewed separately after payment.
              </p>
            </div>
          </div>
        </div>

        {draftRestored && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-300/70 bg-emerald-50 p-3 text-sm text-emerald-950">
            <span><strong>Welcome back.</strong> Your unfinished registration has been restored.</span>
            <button type="button" onClick={clearDraft} className="shrink-0 text-xs font-semibold underline underline-offset-2">Dismiss</button>
          </div>
        )}

        {/* Progress indicator */}
        <div aria-label={`Registration step ${step + 1} of ${STEPS.length}`} className="flex items-start justify-between">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex flex-1 items-center">
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all ${
                    i < step
                      ? 'border-primary bg-primary text-primary-foreground'
                      : i === step
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground'
                  }`}
                >
                  {i < step ? <Check className="h-5 w-5" /> : <s.icon className="h-5 w-5" />}
                </div>
                <span
                  className={`mt-1.5 text-xs font-medium ${
                    i <= step ? 'text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {s.label}
                </span>
                <span className="mt-0.5 hidden text-[10px] text-muted-foreground sm:block">{s.hint}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`mx-2 h-0.5 flex-1 rounded transition-colors ${
                    i < step ? 'bg-primary' : 'bg-border'
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {cashInviteToken && !error && (
          <div className="rounded-lg border border-emerald-300/70 bg-emerald-50 p-3 text-sm text-emerald-950">
            <p className="font-semibold">Cash registration approved</p>
            <p className="mt-1">This one-time link was issued by UniEco Ghana administration. You will not be sent to Paystack.</p>
          </div>
        )}

        <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.div
              key="personal"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="phone">Phone number</Label>
                <Input
                  id="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  maxLength={15}
                  placeholder="e.g. 0244 123 456"
                  value={form.phone}
                  onChange={(e) => updateForm('phone', e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Use the number you will use for Mobile Money. It is also used for order updates and important notifications.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="avatar">Profile photo (optional)</Label>
                <FileUploadButton
                  bucket="avatars"
                  onUpload={(url) => updateForm('avatar_url', url)}
                  userId={user?.id}
                  accept="image/*"
                  label="Upload a profile photo"
                />
                {form.avatar_url && (
                  <div className="flex items-center gap-2 text-xs text-success">
                    <Check className="h-3.5 w-3.5" /> Photo uploaded
                  </div>
                )}
              </div>

              <Button onClick={handleNext} className="w-full">
                Continue
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </motion.div>
          )}

          {step === 1 && (
            <motion.div
              key="university"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="university">University</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="university-search"
                    value={universitySearch}
                    onChange={(event) => setUniversitySearch(event.target.value)}
                    placeholder="Search all listed institutions"
                    className="pl-9"
                    aria-label="Search listed institutions"
                  />
                </div>
                <Select
                  value={form.university_id}
                  onValueChange={(v) => updateForm('university_id', v)}
                >
                  <SelectTrigger id="university">
                    <SelectValue placeholder="Select your university" />
                  </SelectTrigger>
                  <SelectContent>
                    {visibleUniversities.map((uni) => (
                      <SelectItem key={uni.id} value={uni.id}>
                        {uni.name} ({uni.short_name}){uni.city ? ` — ${uni.city}` : ''}
                      </SelectItem>
                    ))}
                    {!visibleUniversities.length && <SelectItem value="__no_match__" disabled>No listed institution matches your search.</SelectItem>}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {unisLoaded ? `${universities.length} listed institution${universities.length === 1 ? '' : 's'} available.` : 'Loading listed institutions…'}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="programme">Programme of study</Label>
                <Input
                  id="programme"
                  placeholder="e.g. Computer Science"
                  value={form.programme}
                  maxLength={120}
                  onChange={(e) => updateForm('programme', e.target.value)}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="faculty">Faculty</Label>
                  <Input
                    id="faculty"
                    placeholder="e.g. Science"
                    value={form.faculty}
                    maxLength={120}
                    onChange={(e) => updateForm('faculty', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="department">Department</Label>
                  <Input
                    id="department"
                    placeholder="e.g. Computer Science"
                    value={form.department}
                    maxLength={120}
                    onChange={(e) => updateForm('department', e.target.value)}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="level">Level</Label>
                  <Select
                    value={form.level}
                    onValueChange={(v) => updateForm('level', v)}
                  >
                    <SelectTrigger id="level">
                      <SelectValue placeholder="Select level" />
                    </SelectTrigger>
                    <SelectContent>
                      {['100', '200', '300', '400', '500', '600'].map((lvl) => (
                        <SelectItem key={lvl} value={lvl}>
                          Level {lvl}
                        </SelectItem>
                      ))}
                      <SelectItem value="graduate">Graduate</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="admission_year">Admission year</Label>
                  <Input
                    id="admission_year"
                    type="number"
                    min="2000"
                    max={new Date().getFullYear() + 1}
                    value={form.admission_year}
                    onChange={(e) => updateForm('admission_year', parseInt(e.target.value) || 0)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="index_number">Index / Student number</Label>
                <Input
                  id="index_number"
                  placeholder="e.g. 730000000"
                  value={form.index_number}
                  maxLength={80}
                  onChange={(e) => updateForm('index_number', e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Use your university-issued student ID number. It is visible only to authorized verification staff.
                </p>
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={handleBack} className="flex-1">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
                <Button onClick={handleNext} className="flex-1">
                  Continue
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="verification"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              <div className="rounded-xl border border-border bg-muted/20 p-4">
                <p className="text-sm font-semibold text-foreground">Review your details</p>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <div><dt className="text-muted-foreground">Phone</dt><dd className="mt-0.5 break-words font-medium">{form.phone || 'Not entered'}</dd></div>
                  <div><dt className="text-muted-foreground">University</dt><dd className="mt-0.5 break-words font-medium">{selectedUniversity?.short_name || selectedUniversity?.name || 'Not selected'}</dd></div>
                  <div><dt className="text-muted-foreground">Programme</dt><dd className="mt-0.5 break-words font-medium">{form.programme || 'Not entered'}</dd></div>
                  <div><dt className="text-muted-foreground">Level</dt><dd className="mt-0.5 font-medium">{form.level ? `Level ${form.level}` : 'Not selected'}</dd></div>
                </dl>
                <button type="button" onClick={() => setStep(1)} className="mt-3 text-xs font-semibold text-primary underline underline-offset-2">Edit study details</button>
              </div>

              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <p className="text-sm text-muted-foreground">
                  Upload a clear photo of your student ID card if available. It speeds up verification, but you can continue without it.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Student ID card photo <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <FileUploadButton
                  bucket="student-documents"
                  onUpload={(url) => updateForm('student_id_document_url', url)}
                  userId={user?.id}
                  accept="image/*"
                  label="Upload student ID"
                />
                {form.student_id_document_url && (
                  <div className="flex items-center gap-2 text-xs text-success">
                    <Check className="h-3.5 w-3.5" /> Student ID uploaded
                  </div>
                )}
              </div>

              {!cashInviteToken && <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">₵</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-foreground">One-time registration payment</p>
                    <p className="mt-1 text-2xl font-bold tracking-tight text-primary">GH₵10.00</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">Pay securely with Paystack using card or Mobile Money. Your student access and verification review start after the payment is confirmed.</p>
                  </div>
                </div>
              </div>}
              {!cashInviteToken && <PushPermissionCard onboarding />}
              <p className="text-xs text-muted-foreground">If someone invited you, their referral code will be attached automatically. Eligible successful registrations may earn the referrer GH₵2 after the settlement period.</p>

              <div className="flex gap-3">
                <Button variant="outline" onClick={handleBack} className="flex-1">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
                <Button onClick={handleSubmit} disabled={submitting || cashInviteLoading} className="flex-1">
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {cashInviteToken ? 'Complete cash registration' : 'Pay GH₵10 and continue'}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AuthLayout>
  );
}

function FileUploadButton({
  bucket,
  onUpload,
  userId,
  accept,
  label,
}: {
  bucket: string;
  onUpload: (url: string) => void;
  userId?: string;
  accept: string;
  label: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    setUploadError(null);
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('Choose a file smaller than 5 MB.');
      e.target.value = '';
      return;
    }
    if (bucket === 'student-documents' && !file.type.startsWith('image/')) {
      setUploadError('Student ID must be an image file.');
      e.target.value = '';
      return;
    }
    setUploading(true);
    const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
    const path = `${userId}/${bucket}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from(bucket).upload(path, file);
    if (error) {
      setUploadError('Could not upload the file. Try again.');
      setUploading(false);
      return;
    }
    // Profile avatars are public; verification documents remain private paths.
    const reference = bucket === 'avatars'
      ? supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
      : path;
    onUpload(reference);
    setUploading(false);
  };

  return (
    <label
      className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary ${
        uploading ? 'opacity-50' : ''
      }`}
    >
      {uploading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Upload className="h-4 w-4" />
      )}
      {uploading ? 'Uploading...' : label}
      {uploadError && <span className="basis-full text-center text-xs text-destructive">{uploadError}</span>}
      <input
        type="file"
        accept={accept}
        capture={bucket === 'student-documents' ? 'environment' : undefined}
        onChange={handleUpload}
        className="hidden"
        disabled={uploading}
      />
    </label>
  );
}
