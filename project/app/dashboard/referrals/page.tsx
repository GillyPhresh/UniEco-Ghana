'use client';

import { useEffect, useState } from 'react';
import { RouteGuard } from '@/lib/auth/route-guard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Gift, Copy, Share2, MessageCircle, Loader2, TrendingUp } from 'lucide-react';

type ReferralHistory = { created_at: string; referred_name: string; registration_status: string; reward_amount: number | null; reward_status: string | null };
type Summary = { code: string | null; successful_referrals: number; pending_amount: number; available_amount: number; paid_amount: number; total_earned: number; minimum_payout: number; history: ReferralHistory[] };
const CURRENCY = 'GH\u20B5';

export default function StudentReferralsPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  useEffect(() => {
    fetch('/api/student-referrals/me', { cache: 'no-store' }).then(async (response) => {
      const body = await response.json() as { summary?: Summary; referralCode?: string | null; referralLink?: string | null; error?: string };
      if (!response.ok) throw new Error(body.error || 'Referral information is unavailable.');
      setSummary(body.summary || null);
      setCode(body.referralCode || body.summary?.code || null);
      setLink(body.referralLink || null);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Referral information is unavailable.'));
  }, []);

  const copyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch { setError('Could not copy. Press and hold the link to copy it.'); }
  };
  const copyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCodeCopied(true);
      window.setTimeout(() => setCodeCopied(false), 1800);
    } catch { setError('Could not copy the code. Press and hold it to copy.'); }
  };
  const shareLink = async () => {
    if (!link) return;
    try {
      if (navigator.share) await navigator.share({ title: 'Join UniEco Ghana', text: 'Join UniEco Ghana with my referral link.', url: link });
      else await copyLink();
    } catch { /* Mobile share sheets may be dismissed by the user. */ }
  };
  const shareOnWhatsApp = () => {
    if (!link) return;
    const message = `Join UniEco Ghana with me. Discover student benefits and opportunities: ${link}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };
  const money = (value: number) => `${CURRENCY}${Number(value || 0).toFixed(2)}`;

  return <RouteGuard requireAuth><main className="min-h-screen bg-background pb-20"><div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
    <header><h1 className="font-display text-2xl font-bold">Grow UniEco with your network</h1><p className="mt-1 text-sm text-muted-foreground">Share UniEco Ghana with students you know and earn {CURRENCY}2 for every eligible registration. The more you share, the more you can earn.</p></header>
    {error && <Card><CardContent className="p-5 text-sm text-destructive">{error}</CardContent></Card>}
    {!summary && !error && <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/>Loading your referral information...</div>}
    {summary && <>
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Gift className="h-5 w-5 text-primary"/>My student referral link</CardTitle></CardHeader><CardContent className="space-y-3">
        {link ? <><div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your referral code</p><div className="mt-1 flex flex-wrap items-center justify-between gap-2"><code className="text-lg font-bold tracking-wide text-primary">{code}</code><Button onClick={copyCode} variant="outline" size="sm"><Copy className="mr-2 h-4 w-4"/>{codeCopied ? 'Copied' : 'Copy code'}</Button></div></div><div className="break-all rounded-md bg-muted px-3 py-2 text-sm">{link}</div><div className="flex flex-wrap gap-2"><Button onClick={copyLink} variant="outline"><Copy className="mr-2 h-4 w-4"/>{copied ? 'Copied' : 'Copy link'}</Button><Button onClick={shareLink}><Share2 className="mr-2 h-4 w-4"/>Share and grow</Button><Button onClick={shareOnWhatsApp} variant="outline" className="border-success/30 text-success hover:bg-success/10"><MessageCircle className="mr-2 h-4 w-4"/>WhatsApp</Button></div></> : <p className="text-sm text-muted-foreground">Complete your paid student registration first. Your personal referral code and sharing link will then appear here and be sent by email.</p>}
      </CardContent></Card>
      <Card className="border-primary/20 bg-primary/5"><CardContent className="flex items-start gap-3 p-4"><TrendingUp className="mt-0.5 h-5 w-5 shrink-0 text-primary"/><div><p className="font-semibold">Your UniEco impact is growing</p><p className="mt-1 text-sm text-muted-foreground">You have {summary.successful_referrals} successful {summary.successful_referrals === 1 ? 'referral' : 'referrals'}. Every genuine student you introduce helps expand UniEco across Ghana and moves your rewards forward.</p></div></CardContent></Card>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Metric label="Successful referrals" value={String(summary.successful_referrals)} />
        <Metric label="Rewards in progress" value={money(summary.pending_amount)} />
        <Metric label="Rewards settled" value={money(summary.available_amount)} />
        <Metric label="Total earned" value={money(summary.total_earned)} />
      </div>
      <Card><CardHeader><CardTitle>Referral history</CardTitle></CardHeader><CardContent>{summary.history.length ? <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead><tr className="border-b text-muted-foreground"><th className="p-2">Date</th><th className="p-2">Student</th><th className="p-2">Registration</th><th className="p-2">Reward</th><th className="p-2">Status</th></tr></thead><tbody>{summary.history.map((item, index) => <tr key={`${item.created_at}-${index}`} className="border-b last:border-0"><td className="p-2">{new Date(item.created_at).toLocaleDateString()}</td><td className="p-2">{item.referred_name}</td><td className="p-2">{item.registration_status === 'paid' ? 'Successful' : 'In progress'}</td><td className="p-2">{item.reward_amount == null ? '-' : money(item.reward_amount)}</td><td className="p-2 capitalize">{item.reward_status?.replaceAll('_',' ') || 'Awaiting confirmation'}</td></tr>)}</tbody></table></div> : <p className="text-sm text-muted-foreground">Your first share can be the start of something bigger. Invite a student today and watch your UniEco impact grow.</p>}</CardContent></Card>
      <Card><CardHeader><CardTitle>Keep sharing, keep growing</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Every eligible referral helps another student discover UniEco Ghana and adds {CURRENCY}2 to your reward balance. Rewards are recorded securely and become settled after seven days. Mobile Money withdrawals will open once the verified payout workflow is ready.</p></CardContent></Card>
      <Card><CardHeader><CardTitle>How your rewards grow</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground"><ul className="list-disc space-y-1 pl-5"><li>Share your link with classmates, friends, and students across Ghana.</li><li>Earn {CURRENCY}2 for each eligible student who completes the {CURRENCY}10 registration and student verification.</li><li>Each reward settles seven days after both requirements are confirmed.</li><li>There is no limit to the number of genuine students you can invite.</li><li>Self-referrals, duplicates, and fraudulent registrations do not qualify.</li></ul></CardContent></Card>
    </>}
  </div></main></RouteGuard>;
}

function Metric({ label, value }: { label: string; value: string }) { return <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></CardContent></Card>; }
