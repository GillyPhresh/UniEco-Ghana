'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, WalletCards } from 'lucide-react';

type Payout = { created_at: string; amount: number; currency: string; status: string; reference: string; completed_at: string | null };
type Overview = { destination?: { name: string; provider: string; mobile_suffix: string } | null; minimum_payout?: number; payouts?: Payout[] };
const networks = [{ id: 'mtn', label: 'MTN Mobile Money' }, { id: 'telecel', label: 'Telecel Cash' }, { id: 'airteltigo', label: 'AirtelTigo Money' }];
const ghc = (n: number) => `GH₵${Number(n || 0).toFixed(2)}`;

export function ReferralPayoutSettings({ program = 'referrals' }: { program?: 'referrals' | 'university_admin' }) {
  const administrator = program === 'university_admin';
  const [data, setData] = useState<Overview | null>(null);
  const [name, setName] = useState(''); const [mobile, setMobile] = useState(''); const [provider, setProvider] = useState('mtn');
  const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true); const [message, setMessage] = useState('');
  const refresh = useCallback(async () => {
    setLoading(true);
    try { const res = await fetch('/api/referrals/payout-settings', { cache: 'no-store' }); const body = await res.json(); if (!res.ok) throw new Error(body.error || 'Payout setup unavailable.'); setData(body); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Payout setup unavailable.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const save = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/referrals/payout-settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, mobile, provider }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Could not save payout destination.');
      setMessage('Payout destination saved. Only the last four digits are shown here.'); await refresh();
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Could not save payout destination.'); }
    finally { setBusy(false); }
  };
  const minimum = Number(data?.minimum_payout || 10);
  return <Card>
    <CardHeader><CardTitle className="flex items-center gap-2"><WalletCards className="h-5 w-5 text-primary"/>{administrator ? 'Weekly compensation payout setup' : 'Reward payout setup'}</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <p className="text-sm text-muted-foreground">{administrator ? `Add the Ghana Mobile Money account for your university-admin earnings. Each qualified student or vendor registration earns GH₵2. Earnings enter the weekly payout process after the seven-day review period and are paid once the available balance reaches ${ghc(minimum)} and production payouts are enabled.` : `Add the Ghana Mobile Money account where eligible referral rewards may be paid. Weekly processing starts only when available rewards reach ${ghc(minimum)} and production payouts have been enabled. A saved number does not guarantee a payout.`}</p>
      {loading && <p className="text-sm text-muted-foreground">Loading payout setup…</p>}
      {data?.destination && <div className="rounded-lg bg-muted p-3 text-sm">Saved destination: <strong>{data.destination.name}</strong> · {networks.find((n) => n.id === data.destination?.provider)?.label || data.destination.provider} · •••• {data.destination.mobile_suffix}</div>}
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={save}>
        <label className="grid gap-1 text-sm">Account holder name<input required minLength={2} maxLength={120} autoComplete="name" className="min-h-11 rounded-md border bg-background px-3" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name registered with the wallet"/></label>
        <label className="grid gap-1 text-sm">Mobile Money number<input required type="tel" inputMode="tel" autoComplete="tel" maxLength={24} className="min-h-11 rounded-md border bg-background px-3" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="024 000 0000"/></label>
        <label className="grid gap-1 text-sm sm:col-span-2">Network<select value={provider} onChange={(e) => setProvider(e.target.value)} className="min-h-11 rounded-md border bg-background px-3">{networks.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}</select></label>
        <Button disabled={busy} className="min-h-11 sm:col-span-2">{busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/>Saving…</> : data?.destination ? 'Update payout destination' : 'Save payout destination'}</Button>
      </form>
      {message && <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{message}</p>}
      <div className="space-y-2"><h3 className="text-sm font-semibold">Recent {administrator ? 'weekly payouts' : 'payouts'}</h3>{(data?.payouts || []).length ? data!.payouts!.slice(0, 8).map((p) => <div key={p.reference} className="flex flex-wrap justify-between gap-2 border-t py-2 text-sm"><span>{new Date(p.created_at).toLocaleDateString()} · {ghc(p.amount)}</span><span className="capitalize text-muted-foreground">{p.status.replaceAll('_', ' ')}</span></div>) : <p className="text-sm text-muted-foreground">No payouts yet. Balances below the minimum remain available for a later weekly payout.</p>}</div>
    </CardContent>
  </Card>;
}
