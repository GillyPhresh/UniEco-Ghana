'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminLayout, AdminRouteGuard } from '@/components/admin/admin-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase/client';
import { Loader2, RefreshCw, Wallet } from 'lucide-react';
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
  amount: number;
  currency: string;
  status: string;
  payout_status: string | null;
  payout_reference: string | null;
  available_at: string | null;
  paid_at: string | null;
};
type PayrollData = { week_start: string; week_end: string; rate_per_registration: number; minimum_payout: number; currency: string; rows: PayrollRow[] };

function thisMonday() {
  const now = new Date();
  const day = (now.getDay() + 6) % 7;
  now.setDate(now.getDate() - day);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function mondayFor(value: string) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function UniversityAdminPayrollPage() {
  return <AdminRouteGuard><AdminLayout><PayrollContent /></AdminLayout></AdminRouteGuard>;
}

function PayrollContent() {
  const [week, setWeek] = useState(thisMonday);
  const [data, setData] = useState<PayrollData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: result, error } = await supabase.rpc('get_university_admin_weekly_payroll', { p_week_start: week });
    if (error) { setData(null); toast.error(error.message); }
    else setData(result as PayrollData);
    setLoading(false);
  }, [week]);
  useEffect(() => { void load(); }, [load]);

  const total = (data?.rows || []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const qualified = (data?.rows || []).reduce((sum, row) => sum + Number(row.qualified_count || 0), 0);
  const label = (status: string, payoutStatus: string | null, availableAt: string | null) => {
    if (payoutStatus) return payoutStatus.replaceAll('_', ' ');
    if (status === 'available' && availableAt && Date.parse(availableAt) > Date.now()) return 'review period';
    return status.replaceAll('_', ' ');
  };

  return <div className="mx-auto w-full max-w-6xl space-y-5 p-4 pb-24 sm:p-6">
    <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">University Administrators</p><h1 className="mt-2 text-2xl font-bold sm:text-3xl">Weekly administrator earnings</h1><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">GH₵2 for each qualified student or vendor registration. Earnings follow the existing seven-day review, minimum balance, and weekly referral payout process.</p></div><Button variant="outline" className="min-h-11 shrink-0" onClick={() => void load()} disabled={loading} aria-label="Refresh weekly earnings"><RefreshCw className={`h-4 w-4 sm:mr-2 ${loading ? 'animate-spin' : ''}`} /><span className="hidden sm:inline">Refresh</span></Button></div>

    <Card><CardContent className="grid gap-4 p-4 sm:grid-cols-[1fr_auto] sm:items-end sm:p-5"><div className="flex items-start gap-3"><Wallet className="mt-1 h-6 w-6 shrink-0 text-primary" /><div><p className="font-semibold">Weekly payout rules</p><p className="mt-1 text-sm leading-6 text-muted-foreground">One qualified referral earns GH₵2.00. A dual student-vendor account counts once. Earnings are held for seven days, then combined with any eligible student/vendor referral rewards. The shared minimum payout is GH₵{Number(data?.minimum_payout ?? 10).toFixed(2)}. No payout can be sent from this page.</p></div></div><label className="grid gap-1.5 text-sm sm:w-56">Week (choose any day)<Input type="date" value={week} onChange={(event) => event.target.value && setWeek(mondayFor(event.target.value))} /></label></CardContent></Card>

    <div className="grid gap-3 sm:grid-cols-3"><Summary label="Administrators with earnings" value={data?.rows.length ?? 0} /><Summary label="Qualified registrations" value={qualified} /><Summary label="Week total" value={`GH₵${total.toFixed(2)}`} /></div>

    {loading ? <Card><CardContent className="flex min-h-36 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></CardContent></Card> : !data?.rows.length ? <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No qualified registrations or earnings for the week beginning {new Date(`${week}T12:00:00`).toLocaleDateString('en-GH')}.</CardContent></Card> : <div className="space-y-3">{data.rows.map((row) => <Card key={row.assignment_id} className="overflow-hidden"><CardContent className="space-y-4 p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="font-semibold">{row.administrator_name}</p><p className="break-all text-xs text-muted-foreground">{row.administrator_email}</p><p className="mt-1 text-sm text-muted-foreground">{row.university_name}</p></div><Badge variant="outline" className="capitalize">{label(row.status, row.payout_status, row.available_at)}</Badge></div><div className="grid grid-cols-2 gap-2 rounded-xl bg-muted/40 p-3 text-sm sm:grid-cols-4"><div><p className="text-xs text-muted-foreground">Students</p><p className="font-semibold">{row.student_count}</p></div><div><p className="text-xs text-muted-foreground">Vendors</p><p className="font-semibold">{row.vendor_count}</p></div><div><p className="text-xs text-muted-foreground">Qualified (unique)</p><p className="font-semibold">{row.qualified_count}</p></div><div><p className="text-xs text-muted-foreground">Earnings</p><p className="font-semibold">{row.currency} {Number(row.amount).toFixed(2)}</p></div></div>{row.payout_reference && <p className="break-all text-xs text-muted-foreground">Payout reference: {row.payout_reference}{row.paid_at ? ` · paid ${new Date(row.paid_at).toLocaleDateString('en-GH')}` : ''}</p>}</CardContent></Card>)}</div>}
  </div>;
}

function Summary({ label, value }: { label: string; value: string | number }) {
  return <Card><CardContent className="p-4"><p className="text-2xl font-bold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></CardContent></Card>;
}
