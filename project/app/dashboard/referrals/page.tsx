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
  const [destinationName, setDestinationName] = useState('');
  const [destinationPhone, setDestinationPhone] = useState('');
  const [destinationProvider, setDestinationProvider] = useState('mtn');
  const [destinationMessage, setDestinationMessage] = useState<string | null>(null);
  const [savingDestination, setSavingDestination] = useState(false);
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
  const saveDestination = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavingDestination(true);
    setDestinationMessage(null);
    try {
      const response = await fetch('/api/student-referrals/me', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountHolderName: destinationName, mobileNumber: destinationPhone, provider: destinationProvider }) });
      const body = await response.json() as { message?: string; error?: string };
      if (!response.ok) throw new Error(body.error || 'Could not save destination.');
      setDestinationMessage(body.message || 'Destination saved.');
      setDestinationName('');
      setDestinationPhone('');
    } catch (reason) {
      setDestinationMessage(reason instanceof Error ? reason.message : 'Could not save destination.');
    } finally { setSavingDestination(false); }
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
        <Metric label="Available rewards" value={money(summary.available_amount)} />
        <Metric label="Total earned" value={money(summary.total_earned)} />
        <Metric label="Paid out" value={money(summary.paid_amount)} />
        <Metric label="Minimum payout" value={money(summary.minimum_payout)} />
      </div>
      {summary.available_amount < summary.minimum_payout && <p className="text-sm text-muted-foreground">You need {money(summary.minimum_payout - summary.available_amount)} more in available rewards before you can request payout.</p>}
      <Card><CardHeader><CardTitle>Referral history</CardTitle></CardHeader><CardContent>{summary.history.length ? <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead><tr className="border-b text-muted-foreground"><th className="p-2">Date</th><th className="p-2">Student</th><th className="p-2">Registration</th><th className="p-2">Reward</th><th className="p-2">Status</th></tr></thead><tbody>{summary.history.map((item, index) => <tr key={`${item.created_at}-${index}`} className="border-b last:border-0"><td className="p-2">{new Date(item.created_at).toLocaleDateString()}</td><td className="p-2">{item.referred_name}</td><td className="p-2">{item.registration_status === 'paid' ? 'Successful' : 'Pending'}</td><td className="p-2">{item.reward_amount == null ? '—' : money(item.reward_amount)}</td><td className="p-2 capitalize">{item.reward_status?.replaceAll('_',' ') || 'Pending payment'}</td></tr>)}</tbody></table></div> : <p className="text-sm text-muted-foreground">No referrals yet.</p>}</CardContent></Card>
      <Card><CardHeader><CardTitle>Mobile Money payout destination</CardTitle></CardHeader><CardContent><form className="grid gap-3 sm:grid-cols-2" onSubmit={saveDestination}><label className="space-y-1 text-sm">Account holder name<input required minLength={2} maxLength={120} value={destinationName} onChange={event=>setDestinationName(event.target.value)} className="block w-full rounded-md border bg-background px-3 py-2" autoComplete="name"/></label><label className="space-y-1 text-sm">Mobile Money number<input required value={destinationPhone} onChange={event=>setDestinationPhone(event.target.value)} className="block w-full rounded-md border bg-background px-3 py-2" placeholder="0241234567" inputMode="tel" autoComplete="tel"/></label><label className="space-y-1 text-sm">Network<select value={destinationProvider} onChange={event=>setDestinationProvider(event.target.value)} className="block w-full rounded-md border bg-background px-3 py-2"><option value="mtn">MTN Mobile Money</option><option value="telecel">Telecel Cash</option><option value="airteltigo">AirtelTigo Money</option></select></label><div className="flex items-end"><Button disabled={savingDestination}>{savingDestination ? 'Saving…' : 'Save destination'}</Button></div>{destinationMessage && <p className="text-sm text-muted-foreground sm:col-span-2" role="status">{destinationMessage}</p>}<p className="text-xs text-muted-foreground sm:col-span-2">UniEco never asks for your MoMo PIN or OTP. Saving a destination does not verify it or initiate a payout.</p></form></CardContent></Card>
      <Card><CardHeader><CardTitle>Referral terms</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground"><ul className="list-disc space-y-1 pl-5"><li>GH₵2 per eligible successful student registration; one referral level only.</li><li>Self-referrals and duplicate, fraudulent, test, or invalid registrations are excluded.</li><li>Rewards become available after the configured settlement period and may be reversed if a payment is invalidated.</li><li>Payout requires a valid, verified destination and the configured minimum threshold; provider fees and processing limits may affect timing.</li><li>Suspicious activity may be reviewed. These programme terms require legal/compliance review before public launch.</li></ul></CardContent></Card>
    </>}
  </div></main></RouteGuard>;
}

function Metric({ label, value }: { label: string; value: string }) { return <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></CardContent></Card>; }
