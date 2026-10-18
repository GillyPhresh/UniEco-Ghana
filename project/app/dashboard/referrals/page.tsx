'use client';

import { useEffect, useState } from 'react';
import { RouteGuard } from '@/lib/auth/route-guard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Gift, Copy, Share2, Loader2 } from 'lucide-react';

type ReferralHistory = { created_at: string; referred_name: string; registration_status: string; reward_amount: number | null; reward_status: string | null };
type Summary = { code: string | null; successful_referrals: number; pending_amount: number; available_amount: number; paid_amount: number; total_earned: number; minimum_payout: number; history: ReferralHistory[] };

export default function StudentReferralsPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    fetch('/api/student-referrals/me', { cache: 'no-store' }).then(async (response) => {
      const body = await response.json() as { summary?: Summary; referralLink?: string | null; error?: string };
      if (!response.ok) throw new Error(body.error || 'Referral information is unavailable.');
      setSummary(body.summary || null);
      setLink(body.referralLink || null);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Referral information is unavailable.'));
  }, []);

  const copyLink = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };
  const shareLink = async () => {
    if (!link) return;
    if (navigator.share) await navigator.share({ title: 'Join UniEco Ghana', text: 'Join UniEco Ghana with my referral link.', url: link });
    else await copyLink();
  };
  const money = (value: number) => `GH₵${Number(value || 0).toFixed(2)}`;

  return <RouteGuard requireAuth><main className="min-h-screen bg-background pb-20"><div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
    <header><h1 className="font-display text-2xl font-bold">Invite students</h1><p className="mt-1 text-sm text-muted-foreground">Earn GH₵2 for each eligible student who completes the GH₵10 registration. One-level referrals; terms apply.</p></header>
    {error && <Card><CardContent className="p-5 text-sm text-destructive">{error}</CardContent></Card>}
    {!summary && !error && <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/>Loading your referral information…</div>}
    {summary && <>
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Gift className="h-5 w-5 text-primary"/>My referral link</CardTitle></CardHeader><CardContent className="space-y-3">
        {link ? <><div className="break-all rounded-md bg-muted px-3 py-2 text-sm">{link}</div><div className="flex gap-2"><Button onClick={copyLink} variant="outline"><Copy className="mr-2 h-4 w-4"/>{copied ? 'Copied' : 'Copy link'}</Button><Button onClick={shareLink}><Share2 className="mr-2 h-4 w-4"/>Share</Button></div></> : <p className="text-sm text-muted-foreground">Your unique referral link will be available after your registration payment is confirmed.</p>}
      </CardContent></Card>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Metric label="Successful referrals" value={String(summary.successful_referrals)} />
        <Metric label="Pending rewards" value={money(summary.pending_amount)} />
        <Metric label="Settled rewards" value={money(summary.available_amount)} />
        <Metric label="Total earned" value={money(summary.total_earned)} />
      </div>
      <Card><CardHeader><CardTitle>Referral history</CardTitle></CardHeader><CardContent>{summary.history.length ? <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead><tr className="border-b text-muted-foreground"><th className="p-2">Date</th><th className="p-2">Student</th><th className="p-2">Registration</th><th className="p-2">Reward</th><th className="p-2">Status</th></tr></thead><tbody>{summary.history.map((item, index) => <tr key={`${item.created_at}-${index}`} className="border-b last:border-0"><td className="p-2">{new Date(item.created_at).toLocaleDateString()}</td><td className="p-2">{item.referred_name}</td><td className="p-2">{item.registration_status === 'paid' ? 'Successful' : 'Pending'}</td><td className="p-2">{item.reward_amount == null ? '—' : money(item.reward_amount)}</td><td className="p-2 capitalize">{item.reward_status?.replaceAll('_',' ') || 'Pending payment'}</td></tr>)}</tbody></table></div> : <p className="text-sm text-muted-foreground">No referrals yet.</p>}</CardContent></Card>
      <Card><CardHeader><CardTitle>Reward payout</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Rewards are recorded securely after the seven-day settlement period. Withdrawals and Mobile Money payouts are not available yet because the verified payout workflow is still being built.</p></CardContent></Card>
      <Card><CardHeader><CardTitle>Referral terms</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground"><ul className="list-disc space-y-1 pl-5"><li>GH₵2 per eligible referred student.</li><li>The student must complete the registration payment and student verification.</li><li>The reward settles seven days after both requirements are confirmed.</li><li>Self-referrals and duplicate or fraudulent registrations are excluded.</li><li>Withdrawals and payout destinations are currently disabled.</li></ul></CardContent></Card>
    </>}
  </div></main></RouteGuard>;
}

function Metric({ label, value }: { label: string; value: string }) { return <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></CardContent></Card>; }
