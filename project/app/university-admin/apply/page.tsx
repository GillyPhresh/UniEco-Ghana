'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { RouteGuard } from '@/lib/auth/route-guard';
import { useAuth } from '@/lib/auth/auth-context';
import { supabase } from '@/lib/supabase/client';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AlertCircle, CheckCircle2, FileText, GraduationCap, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

type Opening = {
  opening_id: string;
  university_id: string;
  university_name?: string;
  title: string;
  description: string;
  closes_at: string | null;
};
type Application = {
  application_id: string;
  application_reference: string;
  university_id: string;
  status: string;
  programme: string;
  submitted_at: string;
  reviewer_note?: string | null;
};

export default function UniversityAdminApplyPage() {
  return <RouteGuard requireAuth><Suspense fallback={<div className="p-8 text-center">Loading application…</div>}><ApplyContent /></Suspense></RouteGuard>;
}

function ApplyContent() {
  const params = useSearchParams();
  const { user } = useAuth();
  const universityId = params.get('university_id') || '';
  const [openings, setOpenings] = useState<Opening[]>([]);
  const [selectedUniversityId, setSelectedUniversityId] = useState(universityId);
  const [opening, setOpening] = useState<Opening | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ phone: '', studentId: '', programme: '', level: '', availability: '', experience: '', coverNote: '', terms: false });

  useEffect(() => {
    let active = true;
    async function loadPage() {
      setLoading(true);
      setError(null);
      const [openingsResult, applicationsResult] = await Promise.all([
        supabase.rpc('list_open_university_admin_openings'),
        supabase.rpc('get_my_university_admin_applications'),
      ]);
      if (!active) return;
      if (openingsResult.error) setError('We could not load the open campus opportunities just now. Please refresh and try again.');
      else setOpenings((openingsResult.data || []) as Opening[]);
      if (!applicationsResult.error) setApplications((applicationsResult.data || []) as Application[]);
      setSelectedUniversityId(universityId);
      if (universityId) {
        const { data, error: openingError } = await supabase.rpc('get_university_admin_application_form', { p_university_id: universityId });
        if (!active) return;
        if (openingError) setError('We could not load this campus application form. Please go back, choose an open campus, and try again.');
        else setOpening(data as Opening);
      } else {
        setOpening(null);
      }
      setLoading(false);
    }
    void loadPage();
    return () => { active = false; };
  }, [universityId, user?.id]);

  async function chooseUniversity(id: string) {
    setSelectedUniversityId(id);
    setOpening(null);
    setError(null);
    if (!id) return;
    setLoading(true);
    const { data, error: openingError } = await supabase.rpc('get_university_admin_application_form', { p_university_id: id });
    if (openingError) setError('We could not load this campus application form. Please choose an open campus and try again.');
    else setOpening(data as Opening);
    setLoading(false);
  }

  function update(key: keyof typeof form, value: string | boolean) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit() {
    if (!opening || !user) return;
    const availabilityLength = form.availability.trim().length;
    if (form.phone.trim().length < 7 || form.studentId.trim().length < 2 || form.programme.trim().length < 2 || form.level.trim().length < 1 || availabilityLength < 10 || availabilityLength > 120 || form.experience.trim().length < 20 || form.coverNote.trim().length < 30 || !form.terms) {
      if (availabilityLength > 120) {
        setError('Availability details must be 120 characters or fewer. Shorten this answer and try again.');
        return;
      }
      setError('Complete every required field and accept the programme terms before submitting.');
      return;
    }
    setSubmitting(true); setError(null);
    const { data, error: submitError } = await supabase.rpc('submit_university_admin_application', {
      p_university_id: opening.university_id,
      p_phone: form.phone.trim(),
      p_student_id_number: form.studentId.trim(),
      p_programme: form.programme.trim(),
      p_level: form.level.trim(),
      p_availability: form.availability.trim(),
      p_experience: form.experience.trim(),
      p_cover_note: form.coverNote.trim(),
      p_cv_path: null,
      p_terms_accepted: form.terms,
    });
    setSubmitting(false);
    if (submitError) {
      if (submitError.code === '23514' && submitError.message.includes('university_admin_applications_availability_check')) {
        setError('Availability details must be 120 characters or fewer. Your answers are still here; shorten this answer and try again.');
      } else if (submitError.code === '23505') {
        // A network timeout can hide a successful insert from the browser. Reload
        // the user's own applications before asking them to submit again.
        const { data: savedApplications } = await supabase.rpc('get_my_university_admin_applications');
        const existing = ((savedApplications || []) as Application[]).find((item) => item.university_id === opening.university_id);
        if (existing) {
          setApplications((current) => [existing, ...current.filter((item) => item.application_id !== existing.application_id)]);
          setError('Your application has already been received. Its current status is shown below.');
        } else {
          setError('An application for this campus is already on your account. Check the applications listed above.');
        }
      } else if (submitError.code === '42501') {
        setError('This application is only available to an active student account applying to its own university. Check your account and campus, then try again.');
      } else if (submitError.code === '22023') {
        setError('Please check the required fields and confirm the programme terms before submitting again.');
      } else if (submitError.code === '23514') {
        setError('One of the details does not meet the form requirements. Check your phone number, availability, experience, and motivation, then try again. Your answers are still here.');
      } else {
        setError('We couldn’t submit your application just now. Your answers are still here; please try again.');
      }
      return;
    }
    setApplications((current) => [{ ...(data as Application), submitted_at: new Date().toISOString() }, ...current]);
    toast.success('Application submitted for review.');
    setForm({ phone: '', studentId: '', programme: '', level: '', availability: '', experience: '', coverNote: '', terms: false });
  }

  return <>
    <SiteHeader />
    <main className="min-h-screen bg-slate-50 py-6 sm:py-10">
      <div className="mx-auto w-full max-w-3xl space-y-5 px-4 sm:px-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">UniEco Ghana opportunity</p>
          <h1 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">University Administrator application</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Apply to help students and vendors join UniEco Ghana in your university community. Your application is reviewed by the Super Admin; access is never granted automatically.</p>
        </div>
        {loading && <Card><CardContent className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></CardContent></Card>}
        {!loading && openings.length > 0 && <Card><CardHeader><CardTitle className="text-base">Choose your university</CardTitle><p className="text-sm text-muted-foreground">Applications are open at the campuses below. Only apply to your own university.</p></CardHeader><CardContent><select aria-label="Choose your university" className="min-h-12 w-full rounded-lg border bg-white px-3 text-sm" value={selectedUniversityId} onChange={(event) => void chooseUniversity(event.target.value)}><option value="">Select a campus</option>{openings.map((item) => <option key={item.opening_id} value={item.university_id}>{item.university_name || item.title}</option>)}</select></CardContent></Card>}
        {error && <Card className="border-destructive/30"><CardContent className="flex gap-3 p-5 text-sm text-destructive"><AlertCircle className="h-5 w-5 shrink-0" />{error}</CardContent></Card>}
        {!loading && openings.length === 0 && !error && <Card><CardContent className="p-8 text-center"><GraduationCap className="mx-auto h-8 w-8 text-muted-foreground" /><p className="mt-3 font-semibold">Applications are not open right now</p><p className="mt-1 text-sm text-muted-foreground">Please check back later or contact UniEco Ghana through the official support channels.</p></CardContent></Card>}
        {opening && <>
          <Card className="border-primary/20 bg-primary/5"><CardContent className="flex items-start gap-3 p-4"><GraduationCap className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><p className="font-semibold">{opening.title}</p><p className="mt-1 text-sm text-muted-foreground">{opening.description}</p>{opening.closes_at && <p className="mt-2 text-xs text-muted-foreground">Applications close {new Date(opening.closes_at).toLocaleString('en-GH')}</p>}</div></CardContent></Card>
          {applications.length > 0 && <Card><CardHeader><CardTitle className="text-base">Your applications</CardTitle></CardHeader><CardContent className="space-y-3">{applications.map((application) => <div key={application.application_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-sm"><div><p className="font-semibold">{application.application_reference}</p><p className="text-xs text-muted-foreground">{new Date(application.submitted_at).toLocaleDateString('en-GH')}</p></div><span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold capitalize text-primary">{application.status.replace('_', ' ')}</span></div>)}</CardContent></Card>}
          {applications.some((application) => application.university_id === opening.university_id && ['pending', 'under_review', 'approved'].includes(application.status)) ? <Card><CardContent className="p-5 text-sm"><p className="font-semibold">Your application for this campus is already on file.</p><p className="mt-1 text-muted-foreground">Its reference and review status are shown above. You don’t need to submit it again.</p></CardContent></Card> : <Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><FileText className="h-5 w-5 text-primary" />Tell us about yourself</CardTitle><p className="text-sm text-muted-foreground">Use truthful information. We use it only for reviewing this opportunity.</p></CardHeader><CardContent className="space-y-4">
            {error && <div className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="ua-phone">Phone number *</Label><Input id="ua-phone" inputMode="tel" autoComplete="tel" maxLength={20} value={form.phone} onChange={(event) => update('phone', event.target.value)} placeholder="024..." /></div>
              <div className="space-y-1.5"><Label htmlFor="ua-student-id">Student ID / index number *</Label><Input id="ua-student-id" maxLength={80} value={form.studentId} onChange={(event) => update('studentId', event.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="ua-programme">Programme *</Label><Input id="ua-programme" maxLength={160} value={form.programme} onChange={(event) => update('programme', event.target.value)} placeholder="Your course of study" /></div>
              <div className="space-y-1.5"><Label htmlFor="ua-level">Level / year *</Label><Input id="ua-level" maxLength={40} value={form.level} onChange={(event) => update('level', event.target.value)} placeholder="e.g. Level 300" /></div>
            </div>
            <div className="space-y-1.5"><Label htmlFor="ua-availability">Availability *</Label><Textarea id="ua-availability" rows={3} maxLength={120} aria-describedby="ua-availability-help" value={form.availability} onChange={(event) => update('availability', event.target.value)} placeholder="e.g. Weekdays after 3 pm and Saturday mornings on campus." /><p id="ua-availability-help" className="text-xs text-muted-foreground">Briefly note when you can help (10–120 characters). {form.availability.length}/120</p></div>
            <div className="space-y-1.5"><Label htmlFor="ua-experience">Relevant experience *</Label><Textarea id="ua-experience" rows={4} maxLength={3000} value={form.experience} onChange={(event) => update('experience', event.target.value)} placeholder="Describe outreach, leadership, customer service, campus or digital experience." /><p className="text-xs text-muted-foreground">{form.experience.length}/3000</p></div>
            <div className="space-y-1.5"><Label htmlFor="ua-cover">Why should we select you? *</Label><Textarea id="ua-cover" rows={5} maxLength={3000} value={form.coverNote} onChange={(event) => update('coverNote', event.target.value)} placeholder="Write a short, clear motivation." /><p className="text-xs text-muted-foreground">{form.coverNote.length}/3000</p></div>
            <label className="flex items-start gap-3 rounded-xl border p-3 text-sm"><input type="checkbox" className="mt-1 h-4 w-4 accent-primary" checked={form.terms} onChange={(event) => update('terms', event.target.checked)} /><span>I agree to protect user privacy, never request passwords or payment PINs, never charge unofficial fees, and follow UniEco Ghana’s administrator duties and code of conduct.</span></label>
            <Button className="min-h-11 w-full sm:w-auto" onClick={() => void submit()} disabled={submitting}>{submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}{submitting ? 'Submitting…' : 'Submit application'}</Button>
          </CardContent></Card>}
        </>}
        <p className="text-center text-xs text-muted-foreground">Already appointed? <Link href="/admin/university-admin" className="font-semibold text-primary hover:underline">Open your administrator workspace</Link></p>
      </div>
    </main>
    <SiteFooter />
  </>;
}
