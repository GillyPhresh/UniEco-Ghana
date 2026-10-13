'use client';

import { useEffect, useState } from 'react';
import { AdminLayout, AdminRouteGuard } from '@/components/admin/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Gift, Loader2 } from 'lucide-react';

type Overview = {
  referrers: number; qualified_referrals: number; rewards_pending: number; rewards_available: number; rewards_paid: number;
  payouts_pending: number; payouts_failed: number; rewards_reversed: number;
  recent_rewards: Array<{ created_at: string; referrer: string; amount: number; currency: string; status: string; university_id: string }>;
  payout_queue: Array<{ created_at: string; reference: string; amount: number; currency: string; status: string; user_id: string }>;
};

export default function AdminReferralsPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch('/api/admin/student-referrals', { cache: 'no-store' }).then(async (response) => {
      const body = await response.json() as { overview?: Overview; error?: string };
      if (!response.ok) throw new Error(body.error || 'Referral operations are unavailable.');
      setOverview(body.overview || null);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Referral operations are unavailable.'));
  }, []);
  const money = (value: number) => `GH₵${Number(value || 0).toFixed(2)}`;
  return <AdminRouteGuard><AdminLayout><div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
    <header className="flex items-center gap-3"><Gift className="h-7 w-7 text-primary"/><div><h1 className="font-display text-2xl font-bold">Student referral operations</h1><p className="text-sm text-muted-foreground">Read-only financial overview. Payment and payout outcomes remain provider/database-authoritative.</p></div></header>
    {error && <Card><CardContent className="p-5 text-sm text-destructive">{error}</CardContent></Card>}
    {!overview && !error && <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/>Loading authoritative totals…</div>}
    {overview && <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Referrers" value={String(overview.referrers)} />
        <Metric label="Successful referrals" value={String(overview.qualified_referrals)} />
        <Metric label="Rewards pending" value={money(overview.rewards_pending)} />
        <Metric label="Rewards available" value={money(overview.rewards_available)} />
        <Metric label="Rewards paid" value={money(overview.rewards_paid)} />
        <Metric label="Payouts pending / review" value={String(overview.payouts_pending)} />
        <Metric label="Failed payouts" value={String(overview.payouts_failed)} />
        <Metric label="Reversed rewards" value={String(overview.rewards_reversed)} />
      </div>
      <Card><CardHeader><CardTitle>Recent reward ledger</CardTitle></CardHeader><CardContent>{overview.recent_rewards.length ? <div className="overflow-x-auto"><table className="w-full min-w-[580px] text-left text-sm"><thead><tr className="border-b text-muted-foreground"><th className="p-2">Date</th><th className="p-2">Referrer</th><th className="p-2">University</th><th className="p-2">Amount</th><th className="p-2">Status</th></tr></thead><tbody>{overview.recent_rewards.map((row) => <tr className="border-b last:border-0" key={`${row.created_at}-${row.university_id}`}><td className="p-2">{new Date(row.created_at).toLocaleString()}</td><td className="p-2">{row.referrer}</td><td className="p-2">{row.university_id}</td><td className="p-2">{money(row.amount)}</td><td className="p-2 capitalize">{row.status.replaceAll('_',' ')}</td></tr>)}</tbody></table></div> : <p className="text-sm text-muted-foreground">No reward records.</p>}</CardContent></Card>
      <Card><CardHeader><CardTitle>Payout queue</CardTitle></CardHeader><CardContent>{overview.payout_queue.length ? <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead><tr className="border-b text-muted-foreground"><th className="p-2">Date</th><th className="p-2">Reference</th><th className="p-2">Amount</th><th className="p-2">Status</th></tr></thead><tbody>{overview.payout_queue.map((row) => <tr className="border-b last:border-0" key={row.reference}><td className="p-2">{new Date(row.created_at).toLocaleString()}</td><td className="p-2">{row.reference}</td><td className="p-2">{money(row.amount)}</td><td className="p-2 capitalize">{row.status.replaceAll('_',' ')}</td></tr>)}</tbody></table></div> : <p className="text-sm text-muted-foreground">No payout requests.</p>}<p className="mt-3 text-xs text-muted-foreground">Payout transfer initiation and verification are not available until the trusted transfer adapter and destination-verification workflow are implemented and approved.</p></CardContent></Card>
    </>}
  </div></AdminLayout></AdminRouteGuard>;
}

function Metric({ label, value }: { label: string; value: string }) { return <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></CardContent></Card>; }
