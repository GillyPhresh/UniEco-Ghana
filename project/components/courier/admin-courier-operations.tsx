'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bike, ClipboardCheck, PackageCheck, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { COURIER_PROGRAM_KEY } from '@/components/courier/courier-entry';
import { useAuth } from '@/lib/auth/auth-context';
import { courierGateway, CourierProgramUnavailable } from '@/lib/data/courier-client';
import {
  COURIER_VEHICLES, JOB_LABELS, PARCEL_SIZES, courierFeeChoices, needsMotorVerification, normalizeCourierPhone, showCourierFee,
  type AdminCourierApplication, type AdminCourierDashboard, type AdminCourierJob, type CourierReviewDecision,
} from '@/lib/courier/domain';

const selection = 'w-full min-h-[44px] rounded-lg border border-border bg-background px-2.5 text-sm';
type Act = (action: () => Promise<unknown>, success: string) => Promise<void>;

export function AdminCourierOperations() {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);
  if (user?.role !== 'super_admin') return null;
  return <section className="rounded-xl border border-border bg-card p-3 sm:p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-sm font-bold sm:text-base"><Bike className="h-5 w-5 text-primary" aria-hidden="true" /> Courier operations</h2>
      <Button type="button" variant="outline" className="min-h-[44px]" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>
        {expanded ? 'Close courier desk' : 'Open courier desk'}
      </Button>
    </div>
    {expanded && <CourierDesk key={user.id} actorId={user.id} />}
  </section>;
}

function CourierDesk({ actorId }: { actorId: string }) {
  const queryClient = useQueryClient();
  const query = useQuery<AdminCourierDashboard>({
    queryKey: ['admin-courier-operations', actorId],
    queryFn: () => courierGateway.adminDashboard(),
    retry: false,
  });
  const dashboard: AdminCourierDashboard | undefined = query.data;
  const [section, setSection] = useState<'applications' | 'dispatch'>('applications');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [note, setNote] = useState('');

  const act: Act = async (action, success) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setNote('');
    try {
      await action();
      setNote(success);
      await query.refetch();
      void queryClient.invalidateQueries({ queryKey: COURIER_PROGRAM_KEY });
    } catch (error) { setNote(error instanceof Error ? error.message : 'Unable to update courier operations.'); }
    finally { lock.current = false; setBusy(false); }
  };

  if (query.isPending) return <p role="status" className="pt-3 text-sm text-muted-foreground">Loading courier operations…</p>;
  if (query.error instanceof CourierProgramUnavailable) return <p className="pt-3 text-sm text-muted-foreground">Courier operations are not available in this environment.</p>;
  if (query.isError || !dashboard) return <div role="alert" className="space-y-2 pt-3 text-sm">
    <p>Could not open the courier desk.</p><Button type="button" variant="outline" onClick={() => void query.refetch()}>Try again</Button>
  </div>;
  return <div className="mt-3 space-y-4 border-t border-border pt-3">
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background p-3">
      <p className="text-sm font-semibold">Programme: {dashboard.open ? 'open' : 'closed'}</p>
      {dashboard.open ? <Button type="button" variant="outline" disabled={busy} className="min-h-[44px]"
        onClick={() => void act(() => courierGateway.setProgram(false, false), 'New applications and dispatch paused. Active jobs may finish.')}>Pause intake & dispatch</Button>
        : <div className="basis-full space-y-2">
          <label className="flex items-start gap-2 text-xs text-muted-foreground"><input type="checkbox" className="mt-0.5" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />
            <span>We confirmed the operating licence or licensed partner, safety and insurance checks, and courier compensation arrangements.</span>
          </label>
          <Button type="button" disabled={busy || !confirmed} className="min-h-[44px]" onClick={() => void act(async () => {
            await courierGateway.setProgram(true, confirmed);
            setConfirmed(false);
          }, 'Courier applications and dispatch opened.')}>Open programme</Button>
        </div>}
    </div>
    {note && <p role="status" className="rounded-lg bg-muted p-2.5 text-sm">{note}</p>}
    <div className="grid grid-cols-2 gap-2" role="group" aria-label="Courier operations view">
      <Button type="button" variant={section === 'applications' ? 'default' : 'outline'} aria-pressed={section === 'applications'} className="min-h-[44px] gap-1.5" onClick={() => setSection('applications')}>
        <ClipboardCheck className="h-4 w-4" aria-hidden="true" /> Applications
      </Button>
      <Button type="button" variant={section === 'dispatch' ? 'default' : 'outline'} aria-pressed={section === 'dispatch'} className="min-h-[44px] gap-1.5" onClick={() => setSection('dispatch')}>
        <PackageCheck className="h-4 w-4" aria-hidden="true" /> Dispatch
      </Button>
    </div>
    {section === 'applications'
      ? dashboard.applications.length ? <div className="grid gap-2 lg:grid-cols-2">{dashboard.applications.map(item => <ApplicationReview key={item.id + ':' + item.status} item={item} act={act} busy={busy} />)}</div>
        : <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">No courier applications.</p>
      : dashboard.jobs.length ? <div className="grid gap-2 lg:grid-cols-2">{dashboard.jobs.map(job => <DispatchCard key={job.id + ':' + job.state} job={job} open={dashboard.open} act={act} busy={busy} />)}</div>
        : <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">No courier requests from shops.</p>}
  </div>;
}

function ApplicationReview({ item, act, busy }: { item: AdminCourierApplication; act: Act; busy: boolean }) {
  const [decision, setDecision] = useState<CourierReviewDecision | ''>('');
  const [checked, setChecked] = useState(false);
  const [expires, setExpires] = useState(item.verified_until ?? '');
  const phone = normalizeCourierPhone(item.phone);
  const motor = needsMotorVerification(item.vehicle);
  const options: CourierReviewDecision[] = item.status === 'approved' ? ['approved','paused']
    : item.status === 'paused' || item.status === 'pending' ? ['approved','declined'] : [];
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!decision) return;
    const action = decision;
    void act(async () => { await courierGateway.review(item.id, action, expires || null, checked); setDecision(''); setChecked(false); }, 'Review saved.');
  }
  return <article className="space-y-2 rounded-xl border border-border bg-background p-3">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0"><h3 className="break-words font-semibold">{item.display_name}</h3><p className="text-xs text-muted-foreground">{COURIER_VEHICLES[item.vehicle].title} · {item.campus}</p></div>
      <span className="rounded-full bg-muted px-2 py-1 text-xs font-semibold capitalize">{item.status}</span>
    </div>
    {phone && <a className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-primary" href={`tel:${phone}`}><Phone className="h-4 w-4" aria-hidden="true" /> {phone}</a>}
    {options.length > 0 && <form className="space-y-2" onSubmit={submit}>
      <select aria-label={`Review decision for ${item.display_name}`} className={selection} value={decision} onChange={event => setDecision(event.target.value as CourierReviewDecision | '')}>
        <option value="">Select decision</option>
        {options.map(option => <option key={option} value={option}>{option === 'approved' ? item.status === 'approved' ? 'Renew approval' : 'Approve' : option === 'paused' ? 'Pause' : 'Decline'}</option>)}
      </select>
      {decision === 'approved' && <>
        {motor && <div className="space-y-1">
          <Label htmlFor={`verification-${item.id}`}>Verified through</Label>
          <Input type="date" id={`verification-${item.id}`} required value={expires} onChange={event => setExpires(event.target.value)} className="min-h-[44px]" />
        </div>}
        <label className="flex items-start gap-2 text-xs text-muted-foreground"><input type="checkbox" className="mt-0.5" checked={checked} onChange={event => setChecked(event.target.checked)} required />
          <span>{motor ? 'Identity, eligibility, licence, vehicle documents and insurance checked.' : 'Identity, eligibility and delivery safety checked.'}</span>
        </label>
      </>}
      <Button type="submit" disabled={busy || !decision || (decision === 'approved' && (!checked || (motor && !expires)))} className="min-h-[44px]">Save review</Button>
    </form>}
  </article>;
}

function DispatchCard({ job, open, act, busy }: { job: AdminCourierJob; open: boolean; act: Act; busy: boolean }) {
  const [fee, setFee] = useState('');
  const eligible = job.state === 'requested' || job.state === 'offered';
  return <article className="space-y-2 rounded-xl border border-border bg-background p-3">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0"><h3 className="break-words font-semibold">{job.reference || 'Delivery order'}</h3><p className="text-xs text-muted-foreground">{job.shop} · {job.campus} · {PARCEL_SIZES[job.parcel_size]}</p></div>
      <span className="rounded-full bg-muted px-2 py-1 text-xs font-semibold">{JOB_LABELS[job.state]}</span>
    </div>
    {job.courier && <p className="text-sm">Assigned courier: {job.courier}</p>}
    {job.fee_pesewas !== null && <p className="text-sm font-semibold text-primary">Offer: {showCourierFee(job.fee_pesewas)}</p>}
    {eligible && open && <div className="flex flex-wrap items-center gap-2">
      <select aria-label={`Courier fee for ${job.reference || 'order'}`} className={`${selection} sm:w-auto`} onChange={event => setFee(event.target.value)} value={fee}>
        <option value="">Select fee (up to {showCourierFee(job.budget_pesewas)})</option>
        {courierFeeChoices(job.budget_pesewas).map(value => <option key={value} value={value}>{showCourierFee(value)}</option>)}
      </select>
      <Button type="button" className="min-h-[44px]" disabled={!fee || busy} onClick={() => void act(() => courierGateway.dispatch(job.id, 'publish', Number(fee)), 'Offer published for approved couriers.')}>
        {job.state === 'offered' ? 'Renew offer' : 'Publish offer'}
      </Button>
    </div>}
    {(eligible || job.state === 'claimed') && <Button type="button" variant="outline" className="min-h-[44px]" disabled={busy}
      onClick={() => void act(() => courierGateway.dispatch(job.id, 'cancel'), 'Courier request withdrawn. The original order remains.')}>Withdraw job</Button>}
  </article>;
}
