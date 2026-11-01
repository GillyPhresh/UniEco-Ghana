'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminLayout, AdminRouteGuard } from '@/components/admin/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Gift, Copy, Loader2, RefreshCw, Users, GraduationCap, Store, CircleCheck, Clock3 } from 'lucide-react';

type Referrer = {
  audience: 'student' | 'vendor';
  user_id: string;
  referrer_name: string;
  referrer_email: string;
  code: string;
  referral_link: string;
  qualified_referrals: number;
  pending_referrals: number;
  qualified_this_month: number;
  pending_amount: number;
  payout_pending_amount: number;
  available_amount: number;
  paid_amount: number;
};

type ReferralActivity = {
  id: string;
  audience: 'student' | 'vendor';
  created_at: string;
  qualified_at: string | null;
  status: string;
  referrer_name: string;
  referred_name: string;
  code: string;
  reward_amount: number | null;
  currency: string | null;
  reward_status: string | null;
  payment_reference: string | null;
};

type Payout = { created_at: string; reference: string; amount: number; currency: string; status: string; user_id: string; user_name: string };
type Overview = {
  student_referrers: number;
  vendor_referrers: number;
  qualified_student_referrals: number;
  qualified_vendor_referrals: number;
  pending_rewards: number;
  payout_pending_rewards: number;
  available_rewards: number;
  paid_rewards: number;
  reversed_rewards: number;
  reconciliation_rewards: number;
  failed_rewards: number;
  payouts_pending: number;
  payouts_failed: number;
  referrers_count: number;
  referrers: Referrer[];
  recent_referrals: ReferralActivity[];
  payout_queue: Payout[];
};

const money = (value: number | null | undefined) => `GH₵${Number(value || 0).toFixed(2)}`;
const formatDate = (value: string) => new Date(value).toLocaleString('en-GH', { dateStyle: 'medium', timeStyle: 'short' });

export default function AdminReferralsPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ page: String(page) });
      if (search.trim()) query.set('q', search.trim());
      const response = await fetch(`/api/admin/student-referrals?${query.toString()}`, { cache: 'no-store' });
      const body = await response.json() as { overview?: Overview; error?: string };
      if (!response.ok || !body.overview) throw new Error(body.error || 'Referral operations are unavailable.');
      setOverview(body.overview);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Referral operations are unavailable.');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    const timeout = window.setTimeout(() => { void refresh(); }, 250);
    return () => window.clearTimeout(timeout);
  }, [refresh]);

  const copyLink = async (referrer: Referrer) => {
    try {
      await navigator.clipboard.writeText(referrer.referral_link);
      setCopied(referrer.code);
      window.setTimeout(() => setCopied((current) => current === referrer.code ? null : current), 1800);
    } catch {
      setError('Could not copy this link. Select and copy the link text instead.');
    }
  };

  const studentReferrals = overview?.qualified_student_referrals || 0;
  const vendorReferrals = overview?.qualified_vendor_referrals || 0;
  const cards = overview ? [
    { label: 'Student referral accounts', value: overview.student_referrers, icon: GraduationCap },
    { label: 'Vendor referral accounts', value: overview.vendor_referrers, icon: Store },
    { label: 'Qualified registrations', value: studentReferrals + vendorReferrals, icon: CircleCheck },
    { label: 'Rewards pending', value: money(overview.pending_rewards), icon: Clock3 },
    { label: 'Awaiting payout', value: money(overview.payout_pending_rewards), icon: Clock3 },
    { label: 'Rewards available', value: money(overview.available_rewards), icon: Gift },
    { label: 'Rewards marked paid', value: money(overview.paid_rewards), icon: Users },
    { label: 'Rewards needing review', value: money(overview.reconciliation_rewards), icon: Clock3 },
    { label: 'Failed rewards', value: money(overview.failed_rewards), icon: CircleCheck },
  ] : [];

  return <AdminRouteGuard><AdminLayout><main className="mx-auto max-w-7xl space-y-5 p-4 pb-24 sm:p-6">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Management · Growth</p>
        <h1 className="mt-1 font-display text-2xl font-bold sm:text-3xl">Referrals &amp; rewards</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">One view of student and vendor invite links, qualified registrations, and the GH₵2 reward ledger.</p>
      </div>
      <Button variant="outline" onClick={() => void refresh()} disabled={loading} className="min-h-11 w-full sm:w-auto">
        <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh records
      </Button>
    </header>

    {error && <Card className="border-destructive/30"><CardContent className="p-4 text-sm text-destructive">{error}</CardContent></Card>}
    {loading && !overview && <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/>Loading referral records…</div>}

    {overview && <>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6" aria-label="Referral totals">
        {cards.map(({ label, value, icon: Icon }) => <Card key={label}><CardContent className="flex min-h-[104px] items-start gap-3 p-4">
          <span className="rounded-xl bg-primary/10 p-2 text-primary"><Icon className="h-4 w-4"/></span>
          <div className="min-w-0"><p className="text-xs leading-4 text-muted-foreground">{label}</p><p className="mt-1 break-words text-lg font-bold">{value}</p></div>
        </CardContent></Card>)}
      </section>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-lg">Referral accounts and monthly performance</CardTitle><p className="text-sm text-muted-foreground">One row per audience link. Some student vendors may have separate student and vendor links.</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Input aria-label="Search referral accounts" placeholder="Search name, email, or code" value={search} onChange={(event) => { setSearch(event.target.value.slice(0, 100)); setPage(0); }} className="min-h-11 w-full sm:max-w-md" />
            <p className="text-xs text-muted-foreground">{overview.referrers_count ? `Showing ${page * pageSize + 1}–${Math.min((page + 1) * pageSize, overview.referrers_count)} of ${overview.referrers_count}` : '0 matching accounts'}</p>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          {overview.referrers.length ? <>
            <div className="space-y-3 md:hidden">
              {overview.referrers.map((row) => <article key={`${row.audience}-${row.user_id}`} className="rounded-xl border border-border bg-background p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><p className="truncate font-semibold">{row.referrer_name}</p><p className="break-all text-xs text-muted-foreground">{row.referrer_email}</p></div>
                  <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold capitalize text-primary">{row.audience}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <Mini label="Qualified" value={String(row.qualified_referrals)}/><Mini label="This month" value={String(row.qualified_this_month)}/>
                  <Mini label="In progress" value={String(row.pending_referrals)}/><Mini label="Pending reward" value={money(row.pending_amount)}/>
                  <Mini label="Awaiting payout" value={money(row.payout_pending_amount)}/>
                  <Mini label="Available" value={money(row.available_amount)}/><Mini label="Paid" value={money(row.paid_amount)}/>
                </div>
                <p className="mt-3 text-xs font-medium text-muted-foreground">Code <code className="ml-1 rounded bg-muted px-1.5 py-0.5 text-foreground">{row.code}</code></p>
                <p className="mt-2 break-all rounded-lg bg-muted/70 p-2 text-xs text-muted-foreground">{row.referral_link}</p>
                <Button variant="outline" onClick={() => void copyLink(row)} className="mt-3 min-h-11 w-full"><Copy className="mr-2 h-4 w-4"/>{copied === row.code ? 'Copied link' : 'Copy invite link'}</Button>
              </article>)}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[1150px] text-left text-sm">
                <thead><tr className="border-b text-xs text-muted-foreground"><th className="p-3">Referrer</th><th className="p-3">Audience / code</th><th className="p-3">Qualified</th><th className="p-3">This month</th><th className="p-3">In progress</th><th className="p-3">Pending</th><th className="p-3">Awaiting payout</th><th className="p-3">Available</th><th className="p-3">Paid</th><th className="p-3">Link</th></tr></thead>
                <tbody>{overview.referrers.map((row) => <tr className="border-b last:border-0" key={`${row.audience}-${row.user_id}`}>
                  <td className="p-3"><p className="font-medium">{row.referrer_name}</p><p className="text-xs text-muted-foreground">{row.referrer_email}</p></td>
                  <td className="p-3"><span className="capitalize">{row.audience}</span><p><code className="text-xs text-muted-foreground">{row.code}</code></p></td>
                  <td className="p-3 font-semibold">{row.qualified_referrals}</td><td className="p-3">{row.qualified_this_month}</td><td className="p-3">{row.pending_referrals}</td>
                  <td className="p-3">{money(row.pending_amount)}</td><td className="p-3">{money(row.payout_pending_amount)}</td><td className="p-3">{money(row.available_amount)}</td><td className="p-3">{money(row.paid_amount)}</td>
                  <td className="p-3"><Button variant="outline" size="sm" onClick={() => void copyLink(row)}><Copy className="mr-2 h-3.5 w-3.5"/>{copied === row.code ? 'Copied' : 'Copy link'}</Button></td>
                </tr>)}</tbody>
              </table>
            </div>
          </> : <p className="py-6 text-sm text-muted-foreground">No active student or vendor referral links have been issued yet.</p>}
          {overview.referrers_count > pageSize && <div className="mt-4 flex items-center justify-between gap-3 border-t pt-4">
            <Button variant="outline" disabled={page === 0 || loading} onClick={() => setPage((value) => Math.max(0, value - 1))} className="min-h-10">Previous</Button>
            <span className="text-xs text-muted-foreground">Page {page + 1} of {Math.ceil(overview.referrers_count / pageSize)}</span>
            <Button variant="outline" disabled={(page + 1) * pageSize >= overview.referrers_count || loading} onClick={() => setPage((value) => value + 1)} className="min-h-10">Next</Button>
          </div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-lg">Recent referral registrations</CardTitle><p className="text-sm text-muted-foreground">Attribution and rewards are tied to verified registration payment records. Incomplete referrals do not count as earnings.</p></CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          {overview.recent_referrals.length ? <>
            <div className="space-y-3 lg:hidden">
              {overview.recent_referrals.map((row) => <article key={row.id} className="rounded-xl border border-border p-4">
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-semibold">{row.referred_name}</p><p className="text-xs text-muted-foreground">Invited by {row.referrer_name}</p></div><span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs capitalize">{row.audience}</span></div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-muted px-2.5 py-1 capitalize">{row.status.replaceAll('_', ' ')}</span>{row.reward_status && <span className="rounded-full bg-primary/10 px-2.5 py-1 capitalize text-primary">Reward {row.reward_status.replaceAll('_', ' ')}</span>}</div>
                <p className="mt-2 text-xs text-muted-foreground">{formatDate(row.created_at)} · Code {row.code}</p>
                <div className="mt-2 flex items-center justify-between gap-3 text-sm"><span className="break-all text-xs text-muted-foreground">{row.payment_reference || 'Payment not yet qualified'}</span><span className="shrink-0 font-semibold">{row.reward_amount == null ? '—' : money(row.reward_amount)}</span></div>
              </article>)}
            </div>
            <div className="hidden overflow-x-auto lg:block"><table className="w-full min-w-[900px] text-left text-sm"><thead><tr className="border-b text-xs text-muted-foreground"><th className="p-3">Date</th><th className="p-3">Audience</th><th className="p-3">Referrer</th><th className="p-3">New member</th><th className="p-3">Code</th><th className="p-3">Registration</th><th className="p-3">Reward</th><th className="p-3">Payment ref.</th></tr></thead><tbody>{overview.recent_referrals.map((row) => <tr className="border-b last:border-0" key={row.id}><td className="p-3 whitespace-nowrap">{formatDate(row.created_at)}</td><td className="p-3 capitalize">{row.audience}</td><td className="p-3">{row.referrer_name}</td><td className="p-3">{row.referred_name}</td><td className="p-3"><code className="text-xs">{row.code}</code></td><td className="p-3 capitalize">{row.status.replaceAll('_', ' ')}</td><td className="p-3">{row.reward_amount == null ? '—' : <>{money(row.reward_amount)} · {row.reward_status?.replaceAll('_', ' ')}</>}</td><td className="p-3 font-mono text-xs">{row.payment_reference || '—'}</td></tr>)}</tbody></table></div>
          </> : <p className="py-6 text-sm text-muted-foreground">No referral registrations have been recorded yet.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-lg">Payout tracking</CardTitle></CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          <div className="mb-3 flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-muted px-2.5 py-1">Pending / review: {overview.payouts_pending}</span><span className="rounded-full bg-muted px-2.5 py-1">Failed: {overview.payouts_failed}</span><span className="rounded-full bg-muted px-2.5 py-1">Reversed rewards: {overview.reversed_rewards}</span></div>
          {overview.payout_queue.length ? <div className="space-y-3">{overview.payout_queue.map((row) => <article key={row.reference} className="flex flex-col gap-2 rounded-xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">{row.user_name}</p><p className="break-all font-mono text-xs text-muted-foreground">{row.reference}</p><p className="mt-1 text-xs text-muted-foreground">{formatDate(row.created_at)}</p></div><div className="flex items-center justify-between gap-3 sm:justify-end"><span className="rounded-full bg-muted px-2.5 py-1 text-xs capitalize">{row.status.replaceAll('_', ' ')}</span><span className="font-semibold">{money(row.amount)}</span></div></article>)}</div> : <p className="text-sm text-muted-foreground">No student payout requests are in the queue. Vendor rewards are tracked above; vendor payout transfers have not been enabled.</p>}
        </CardContent>
      </Card>
      <p className="text-xs leading-5 text-muted-foreground">Referral rewards are a ledger balance, not an automatic transfer. Student and vendor conversions are qualified from their respective registration/payment records. Payouts remain manual and must be reconciled against the transfer receipt before a reward is marked paid.</p>
    </>}
  </main></AdminLayout></AdminRouteGuard>;
}

function Mini({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-muted/60 px-3 py-2"><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-0.5 font-semibold">{value}</p></div>;
}
