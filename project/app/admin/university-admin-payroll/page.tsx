'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminLayout, AdminRouteGuard } from '@/components/admin/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase/client';
import { Check, Loader2, RefreshCw, Wallet } from 'lucide-react';
import { toast } from 'sonner';

type PayrollRow = {
  earning_id: string | null;
  assignment_id: string;
  administrator_name: string;
  administrator_email: string;
  university_name: string;
  student_count: number;
  vendor_count: number;
  qualified_count: number;
  rate_per_registration: number;
  amount: number;
  currency: string;
  status: 'preview' | 'draft' | 'approved' | 'paid' | 'void';
  payout_reference: string | null;
};
type PayrollData = { month_start: string; rate_per_qualified_registration: number; currency: string; rows: PayrollRow[] };

function lastMonthStart() {
  const now = new Date();
  const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${previousMonth.getFullYear()}-${String(previousMonth.getMonth() + 1).padStart(2, '0')}-01`;
}

function localMonthStart() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

export default function UniversityAdminPayrollPage() {
  return <AdminRouteGuard><AdminLayout><PayrollContent /></AdminLayout></AdminRouteGuard>;
}

function PayrollContent() {
  const [month, setMonth] = useState(lastMonthStart);
  const [data, setData] = useState<PayrollData | null>(null);
  const [rateInput, setRateInput] = useState('');
  const [references, setReferences] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: result, error } = await supabase.rpc('get_university_admin_payroll', { p_month_start: month });
    if (error) toast.error(error.message);
    else {
      const payroll = result as PayrollData;
      setData(payroll);
      setRateInput(String(payroll.rate_per_qualified_registration ?? 0));
    }
    setLoading(false);
  }, [month]);
  useEffect(() => { void load(); }, [load]);

  const total = useMemo(() => (data?.rows || []).reduce((sum, row) => sum + Number(row.amount || 0), 0), [data]);
  const monthIsComplete = month < localMonthStart();

  async function updateRate() {
    const rate = Number(rateInput);
    if (!Number.isFinite(rate) || rate < 0) { toast.error('Enter a valid GHS rate.'); return; }
    setWorking(true);
    const { error } = await supabase.rpc('set_university_admin_compensation_rate', { p_rate: rate });
    setWorking(false);
    if (error) toast.error(error.message); else { toast.success('Compensation rate saved.'); await load(); }
  }

  async function finalizeMonth() {
    setWorking(true);
    const { data: count, error } = await supabase.rpc('finalize_university_admin_month', { p_month_start: month });
    setWorking(false);
    if (error) toast.error(error.message); else { toast.success(`Monthly earnings calculated for ${count} administrator assignments.`); await load(); }
  }

  async function approveMonth() {
    setWorking(true);
    const { data: count, error } = await supabase.rpc('approve_university_admin_month', { p_month_start: month });
    setWorking(false);
    if (error) toast.error(error.message); else { toast.success(`${count} monthly earnings approved.`); await load(); }
  }

  async function markPaid(row: PayrollRow) {
    if (!row.earning_id) return;
    const reference = (references[row.earning_id] || '').trim();
    if (reference.length < 4) { toast.error('Enter the verified transfer reference for this administrator.'); return; }
    setWorking(true);
    const { error } = await supabase.rpc('mark_university_admin_earning_paid', { p_earning_id: row.earning_id, p_payout_reference: reference });
    setWorking(false);
    if (error) toast.error(error.message); else { toast.success(`Payment recorded for ${row.administrator_name}.`); await load(); }
  }

  return <div className="mx-auto w-full max-w-6xl space-y-5 p-4 pb-24 sm:p-6">
    <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">University Administrators</p><h1 className="mt-2 text-2xl font-bold sm:text-3xl">Monthly payroll</h1><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Review verified registrations, calculate the month, approve earnings, then record each transfer with its own reference.</p></div><Button variant="outline" className="min-h-11 shrink-0" onClick={() => void load()} disabled={loading}><RefreshCw className={`h-4 w-4 sm:mr-2 ${loading ? 'animate-spin' : ''}`} /><span className="hidden sm:inline">Refresh</span></Button></div>

    <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Wallet className="h-5 w-5 text-primary" />Programme rate and month</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"><div className="space-y-1.5"><Label htmlFor="admin-pay-rate">GHS per qualified registration</Label><Input id="admin-pay-rate" type="number" min="0" step="0.01" inputMode="decimal" value={rateInput} onChange={(event) => setRateInput(event.target.value)} /></div><div className="space-y-1.5"><Label htmlFor="admin-pay-month">Payroll month</Label><Input id="admin-pay-month" type="month" value={month.slice(0, 7)} onChange={(event) => event.target.value && setMonth(`${event.target.value}-01`)} /></div><Button className="min-h-11" onClick={() => void updateRate()} disabled={working || loading}>Save rate</Button></CardContent></Card>

    {data?.rate_per_qualified_registration === 0 && <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950">Set the approved rate before finalizing payroll. The system will not create zero-rate payment records.</div>}

    <div className="grid gap-3 sm:grid-cols-3"><Summary label="Administrators" value={data?.rows.length ?? 0} /><Summary label="Qualified registrations" value={(data?.rows || []).reduce((sum, row) => sum + Number(row.qualified_count || 0), 0)} /><Summary label="Month total" value={`GHS ${total.toFixed(2)}`} /></div>

    <div className="flex flex-col gap-2 rounded-xl border bg-white p-3 sm:flex-row sm:justify-end"><Button variant="outline" className="min-h-11" onClick={() => void finalizeMonth()} disabled={working || loading || !monthIsComplete || !data?.rate_per_qualified_registration}>Calculate month</Button><Button className="min-h-11" onClick={() => void approveMonth()} disabled={working || loading || !monthIsComplete || !data?.rows.some((row) => row.status === 'draft')}>Approve draft earnings</Button></div>

    {loading ? <Card><CardContent className="flex min-h-36 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></CardContent></Card> : !data?.rows.length ? <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No qualified registrations or payroll records for this month.</CardContent></Card> : <div className="space-y-3">{data.rows.map((row) => <Card key={row.assignment_id} className="overflow-hidden"><CardContent className="space-y-4 p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="font-semibold">{row.administrator_name}</p><p className="break-all text-xs text-muted-foreground">{row.administrator_email}</p><p className="mt-1 text-sm text-muted-foreground">{row.university_name}</p></div><Badge variant="outline" className="capitalize">{row.status.replace('_', ' ')}</Badge></div><div className="grid grid-cols-2 gap-2 rounded-xl bg-muted/40 p-3 text-sm sm:grid-cols-4"><div><p className="text-xs text-muted-foreground">Students</p><p className="font-semibold">{row.student_count}</p></div><div><p className="text-xs text-muted-foreground">Vendors</p><p className="font-semibold">{row.vendor_count}</p></div><div><p className="text-xs text-muted-foreground">Qualified</p><p className="font-semibold">{row.qualified_count}</p></div><div><p className="text-xs text-muted-foreground">Amount</p><p className="font-semibold">{row.currency} {Number(row.amount).toFixed(2)}</p></div></div>{row.status === 'approved' && <div className="grid gap-2 sm:grid-cols-[1fr_auto]"><Input aria-label={`Transfer reference for ${row.administrator_name}`} placeholder="Verified bank or mobile money transfer reference" value={references[row.earning_id || ''] || ''} onChange={(event) => setReferences((current) => ({ ...current, [row.earning_id || '']: event.target.value }))} /><Button className="min-h-11" onClick={() => void markPaid(row)} disabled={working}><Check className="mr-2 h-4 w-4" />Record payment</Button></div>}{row.status === 'paid' && <p className="break-all text-xs text-muted-foreground">Transfer reference: {row.payout_reference || 'Recorded'}{row.earning_id ? '' : ''}</p>}</CardContent></Card>)}</div>}
  </div>;
}

function Summary({ label, value }: { label: string; value: string | number }) {
  return <Card><CardContent className="p-4"><p className="text-2xl font-bold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></CardContent></Card>;
}
