'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminRouteGuard, AdminLayout } from '@/components/admin/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/lib/supabase/client';
import { getAdminUniversities } from '@/lib/data/admin-client';
import { CheckCircle2, Clock3, Loader2, XCircle } from 'lucide-react';
import { toast } from 'sonner';

type University = { id: string; name: string };
type Application = { application_id: string; application_reference: string; applicant_name: string; university_id: string; status: string; phone: string; programme: string; level: string; availability: string; experience: string; cover_note: string; submitted_at: string; reviewer_note?: string | null };
const PUBLIC_SITE_URL = 'https://www.uniecoghana.com';

export default function UniversityAdministratorsPage() {
  return <AdminRouteGuard><AdminLayout><Content /></AdminLayout></AdminRouteGuard>;
}

function Content() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [universities, setUniversities] = useState<University[]>([]);
  const [status, setStatus] = useState('pending');
  const [universityId, setUniversityId] = useState('all');
  const [selected, setSelected] = useState<Application | null>(null);
  const [reviewerNote, setReviewerNote] = useState('');
  const [jobTitle, setJobTitle] = useState('University Administrator');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [openingSaving, setOpeningSaving] = useState(false);
  const [openingId, setOpeningId] = useState('');
  const [openingStatus, setOpeningStatus] = useState('');
  const [openingClosesOn, setOpeningClosesOn] = useState('2026-11-30');
  const [openingLink, setOpeningLink] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [apps, unis] = await Promise.all([
      supabase.rpc('list_university_admin_applications', { p_status: status === 'all' ? null : status, p_university_id: universityId === 'all' ? null : universityId, p_limit: 250 }),
      getAdminUniversities(),
    ]);
    if (apps.error) toast.error(apps.error.message); else setApplications((apps.data || []) as Application[]);
    if (!unis.length) setUniversities([]); else setUniversities(unis.map((uni) => ({ id: uni.id, name: uni.name })));
    setLoading(false);
  }, [status, universityId]);
  useEffect(() => { void load(); }, [load]);

  async function review(decision: 'under_review' | 'approve' | 'reject') {
    if (!selected) return;
    if (decision === 'reject' && reviewerNote.trim().length < 10) { toast.error('Add a clear rejection reason of at least 10 characters.'); return; }
    setWorking(true);
    const { error } = await supabase.rpc('review_university_admin_application', { p_application_id: selected.application_id, p_decision: decision, p_reviewer_note: reviewerNote.trim() || null, p_job_title: jobTitle.trim() || 'University Administrator' });
    setWorking(false);
    if (error) { toast.error(error.message); return; }
    toast.success(decision === 'approve' ? 'Application approved and appointment issued.' : decision === 'reject' ? 'Application rejected.' : 'Application moved to review.');
    setSelected(null); setReviewerNote(''); await load();
  }

  async function setOpening() {
    if (!openingId) { toast.error('Select a university first.'); return; }
    const closesAt = openingStatus === 'open' && openingClosesOn
      ? new Date(`${openingClosesOn}T23:59:59.999Z`)
      : null;
    if (openingStatus === 'open' && (!closesAt || Number.isNaN(closesAt.getTime()) || closesAt.getTime() <= Date.now())) {
      toast.error('Choose a closing date in the future. The window closes at 11:59 pm Ghana time.');
      return;
    }
    setOpeningSaving(true);
    try {
      const { error } = await supabase.rpc('set_university_admin_opening', { p_university_id: openingId, p_status: openingStatus, p_title: 'University Administrator Programme', p_description: 'Help students and vendors join UniEco Ghana and support your university community.', p_opens_at: new Date().toISOString(), p_closes_at: closesAt?.toISOString() ?? null });
      if (error) { toast.error(error.message); return; }
      setOpeningLink(openingStatus === 'open' ? '/university-admin/apply' : null);
      toast.success(openingStatus === 'open' ? `Applications opened until ${openingClosesOn} at 11:59 pm Ghana time. Share the link below.` : `Application window saved as ${openingStatus.replace('_', ' ')}.`);
    } catch {
      toast.error('Could not save the application window. Check your connection and try again.');
    } finally {
      setOpeningSaving(false);
    }
  }

  return <div className="mx-auto w-full max-w-6xl space-y-5 p-4 sm:p-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Governance & employment</p><h1 className="mt-2 font-display text-2xl font-bold sm:text-3xl">University Administrators</h1><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Review applications, issue scoped appointments, and keep every decision in the audit trail.</p></div><Button variant="outline" onClick={() => void load()} disabled={loading}><Loader2 className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</Button></div>
    <Card className="border-primary/20 bg-primary/5"><CardHeader><CardTitle className="text-base">Application window</CardTitle><p className="text-sm text-muted-foreground">Save as Draft while preparing. Only Open windows appear to applicants.</p></CardHeader><CardContent className="space-y-3"><div className="grid gap-3 sm:grid-cols-[1fr_160px_210px_auto] sm:items-end"><div className="space-y-1.5"><Label>University</Label><Select value={openingId} onValueChange={(value) => { setOpeningId(value); setOpeningLink(null); }}><SelectTrigger><SelectValue placeholder="Choose a university" /></SelectTrigger><SelectContent>{universities.map((uni) => <SelectItem key={uni.id} value={uni.id}>{uni.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>Status</Label><Select value={openingStatus} onValueChange={(value) => { setOpeningStatus(value); setOpeningLink(null); }}><SelectTrigger><SelectValue placeholder="Choose status" /></SelectTrigger><SelectContent><SelectItem value="draft">Draft</SelectItem><SelectItem value="open">Open</SelectItem><SelectItem value="paused">Paused</SelectItem><SelectItem value="closed">Closed</SelectItem></SelectContent></Select></div><div className="space-y-1.5"><Label htmlFor="opening-closing-date">Closing date (Ghana time)</Label><input id="opening-closing-date" type="date" min={new Date().toISOString().slice(0, 10)} value={openingClosesOn} onChange={(event) => setOpeningClosesOn(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" aria-describedby="opening-closing-help" /><p id="opening-closing-help" className="text-xs text-muted-foreground">Applications close at 11:59 pm on this date.</p></div><Button className="min-h-10" onClick={() => void setOpening()} disabled={openingSaving || loading || universities.length === 0 || !openingId || !openingStatus}>{openingSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : 'Save window'}</Button></div>{openingLink && <div className="flex flex-col gap-2 rounded-xl border border-primary/20 bg-white p-3 text-sm sm:flex-row sm:items-center"><span className="min-w-0 flex-1 break-all text-muted-foreground">{PUBLIC_SITE_URL}{openingLink}</span><Button variant="outline" className="min-h-10 shrink-0" onClick={() => void navigator.clipboard.writeText(PUBLIC_SITE_URL + openingLink).then(() => toast.success('Application link copied.')).catch(() => toast.error('Copy was blocked. Select and copy the link manually.'))}>Copy application link</Button></div>}</CardContent></Card>
    <div className="flex flex-col gap-3 sm:flex-row"><Select value={status} onValueChange={setStatus}><SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pending">Pending</SelectItem><SelectItem value="under_review">Under review</SelectItem><SelectItem value="approved">Approved</SelectItem><SelectItem value="rejected">Rejected</SelectItem><SelectItem value="all">All statuses</SelectItem></SelectContent></Select><Select value={universityId} onValueChange={setUniversityId}><SelectTrigger className="w-full sm:w-72"><SelectValue placeholder="All universities" /></SelectTrigger><SelectContent><SelectItem value="all">All universities</SelectItem>{universities.map((uni) => <SelectItem key={uni.id} value={uni.id}>{uni.name}</SelectItem>)}</SelectContent></Select></div>
    {loading ? <Card><CardContent className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></CardContent></Card> : applications.length === 0 ? <Card><CardContent className="p-8 text-center sm:p-10" aria-live="polite"><p className="font-semibold text-foreground">{status === 'pending' ? 'No pending applications yet' : 'No applications match these filters'}</p><p className="mt-1 text-sm text-muted-foreground">{status === 'pending' ? 'The application window can be open even when nobody has submitted an application. New submissions will appear here for review.' : 'Try a different status or university filter.'}</p></CardContent></Card> : <div className="grid gap-3">{applications.map((application) => <Card key={application.application_id} className="overflow-hidden"><CardContent className="p-4 sm:p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{application.applicant_name}</h2><Badge variant="outline" className="capitalize">{application.status.replace('_', ' ')}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{application.application_reference} · {application.programme} · {application.level}</p><p className="mt-1 text-xs text-muted-foreground">{application.phone} · submitted {new Date(application.submitted_at).toLocaleDateString('en-GH')}</p></div><Button variant="outline" className="min-h-10 shrink-0" onClick={() => { setSelected(application); setReviewerNote(application.reviewer_note || ''); }}>Review application</Button></div><div className="mt-4 grid gap-3 text-sm sm:grid-cols-3"><div><p className="font-semibold">Availability</p><p className="mt-1 text-muted-foreground">{application.availability}</p></div><div><p className="font-semibold">Experience</p><p className="mt-1 line-clamp-3 text-muted-foreground">{application.experience}</p></div><div><p className="font-semibold">Motivation</p><p className="mt-1 line-clamp-3 text-muted-foreground">{application.cover_note}</p></div></div></CardContent></Card>)}</div>}
    {selected && <div className="fixed inset-0 z-50 flex items-end bg-slate-950/50 p-0 sm:items-center sm:justify-center sm:p-4" role="dialog" aria-modal="true"><div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wider text-primary">Application review</p><h2 className="mt-1 text-xl font-bold">{selected.applicant_name}</h2><p className="text-sm text-muted-foreground">{selected.application_reference}</p></div><Button variant="ghost" size="sm" onClick={() => setSelected(null)}>Close</Button></div><div className="mt-5 space-y-4 text-sm"><div className="rounded-xl bg-slate-50 p-4"><p className="font-semibold">Applicant information</p><p className="mt-2 text-muted-foreground">{selected.programme} · {selected.level} · {selected.phone}</p><p className="mt-2 whitespace-pre-wrap text-muted-foreground">{selected.experience}</p><p className="mt-2 whitespace-pre-wrap text-muted-foreground">{selected.cover_note}</p></div><div className="space-y-1.5"><Label>Appointment title</Label><input className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} /></div><div className="space-y-1.5"><Label>Review note {selected.status === 'pending' ? '(optional for approval, required for rejection)' : ''}</Label><textarea className="min-h-24 w-full rounded-md border bg-background p-3 text-sm" value={reviewerNote} onChange={(event) => setReviewerNote(event.target.value)} placeholder="Record the decision clearly." /></div></div><div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3"><Button variant="outline" onClick={() => void review('under_review')} disabled={working}><Clock3 className="mr-2 h-4 w-4" />Under review</Button><Button onClick={() => void review('approve')} disabled={working}><CheckCircle2 className="mr-2 h-4 w-4" />Approve & appoint</Button><Button variant="destructive" onClick={() => void review('reject')} disabled={working}><XCircle className="mr-2 h-4 w-4" />Reject</Button></div></div></div>}
  </div>;
}
