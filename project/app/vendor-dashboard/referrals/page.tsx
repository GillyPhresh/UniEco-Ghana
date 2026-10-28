'use client';

import { useEffect, useState } from 'react';
import { VendorDashboardLayout, VendorRouteGuard } from '@/components/vendor/vendor-dashboard-layout';
import { useVendor } from '@/hooks/use-vendor';
import { useAuth } from '@/lib/auth/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Copy, Gift, Loader2, MessageCircle, Share2, TrendingUp } from 'lucide-react';

type ReferralHistory = { created_at: string; referred_name: string; registration_status: string; reward_amount: number | null; reward_status: string | null };
type Summary = { code: string | null; successful_referrals: number; pending_amount: number; available_amount: number; paid_amount: number; total_earned: number; minimum_payout: number; history: ReferralHistory[] };

export default function VendorReferralsPage() {
  const { vendor } = useVendor();
  const { user } = useAuth();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  useEffect(() => {
    fetch('/api/referrals/me', { cache: 'no-store' }).then(async (response) => {
      const body = await response.json() as { summary?: Summary; referralCode?: string | null; referralLink?: string | null; error?: string };
      if (!response.ok) throw new Error(body.error || 'Referral information is unavailable.');
      setSummary(body.summary || null);
      setCode(body.referralCode || body.summary?.code || null);
      setLink(body.referralLink || null);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Referral information is unavailable.'));
  }, []);

  const copy = async (value: string | null, kind: 'link' | 'code') => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      if (kind === 'link') setCopied(true); else setCodeCopied(true);
      window.setTimeout(() => kind === 'link' ? setCopied(false) : setCodeCopied(false), 1800);
    } catch { setError('Could not copy. Press and hold the link to copy it.'); }
  };
  const share = async () => {
    if (!link) return;
    try {
      if (navigator.share) await navigator.share({ title: 'Join UniEco Ghana as a vendor', text: 'Register your business on UniEco Ghana with my vendor link.', url: link });
      else await copy(link, 'link');
    } catch { /* Mobile share sheets may be dismissed by the user. */ }
  };
  const whatsapp = () => link && window.open(`https://wa.me/?text=${encodeURIComponent(`Register your business on UniEco Ghana: ${link}`)}`, '_blank', 'noopener,noreferrer');
  const money = (value: number) => `GH₵${Number(value || 0).toFixed(2)}`;

  return <VendorRouteGuard><VendorDashboardLayout vendorName={vendor?.business_name || 'Your business'} isVerified={Boolean(vendor?.is_verified)} subscriptionStatus={user?.vendorProfile?.subscription_status || 'none'}>
    <main className="mx-auto max-w-3xl space-y-5 pb-24">
      <header><p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Vendor referrals</p><h1 className="mt-2 text-2xl font-bold">Grow your business network</h1><p className="mt-1 text-sm text-muted-foreground">Invite another genuine vendor and earn GH₵2 when their registration payment is confirmed.</p></header>
      {error && <Card><CardContent className="p-4 text-sm text-destructive">{error}</CardContent></Card>}
      {!summary && !error && <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/>Loading your vendor referral link...</div>}
      {summary && <>
        <Card className="overflow-hidden border-primary/20"><CardHeader className="bg-primary/5"><CardTitle className="flex items-center gap-2"><Gift className="h-5 w-5 text-primary"/>Your vendor invite</CardTitle></CardHeader><CardContent className="space-y-4 p-4 sm:p-6">
          {link ? <><div className="rounded-xl border border-primary/20 bg-primary/5 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Share code</p><div className="mt-1 flex items-center justify-between gap-3"><code className="text-lg font-bold tracking-wide text-primary">{code}</code><Button onClick={() => copy(code, 'code')} variant="outline" size="sm"><Copy className="mr-2 h-4 w-4"/>{codeCopied ? 'Copied' : 'Copy code'}</Button></div></div><div className="break-all rounded-xl bg-muted px-3 py-3 text-sm">{link}</div><div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap"><Button onClick={() => copy(link, 'link')} variant="outline" className="min-h-11"><Copy className="mr-2 h-4 w-4"/>{copied ? 'Copied' : 'Copy link'}</Button><Button onClick={share} className="min-h-11"><Share2 className="mr-2 h-4 w-4"/>Share invite</Button><Button onClick={whatsapp} variant="outline" className="min-h-11 border-success/30 text-success"><MessageCircle className="mr-2 h-4 w-4"/>WhatsApp</Button></div></> : <p className="text-sm text-muted-foreground">Your vendor referral link appears after your vendor registration payment is confirmed. It will also be sent through email and push notification when this device is subscribed.</p>}
        </CardContent></Card>
        <div className="grid gap-3 sm:grid-cols-2"><Metric label="Successful vendors" value={String(summary.successful_referrals)}/><Metric label="Rewards in progress" value={money(summary.pending_amount)}/><Metric label="Rewards settled" value={money(summary.available_amount)}/><Metric label="Total earned" value={money(summary.total_earned)}/></div>
        <Card><CardHeader><CardTitle>How it works</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground"><ul className="list-disc space-y-2 pl-5"><li>Share this vendor link with a real business owner.</li><li>The link opens the business registration flow and keeps the referral audience as vendors.</li><li>GH₵2 is recorded only after a valid vendor registration payment is confirmed.</li><li>Self-referrals, duplicate accounts, and suspicious registrations do not qualify.</li><li>Rewards remain pending during the seven-day review period.</li></ul></CardContent></Card>
        <Card className="border-primary/20 bg-primary/5"><CardContent className="flex items-start gap-3 p-4"><TrendingUp className="mt-0.5 h-5 w-5 shrink-0 text-primary"/><p className="text-sm text-muted-foreground">Your invite link is personal to your business account. Keep it private and share it directly with vendors you know.</p></CardContent></Card>
      </>}
    </main>
  </VendorDashboardLayout></VendorRouteGuard>;
}

function Metric({ label, value }: { label: string; value: string }) { return <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></CardContent></Card>; }
