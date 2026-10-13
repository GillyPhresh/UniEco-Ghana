'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  User,
  GraduationCap,
  ShieldCheck,
  Check,
  Loader2,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Upload,
} from 'lucide-react';

const STEPS = [
  { id: 'personal', label: 'Personal', icon: User },
  { id: 'university', label: 'University', icon: GraduationCap },
  { id: 'verification', label: 'Verification', icon: ShieldCheck },
] as const;

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
  return (
    <RouteGuard requireAuth>
      <StudentOnboarding />
    </RouteGuard>
  );
}

function StudentOnboarding() {
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [universities, setUniversities] = useState<{ id: string; name: string; short_name: string }[]>([]);
  const [unisLoaded, setUnisLoaded] = useState(false);
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

  if (!unisLoaded) {
    supabase
      .from('universities')
      .select('id, name, short_name')
      .eq('is_enabled', true)
      .order('name')
      .then(({ data }) => {
        setUniversities(data || []);
        setUnisLoaded(true);
      });
  }

  const updateForm = (key: keyof FormData, value: string | number) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const validateStep = (): string | null => {
    if (step === 0) {
      if (!form.phone || form.phone.length < 10) return 'Enter a valid phone number';
    }
    if (step === 1) {
      if (!form.university_id) return 'Select your university';
      if (!form.programme) return 'Enter your programme';
      if (!form.faculty) return 'Enter your faculty';
      if (!form.department) return 'Enter your department';
      if (!form.level) return 'Select your level';
      if (!form.index_number) return 'Enter your index/student number';
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

  const handleBack = () => {
    setError(null);
    setStep((s) => Math.max(s - 1, 0));
  };

  const handleSubmit = async () => {
    if (!user) return;
    setError(null);
    setSubmitting(true);

    try {
      const referralCode = new URLSearchParams(window.location.search).get('ref') || window.sessionStorage.getItem('unieco_pending_referral_code');
      const response = await fetch('/api/payments/paystack/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purpose: 'student_registration',
          idempotencyKey: crypto.randomUUID(),
          registration: {
            universityId: form.university_id,
            phone: form.phone,
            studentIdNumber: form.index_number,
            program: form.programme,
            faculty: form.faculty,
            department: form.department,
            level: form.level,
            admissionYear: form.admission_year,
            graduationYear: form.graduation_year || null,
            studentDocumentPath: form.student_id_document_url || null,
            referralCode,
          },
        }),
      });
      const result = await response.json() as { authorizationUrl?: string; error?: string };
      if (!response.ok || !result.authorizationUrl) throw new Error(result.error || 'Payment could not be initialized.');
      window.sessionStorage.removeItem('unieco_pending_referral_code');
      if (form.avatar_url) {
        const { error: avatarError } = await supabase.from('profiles').update({ avatar_url: form.avatar_url }).eq('id', user.id);
        if (avatarError) throw new Error('Registration was saved, but the profile photo could not be saved. Retry payment from onboarding.');
      }
      // Redirecting to Paystack is only checkout UX; activation is webhook-authoritative.
      window.location.assign(result.authorizationUrl);
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
      subtitle="This helps us verify your identity and connect you to your campus"
      backHref="/signin"
      backLabel="Sign out"
    >
      <div className="space-y-6">
        {/* Progress indicator */}
        <div className="flex items-center justify-between">
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
                  placeholder="e.g. 0244 123 456"
                  value={form.phone}
                  onChange={(e) => updateForm('phone', e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  We use this for order updates and important notifications
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
                <Select
                  value={form.university_id}
                  onValueChange={(v) => updateForm('university_id', v)}
                >
                  <SelectTrigger id="university">
                    <SelectValue placeholder="Select your university" />
                  </SelectTrigger>
                  <SelectContent>
                    {universities.map((uni) => (
                      <SelectItem key={uni.id} value={uni.id}>
                        {uni.name} ({uni.short_name})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="programme">Programme of study</Label>
                <Input
                  id="programme"
                  placeholder="e.g. Computer Science"
                  value={form.programme}
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
                    onChange={(e) => updateForm('faculty', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="department">Department</Label>
                  <Input
                    id="department"
                    placeholder="e.g. Computer Science"
                    value={form.department}
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
                  onChange={(e) => updateForm('index_number', e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  This is your university-issued student ID number. We use it to verify
                  you are a real student.
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
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <p className="text-sm text-muted-foreground">
                  Upload a photo of your student ID card. This helps us verify your
                  identity and protect the community from fake accounts.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Student ID card photo</Label>
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

              <div className="rounded-lg border border-info/30 bg-info/5 p-3">
                <p className="text-xs text-info-foreground">
                  Student registration fee: GH₵10.00. Your account is activated only after Paystack confirms the payment. Student verification is reviewed separately.
                </p>
              </div>
              <p className="text-xs text-muted-foreground">If someone invited you, their referral code will be applied to this registration. Eligible successful registrations may earn the referrer GH₵2 after the settlement period. Terms apply.</p>

              <div className="flex gap-3">
                <Button variant="outline" onClick={handleBack} className="flex-1">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
                <Button onClick={handleSubmit} disabled={submitting} className="flex-1">
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Continue to payment · GH₵10.00
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

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `${userId}/${bucket}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from(bucket).upload(path, file);
    if (error) {
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
      <input
        type="file"
        accept={accept}
        onChange={handleUpload}
        className="hidden"
        disabled={uploading}
      />
    </label>
  );
}
