'use client';

import { useEffect, useState } from 'react';
import { AdminRouteGuard, AdminLayout } from '@/components/admin/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase/client';
import { Award, BarChart3, CheckCircle2, Copy, FileText, Gift, Loader2, RefreshCw, ShieldCheck, Trophy, Users, Wallet } from 'lucide-react';
import { toast } from 'sonner';

type Score = { university_id: string; points: number; qualified_registrations: number; students: number; vendors: number; current_month: number; monthly_rank: number; active_admins_in_university: number; achievement: string; next_milestone: number; progress_to_next_milestone: number; message: string };
type Letter = { letter_id: string | null; document_reference?: string; recipient_name?: string; title?: string; effective_date?: string; duties?: Array<{ code?: string; title: string; description: string }>; letter_body?: string; status?: string; issued_at?: string; acknowledged_at?: string | null };
type Leader = { rank: number; name: string; qualified_registrations: number; is_me: boolean };
type Earnings = { month_start: string; student_count: number; vendor_count: number; qualified_count: number; rate_per_registration: number; estimated_amount: number; currency: string; rate_configured: boolean; history: Array<{ month_start: string; qualified_count: number; amount: number; currency: string; status: string; payout_reference?: string | null; paid_at?: string | null }> };
type ReferralLink = { university_id: string; token_hint: string; registration_path: string; expires_at?: string | null; issued_at?: string };

export default function UniversityAdminWorkspacePage() {
  return <AdminRouteGuard><AdminLayout><Content /></AdminLayout></AdminRouteGuard>;
}

function Content() {
  const [score, setScore] = useState<Score | null>(null);
  const [letter, setLetter] = useState<Letter | null>(null);
  const [leaderboard, setLeaderboard] = useState<Leader[]>([]);
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [referralLink, setReferralLink] = useState<ReferralLink | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [scoreError, setScoreError] = useState<string | null>(null);
  const [noAppointment, setNoAppointment] = useState(false);
  const [acknowledging, setAcknowledging] = useState(false);
  const [rotating, setRotating] = useState(false);

  async function load() {
    setLoading(true);
    setScoreError(null);
    setNoAppointment(false);
    try {
      const [scoreResult, letterResult] = await Promise.all([
        supabase.rpc('get_my_university_admin_score', { p_university_id: null }),
        supabase.rpc('get_my_university_admin_appointment'),
      ]);
      if (scoreResult.error) {
        setScore(null);
        if (scoreResult.error.code === '42501' && /administrator assignment required/i.test(scoreResult.error.message)) {
          setNoAppointment(true);
        } else {
          setScoreError(scoreResult.error.message);
        }
      } else {
        const nextScore = scoreResult.data as Score;
        setScore(nextScore);
        if (nextScore?.university_id) {
          const [leaders, link, pay] = await Promise.all([
            supabase.rpc('get_university_admin_leaderboard', { p_university_id: nextScore.university_id }),
            supabase.rpc('get_my_university_admin_referral_link', { p_university_id: nextScore.university_id, p_rotate: false }),
            supabase.rpc('get_my_university_admin_earnings', { p_university_id: nextScore.university_id }),
          ]);
          if (!leaders.error) setLeaderboard((leaders.data || []) as Leader[]);
          if (link.error) { setLinkError(link.error.message); setReferralLink(null); }
          else { setLinkError(null); setReferralLink(link.data as ReferralLink); }
          if (pay.error) toast.error(pay.error.message); else setEarnings(pay.data as Earnings);
        }
      }
      if (letterResult.error) toast.error(letterResult.error.message);
      else setLetter(letterResult.data as Letter);
    } catch {
      setScore(null);
      setNoAppointment(false);
      setScoreError('scorecard request failed');
      toast.error('Could not load your university administrator information. Please try again.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []);

  async function acknowledge() {
    if (!letter?.letter_id) return;
    setAcknowledging(true);
    const { error } = await supabase.rpc('acknowledge_university_admin_appointment', { p_letter_id: letter.letter_id });
    setAcknowledging(false);
    if (error) toast.error(error.message); else { toast.success('Appointment acknowledged.'); await load(); }
  }

  async function rotateReferralLink() {
    if (!score?.university_id) return;
    if (!window.confirm('Replace your current referral link? Any links already shared will stop working.')) return;
    setRotating(true);
    const { data, error } = await supabase.rpc('get_my_university_admin_referral_link', { p_university_id: score.university_id, p_rotate: true });
    setRotating(false);
    if (error) toast.error(error.message);
    else { setReferralLink(data as ReferralLink); setLinkError(null); toast.success('A new referral link is ready.'); }
  }

  function copy(text: string) {
    void navigator.clipboard.writeText(text).then(() => toast.success('Referral link copied.')).catch(() => toast.error('Could not copy the link. Select and copy it manually.'));
  }

  const publicReferralUrl = referralLink?.registration_path ? `${typeof window === 'undefined' ? 'https://www.uniecoghana.com' : window.location.origin}${referralLink.registration_path}` : '';

  return <div className="mx-auto w-full max-w-6xl space-y-5 p-4 pb-24 sm:p-6">
    <div className="flex items-start justify-between gap-3">
      <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">University Administrator</p><h1 className="mt-2 text-2xl font-bold sm:text-3xl">Your campus impact</h1><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Track completed student and vendor registrations, your monthly estimate, and your official appointment.</p></div>
      <Button variant="outline" className="min-h-11 shrink-0" onClick={() => void load()} disabled={loading} aria-label="Refresh dashboard"><RefreshCw className={`h-4 w-4 sm:mr-2 ${loading ? 'animate-spin' : ''}`} /><span className="hidden sm:inline">Refresh</span></Button>
    </div>

    {loading ? <Card><CardContent className="flex min-h-36 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></CardContent></Card> : scoreError ? <Card><CardContent className="flex flex-col items-center p-8 text-center" role="alert"><ShieldCheck className="h-10 w-10 text-amber-600" /><p className="mt-3 font-semibold">Your scorecard could not be loaded</p><p className="mt-1 max-w-xl text-sm text-muted-foreground">This does not mean your appointment or referral records are missing. Please retry; if the problem continues, contact UniEco support with the time of the error.</p><Button variant="outline" className="mt-4 min-h-11" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" />Try again</Button></CardContent></Card> : noAppointment || !score ? <Card><CardContent className="p-8 text-center"><ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground/50" /><p className="mt-3 font-semibold">No active administrator appointment found</p><p className="mt-1 text-sm text-muted-foreground">Your approved appointment and scorecard will appear here.</p></CardContent></Card> : <>
      <Card className="overflow-hidden border-primary/20 bg-primary/[0.04]">
        <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Users className="h-5 w-5 text-primary" />Your official registration link</CardTitle><p className="text-sm leading-5 text-muted-foreground">Share this link with students and vendors at your assigned campus. The referral code is captured during sign-up and checked against completed registrations.</p></CardHeader>
        <CardContent className="space-y-3">
          {publicReferralUrl ? <div className="flex flex-col gap-2 sm:flex-row"><input aria-label="Your referral link" readOnly className="min-h-12 min-w-0 flex-1 rounded-lg border bg-white px-3 text-sm" value={publicReferralUrl} onFocus={(event) => event.currentTarget.select()} /><Button className="min-h-12 w-full sm:w-auto" onClick={() => copy(publicReferralUrl)}><Copy className="mr-2 h-4 w-4" />Copy link</Button></div> : <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{linkError || 'Your referral link is being prepared.'}</div>}
          <div className="flex flex-col justify-between gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center"><span>{referralLink ? `Private token ${referralLink.token_hint} · kept encrypted at rest` : 'Your link is private to your signed-in administrator account.'}</span><Button variant="ghost" size="sm" className="min-h-10 justify-start px-2 text-xs" onClick={() => void rotateReferralLink()} disabled={rotating || loading}><RefreshCw className={`mr-2 h-3.5 w-3.5 ${rotating ? 'animate-spin' : ''}`} />Replace link</Button></div>
        </CardContent>
      </Card>

      {letter?.letter_id && <Card><CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" />Appointment and duties</CardTitle></CardHeader><CardContent className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold">{letter.title || 'University Administrator'}</p><p className="text-xs text-muted-foreground">{letter.document_reference} · issued {letter.issued_at ? new Date(letter.issued_at).toLocaleDateString('en-GH') : 'recently'}</p></div><Badge variant="outline" className="capitalize">{letter.status}</Badge></div><p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{letter.letter_body}</p>{(letter.duties || []).length > 0 && <div className="grid gap-2 sm:grid-cols-2">{letter.duties?.map((duty) => <div key={duty.code || duty.title} className="rounded-xl border bg-white p-3"><p className="text-sm font-semibold">{duty.title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{duty.description}</p></div>)}</div>}{letter.status === 'issued' && <Button className="min-h-11 w-full sm:w-auto" onClick={() => void acknowledge()} disabled={acknowledging}><CheckCircle2 className="mr-2 h-4 w-4" />{acknowledging ? 'Acknowledging…' : 'Acknowledge appointment'}</Button>}</CardContent></Card>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric icon={Trophy} label="All-time qualified" value={score.qualified_registrations} /><Metric icon={Gift} label="Student registrations" value={score.students} /><Metric icon={ShieldCheck} label="Vendor registrations" value={score.vendors} /><Metric icon={Award} label="Qualified this month" value={earnings?.qualified_count ?? score.current_month} /></div>

      <Card><CardContent className="p-4 sm:p-5"><div className="flex items-start gap-3"><Wallet className="mt-1 h-6 w-6 shrink-0 text-primary" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-bold">Monthly payment estimate</p><p className="mt-1 text-sm text-muted-foreground">Based on qualified registrations this month. UniEco Ghana reviews and pays after month-end.</p></div><p className="text-2xl font-bold text-primary">{earnings?.currency || 'GHS'} {Number(earnings?.estimated_amount || 0).toFixed(2)}</p></div><p className="mt-2 text-xs text-muted-foreground">{earnings?.rate_configured ? `Rate: GHS ${Number(earnings.rate_per_registration).toFixed(2)} per qualified registration.` : 'The Super Admin has not set the approved rate yet; no payment amount is promised until it is configured.'}</p>{(earnings?.history || []).length > 0 && <div className="mt-4 border-t pt-3"><p className="mb-2 text-sm font-semibold">Monthly payment history</p><div className="space-y-2">{earnings?.history.map((row) => <div key={row.month_start} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 p-3 text-sm"><span>{new Date(`${row.month_start}T12:00:00`).toLocaleDateString('en-GH', { month: 'long', year: 'numeric' })} · {row.qualified_count} registrations</span><span className="flex items-center gap-2 font-semibold">{row.currency} {Number(row.amount).toFixed(2)} <Badge variant="outline" className="capitalize">{row.status}</Badge></span></div>)}</div></div>}</div></div></CardContent></Card>

      <Card><CardContent className="p-5"><div className="flex items-start gap-3"><Award className="mt-1 h-6 w-6 text-amber-500" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-bold">{score.achievement}</p><p className="text-sm text-muted-foreground">{score.message}</p></div><span className="text-sm font-bold text-primary">{score.progress_to_next_milestone}%</span></div><div className="mt-3 h-3 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${score.progress_to_next_milestone}%` }} /></div><p className="mt-2 text-xs text-muted-foreground">Next milestone: {score.next_milestone} qualified registrations · campus rank #{score.monthly_rank}</p></div></div></CardContent></Card>

      <div className="grid gap-5 lg:grid-cols-2"><Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><BarChart3 className="h-5 w-5 text-primary" />Campus leaderboard</CardTitle></CardHeader><CardContent className="space-y-2">{leaderboard.length === 0 ? <p className="text-sm text-muted-foreground">Your campus leaderboard will appear here.</p> : leaderboard.map((leader) => <div key={leader.rank} className={`flex items-center justify-between rounded-xl border p-3 text-sm ${leader.is_me ? 'border-primary/40 bg-primary/5' : ''}`}><span className="font-semibold">#{leader.rank} {leader.name} {leader.is_me && <span className="text-primary">(you)</span>}</span><span className="font-bold">{leader.qualified_registrations}</span></div>)}</CardContent></Card><Card><CardHeader><CardTitle className="text-base">How registrations count</CardTitle></CardHeader><CardContent className="space-y-2 text-sm leading-6 text-muted-foreground"><p>Share your official link with genuine students and vendors at your campus.</p><p>A registration counts after the required payment and verification conditions are complete. Clicks, duplicates, self-referrals, and unfinished accounts do not count.</p><p>Never request passwords, payment PINs, private documents outside UniEco forms, or unofficial fees.</p></CardContent></Card></div>
    </>}
  </div>;
}

function Metric({ icon: Icon, label, value }: { icon: typeof Trophy; label: string; value: number }) {
  return <Card><CardContent className="flex min-h-[88px] items-center gap-3 p-4"><div className="rounded-xl bg-primary/10 p-2.5 text-primary"><Icon className="h-5 w-5" /></div><div><p className="text-2xl font-bold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div></CardContent></Card>;
}
