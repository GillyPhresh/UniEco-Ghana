'use client';

import { useEffect, useState } from 'react';
import { AdminRouteGuard, AdminLayout } from '@/components/admin/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase/client';
import { Award, BarChart3, CheckCircle2, FileText, Gift, Loader2, ShieldCheck, Trophy } from 'lucide-react';
import { toast } from 'sonner';

type Score = { university_id: string; points: number; qualified_registrations: number; students: number; vendors: number; current_month: number; monthly_rank: number; active_admins_in_university: number; achievement: string; next_milestone: number; progress_to_next_milestone: number; message: string; };
type Letter = { letter_id: string | null; document_reference?: string; recipient_name?: string; title?: string; effective_date?: string; duties?: Array<{ title: string; description: string }>; letter_body?: string; status?: string; issued_at?: string; acknowledged_at?: string | null; };
type Leader = { rank: number; name: string; qualified_registrations: number; is_me: boolean };

export default function UniversityAdminWorkspacePage() {
  return <AdminRouteGuard><AdminLayout><Content /></AdminLayout></AdminRouteGuard>;
}

function Content() {
  const [score, setScore] = useState<Score | null>(null);
  const [letter, setLetter] = useState<Letter | null>(null);
  const [leaderboard, setLeaderboard] = useState<Leader[]>([]);
  const [loading, setLoading] = useState(true);
  const [acknowledging, setAcknowledging] = useState(false);

  async function load() {
    setLoading(true);
    const [scoreResult, letterResult] = await Promise.all([
      supabase.rpc('get_my_university_admin_score', { p_university_id: null }),
      supabase.rpc('get_my_university_admin_appointment'),
    ]);
    if (scoreResult.error) toast.error(scoreResult.error.message); else {
      const nextScore = scoreResult.data as Score;
      setScore(nextScore);
      if (nextScore?.university_id) {
        const leaders = await supabase.rpc('get_university_admin_leaderboard', { p_university_id: nextScore.university_id });
        if (!leaders.error) setLeaderboard((leaders.data || []) as Leader[]);
      }
    }
    if (!letterResult.error) setLetter(letterResult.data as Letter);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  async function acknowledge() {
    if (!letter?.letter_id) return;
    setAcknowledging(true);
    const { error } = await supabase.rpc('acknowledge_university_admin_appointment', { p_letter_id: letter.letter_id });
    setAcknowledging(false);
    if (error) toast.error(error.message); else { toast.success('Appointment acknowledged.'); await load(); }
  }

  function copy(text: string) { void navigator.clipboard.writeText(text).then(() => toast.success('Copied.')); }

  return <div className="mx-auto w-full max-w-6xl space-y-5 p-4 sm:p-6">
    <div className="flex items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">University Admin workspace</p><h1 className="mt-2 font-display text-2xl font-bold sm:text-3xl">Your campus impact</h1><p className="mt-1 text-sm text-muted-foreground">A private workspace for your appointment, official link, score, and duties.</p></div><Button variant="outline" onClick={() => void load()} disabled={loading}><Loader2 className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</Button></div>
    {loading ? <Card><CardContent className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></CardContent></Card> : <>
      {letter?.letter_id && <Card className="border-primary/20 bg-primary/5"><CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" />Official appointment</CardTitle></CardHeader><CardContent className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold">{letter.title || 'University Administrator'}</p><p className="text-xs text-muted-foreground">{letter.document_reference} · issued {letter.issued_at ? new Date(letter.issued_at).toLocaleDateString('en-GH') : 'recently'}</p></div><Badge variant="outline" className="capitalize">{letter.status}</Badge></div><p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{letter.letter_body}</p>{letter.status === 'issued' && <Button className="min-h-11" onClick={() => void acknowledge()} disabled={acknowledging}><CheckCircle2 className="mr-2 h-4 w-4" />{acknowledging ? 'Acknowledging…' : 'Acknowledge appointment'}</Button>}</CardContent></Card>}
      {score ? <><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric icon={Trophy} label="Qualified registrations" value={score.qualified_registrations} /><Metric icon={Gift} label="Students helped" value={score.students} /><Metric icon={ShieldCheck} label="Vendors helped" value={score.vendors} /><Metric icon={Award} label="This month" value={score.current_month} /></div><Card><CardContent className="p-5"><div className="flex items-start gap-3"><Award className="mt-1 h-6 w-6 text-amber-500" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-bold">{score.achievement}</p><p className="text-sm text-muted-foreground">{score.message}</p></div><span className="text-sm font-bold text-primary">{score.progress_to_next_milestone}%</span></div><div className="mt-3 h-3 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${score.progress_to_next_milestone}%` }} /></div><p className="mt-2 text-xs text-muted-foreground">Next milestone: {score.next_milestone} qualified registrations · monthly rank #{score.monthly_rank}</p></div></div></CardContent></Card><div className="grid gap-5 lg:grid-cols-2"><Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><BarChart3 className="h-5 w-5 text-primary" />Campus leaderboard</CardTitle></CardHeader><CardContent className="space-y-2">{leaderboard.length === 0 ? <p className="text-sm text-muted-foreground">Your leaderboard will appear after more administrators join your university.</p> : leaderboard.map((leader) => <div key={leader.rank} className={`flex items-center justify-between rounded-xl border p-3 text-sm ${leader.is_me ? 'border-primary/40 bg-primary/5' : ''}`}><span className="font-semibold">#{leader.rank} {leader.name} {leader.is_me && <span className="text-primary">(you)</span>}</span><span className="font-bold">{leader.qualified_registrations}</span></div>)}</CardContent></Card><Card><CardHeader><CardTitle className="text-base">How to earn a verified score</CardTitle></CardHeader><CardContent className="space-y-2 text-sm text-muted-foreground"><p>Share your official administrator registration link with genuine students and vendors in your assigned university.</p><p>Only completed, verified registrations count. Clicks, duplicates, self-referrals, and unverified accounts do not count.</p><p>Never ask for passwords, payment PINs, private documents outside UniEco forms, or unofficial fees.</p></CardContent></Card></div></> : <Card><CardContent className="p-10 text-center"><ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground/50" /><p className="mt-3 font-semibold">No active administrator appointment found</p><p className="mt-1 text-sm text-muted-foreground">Your approved appointment will appear here after the Super Admin completes review.</p></CardContent></Card>}
    </>}
  </div>;
}

function Metric({ icon: Icon, label, value }: { icon: typeof Trophy; label: string; value: number }) {
  return <Card><CardContent className="flex items-center gap-3 p-4"><div className="rounded-xl bg-primary/10 p-2.5 text-primary"><Icon className="h-5 w-5" /></div><div><p className="text-2xl font-bold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div></CardContent></Card>;
}
